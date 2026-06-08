import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dispatch core (Module 10, Wave 3d) — `dispatchDuePost`.
 *
 * Behaviours under test:
 *  - IDEMPOTENT: only acts on `status:"publishing"`; any other status → skipped.
 *  - any platform `externalId` → published + postedAt + externalIds persisted.
 *  - all `skipped:"not_configured"` → dev: stub-published; prod: failed
 *    `no_connected_platform`.
 *  - publish throws → failed + error.
 *  - validation failure (IG-needs-media) → failed before any publish.
 *
 * `publishSocialPost`, `withTenant`, and `isProductionRuntime` are mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ---- mocked publish adapter ----
const publishMock = vi.fn();
vi.mock("@/lib/social/publish", () => ({
  publishSocialPost: (...a: unknown[]) => publishMock(...a),
}));

// ---- mocked production flag ----
let isProd = false;
vi.mock("@/lib/secrets", () => ({
  isProductionRuntime: () => isProd,
}));

// ---- fake tenant tx ----
type FakeTx = {
  socialPost: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};
let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

import { dispatchDuePost } from "@/lib/social/dispatch";

const ORG = "11111111-1111-4111-8111-111111111111";
const POST = "22222222-2222-4222-8222-222222222222";

function postRow(overrides: Record<string, unknown> = {}) {
  return {
    id: POST,
    status: "publishing",
    platforms: ["facebook"],
    caption: "Hello world",
    mediaUrl: null,
    approvedCreativeUrls: [],
    establishmentId: null,
    ...overrides,
  };
}

beforeEach(() => {
  isProd = false;
  publishMock.mockReset();
  tx = {
    socialPost: {
      findFirst: vi.fn().mockResolvedValue(postRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  withTenantImpl = async (_orgId, fn) => fn(tx);
});

describe("idempotency", () => {
  it("skips a post that is not in the publishing state", async () => {
    tx.socialPost.findFirst.mockResolvedValueOnce(postRow({ status: "published" }));
    const res = await dispatchDuePost(POST, ORG);
    expect(res.status).toBe("skipped");
    expect(publishMock).not.toHaveBeenCalled();
    expect(tx.socialPost.updateMany).not.toHaveBeenCalled();
  });

  it("skips when the post is not found", async () => {
    tx.socialPost.findFirst.mockResolvedValueOnce(null);
    const res = await dispatchDuePost(POST, ORG);
    expect(res.status).toBe("skipped");
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe("publish outcomes", () => {
  it("any externalId → published with postedAt + externalIds", async () => {
    publishMock.mockResolvedValueOnce([
      { platform: "facebook", ok: true, externalId: "fb_999" },
    ]);
    const res = await dispatchDuePost(POST, ORG);
    expect(res.status).toBe("published");
    expect(res).toMatchObject({ externalIds: { facebook: "fb_999" } });

    const writeArg = tx.socialPost.updateMany.mock.calls[0]![0];
    expect(writeArg.where).toEqual({ id: POST, status: "publishing" });
    expect(writeArg.data.status).toBe("published");
    expect(writeArg.data.postedAt).toBeInstanceOf(Date);
    expect(writeArg.data.externalIds).toEqual({ facebook: "fb_999" });
  });

  it("all not_configured + dev → stub published (demo flows)", async () => {
    isProd = false;
    publishMock.mockResolvedValueOnce([
      { platform: "facebook", ok: false, skipped: "not_configured" },
    ]);
    const res = await dispatchDuePost(POST, ORG);
    expect(res.status).toBe("published");
    const writeArg = tx.socialPost.updateMany.mock.calls[0]![0];
    expect(writeArg.data.status).toBe("published");
    expect(writeArg.data.error).toMatch(/stub/);
  });

  it("all not_configured + prod → failed no_connected_platform (Retry-able)", async () => {
    isProd = true;
    publishMock.mockResolvedValueOnce([
      { platform: "facebook", ok: false, skipped: "not_configured" },
    ]);
    const res = await dispatchDuePost(POST, ORG);
    expect(res.status).toBe("failed");
    expect(res).toMatchObject({ error: "no_connected_platform" });
    const writeArg = tx.socialPost.updateMany.mock.calls[0]![0];
    expect(writeArg.data.status).toBe("failed");
    expect(writeArg.data.error).toBe("no_connected_platform");
  });

  it("publish throws → failed + error", async () => {
    publishMock.mockRejectedValueOnce(new Error("boom"));
    const res = await dispatchDuePost(POST, ORG);
    expect(res.status).toBe("failed");
    expect(res).toMatchObject({ error: expect.stringContaining("boom") });
  });

  it("some platforms errored, none succeeded → failed with per-platform errors", async () => {
    publishMock.mockResolvedValueOnce([
      { platform: "facebook", ok: false, error: "graph_http_400" },
    ]);
    const res = await dispatchDuePost(POST, ORG);
    expect(res.status).toBe("failed");
    expect(res).toMatchObject({ error: expect.stringContaining("graph_http_400") });
  });
});

describe("pre-publish validation", () => {
  it("Instagram-without-media → failed BEFORE any publish", async () => {
    tx.socialPost.findFirst.mockResolvedValueOnce(
      postRow({ platforms: ["instagram"], mediaUrl: null, approvedCreativeUrls: [] }),
    );
    const res = await dispatchDuePost(POST, ORG);
    expect(res.status).toBe("failed");
    expect(publishMock).not.toHaveBeenCalled();
    const writeArg = tx.socialPost.updateMany.mock.calls[0]![0];
    expect(writeArg.data.status).toBe("failed");
  });
});
