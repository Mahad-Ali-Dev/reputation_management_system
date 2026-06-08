import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * dispatch-social-posts cron (Module 10, Wave 3d) — integration with mocks.
 *
 * Proves:
 *  - unauthorized (verifyCronRequest=false) → 401, no query.
 *  - take<=200 bound is passed to the query.
 *  - due `scheduled` rows are claimed (scheduled→publishing) exactly once and
 *    dispatched; a claim that returns count:0 (another tick won) is skipped.
 *  - stale rows (scheduledFor far in the past) are marked failed:"stale_skipped"
 *    and NOT dispatched.
 *  - fail-soft: a 42P01 query error → 200 {skipped:"not_migrated"} (no 500).
 *
 * `prisma`, `withTenant`, `dispatchDuePost`, `verifyCronRequest` are mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

let cronAllowed = true;
vi.mock("@/lib/secrets", () => ({
  verifyCronRequest: () => cronAllowed,
}));

const findMany = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: { socialPost: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

// withTenant runs the callback against a fake tx whose updateMany result is
// programmable per-call (to simulate claim win/lose).
type FakeTx = { socialPost: { updateMany: ReturnType<typeof vi.fn> } };
const updateMany = vi.fn();
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (_orgId: string, fn: (tx: FakeTx) => unknown) =>
    fn({ socialPost: { updateMany } }),
}));

const dispatchDuePost = vi.fn(async (..._a: unknown[]) => ({ status: "published", postId: "p", externalIds: {} }));
vi.mock("@/lib/social/dispatch", () => ({
  dispatchDuePost: (...a: unknown[]) => dispatchDuePost(...a),
}));

import { GET } from "@/app/api/cron/dispatch-social-posts/route";

const ORG = "11111111-1111-4111-8111-111111111111";

function req(): Parameters<typeof GET>[0] {
  return {
    headers: { get: () => "Bearer test" },
  } as unknown as Parameters<typeof GET>[0];
}

beforeEach(() => {
  cronAllowed = true;
  findMany.mockReset();
  updateMany.mockReset();
  dispatchDuePost.mockClear();
  findMany.mockResolvedValue([]);
  updateMany.mockResolvedValue({ count: 1 });
});

describe("auth", () => {
  it("401 when verifyCronRequest is false; no query", async () => {
    cronAllowed = false;
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("query bounds", () => {
  it("passes take:200 and status:scheduled / scheduledFor<=now", async () => {
    await GET(req());
    const arg = findMany.mock.calls[0]![0];
    expect(arg.take).toBe(200);
    expect(arg.where.status).toBe("scheduled");
    expect(arg.where.scheduledFor.lte).toBeInstanceOf(Date);
    expect(arg.orderBy).toEqual({ scheduledFor: "asc" });
  });
});

describe("claim + dispatch", () => {
  it("claims a due row once and dispatches it", async () => {
    findMany.mockResolvedValueOnce([
      { id: "post-1", organizationId: ORG, scheduledFor: new Date() },
    ]);
    updateMany.mockResolvedValueOnce({ count: 1 }); // claim wins
    const res = await GET(req());
    const body = await res.json();

    // The claim is a conditional scheduled→publishing update.
    const claimArg = updateMany.mock.calls[0]![0];
    expect(claimArg.where).toEqual({ id: "post-1", status: "scheduled" });
    expect(claimArg.data).toEqual({ status: "publishing" });

    expect(dispatchDuePost).toHaveBeenCalledTimes(1);
    expect(dispatchDuePost).toHaveBeenCalledWith("post-1", ORG);
    expect(body.dispatched).toBe(1);
  });

  it("skips a row whose claim returns count:0 (another tick already won)", async () => {
    findMany.mockResolvedValueOnce([
      { id: "post-1", organizationId: ORG, scheduledFor: new Date() },
    ]);
    updateMany.mockResolvedValueOnce({ count: 0 }); // lost the race
    const res = await GET(req());
    const body = await res.json();
    expect(dispatchDuePost).not.toHaveBeenCalled();
    expect(body.skipped).toBe(1);
  });
});

describe("stale skip", () => {
  it("marks a far-past scheduled post failed:stale_skipped and does NOT dispatch", async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    findMany.mockResolvedValueOnce([{ id: "post-old", organizationId: ORG, scheduledFor: old }]);
    updateMany.mockResolvedValueOnce({ count: 1 });
    const res = await GET(req());
    const body = await res.json();

    const markArg = updateMany.mock.calls[0]![0];
    expect(markArg.where).toEqual({ id: "post-old", status: "scheduled" });
    expect(markArg.data.status).toBe("failed");
    expect(markArg.data.error).toBe("stale_skipped");

    expect(dispatchDuePost).not.toHaveBeenCalled();
    expect(body.stale).toBe(1);
  });
});

describe("fail-soft", () => {
  it("42P01 query error → 200 {skipped:'not_migrated'} (no 500)", async () => {
    findMany.mockRejectedValueOnce(Object.assign(new Error("no relation"), { code: "42P01" }));
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe("not_migrated");
  });

  it("no due rows → ok with zero counts", async () => {
    findMany.mockResolvedValueOnce([]);
    const res = await GET(req());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.dispatched).toBe(0);
  });
});
