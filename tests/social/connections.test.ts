import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Social connections + validation (Module 10, Wave 3d).
 *
 * The single provider-mapping point: `meta` → Facebook + Instagram (the combined
 * OAuth), `x`/`twitter` → twitter, `linkedin` → linkedin; everything else → [].
 * Get this wrong and connection-gating mis-fires.
 *
 * `getConnectedPlatforms` is exercised with a mocked `withTenant` so it's offline
 * + deterministic; `validatePost` is pure.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

type FakeTx = { connection: { findMany: ReturnType<typeof vi.fn> } };
let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

import {
  getConnectedPlatforms,
  platformToProvider,
  providerToPlatforms,
  validatePost,
  PLATFORM_LIMITS,
} from "@/lib/social/connections";

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  tx = { connection: { findMany: vi.fn().mockResolvedValue([]) } };
  withTenantImpl = async (_orgId, fn) => fn(tx);
});

describe("providerToPlatforms — meta maps to BOTH facebook + instagram", () => {
  it("meta → [facebook, instagram]", () => {
    expect(providerToPlatforms("meta")).toEqual(["facebook", "instagram"]);
  });
  it("is case-insensitive", () => {
    expect(providerToPlatforms("META")).toEqual(["facebook", "instagram"]);
  });
  it("x and twitter both → [twitter]", () => {
    expect(providerToPlatforms("x")).toEqual(["twitter"]);
    expect(providerToPlatforms("twitter")).toEqual(["twitter"]);
  });
  it("linkedin → [linkedin]", () => {
    expect(providerToPlatforms("linkedin")).toEqual(["linkedin"]);
  });
  it("non-social providers → []", () => {
    expect(providerToPlatforms("google_business")).toEqual([]);
    expect(providerToPlatforms("shopify")).toEqual([]);
    expect(providerToPlatforms("unknown")).toEqual([]);
  });
});

describe("platformToProvider — inverse mapping (FB+IG ride meta)", () => {
  it("facebook + instagram → meta", () => {
    expect(platformToProvider("facebook")).toBe("meta");
    expect(platformToProvider("instagram")).toBe("meta");
  });
  it("twitter → x, linkedin → linkedin", () => {
    expect(platformToProvider("twitter")).toBe("x");
    expect(platformToProvider("linkedin")).toBe("linkedin");
  });
});

describe("getConnectedPlatforms", () => {
  it("an active meta connection lights up facebook AND instagram", async () => {
    tx.connection.findMany.mockResolvedValueOnce([{ provider: "meta" }]);
    const set = await getConnectedPlatforms(ORG);
    expect(set.has("facebook")).toBe(true);
    expect(set.has("instagram")).toBe(true);
    expect(set.has("twitter")).toBe(false);
    expect(set.has("linkedin")).toBe(false);
  });

  it("dedupes when meta + linkedin are both connected", async () => {
    tx.connection.findMany.mockResolvedValueOnce([{ provider: "meta" }, { provider: "linkedin" }]);
    const set = await getConnectedPlatforms(ORG);
    expect([...set].sort()).toEqual(["facebook", "instagram", "linkedin"]);
  });

  it("only queries active connections", async () => {
    await getConnectedPlatforms(ORG);
    const arg = tx.connection.findMany.mock.calls[0]![0];
    expect(arg.where.status).toBe("active");
  });

  it("fail-soft → empty set when the table is not migrated (42P01)", async () => {
    withTenantImpl = async () => {
      throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
    };
    const set = await getConnectedPlatforms(ORG);
    expect(set.size).toBe(0);
  });

  it("returns empty set when nothing connected", async () => {
    const set = await getConnectedPlatforms(ORG);
    expect(set.size).toBe(0);
  });
});

describe("validatePost — per-platform rules", () => {
  it("flags Instagram without media", () => {
    const res = validatePost({ platforms: ["instagram"], caption: "hello world", media: [] });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "media_required")).toBe(true);
  });

  it("accepts Instagram WITH media", () => {
    const res = validatePost({
      platforms: ["instagram"],
      caption: "hello",
      media: ["https://cdn/x.jpg"],
    });
    expect(res.ok).toBe(true);
  });

  it("flags X over 280 chars", () => {
    const long = "a".repeat(PLATFORM_LIMITS.twitter.maxChars + 1);
    const res = validatePost({ platforms: ["twitter"], caption: long });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "too_long")).toBe(true);
  });

  it("accepts a valid multi-platform post (facebook + twitter)", () => {
    const res = validatePost({
      platforms: ["facebook", "twitter"],
      caption: "Come visit us today!",
    });
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
  });

  it("rejects an empty post (no caption, no media)", () => {
    const res = validatePost({ platforms: ["facebook"], caption: "", media: [] });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "empty")).toBe(true);
  });

  it("rejects when no platform is selected", () => {
    const res = validatePost({ platforms: [], caption: "hi" });
    expect(res.ok).toBe(false);
    expect(res.issues[0]!.code).toBe("no_platform");
  });

  it("flags an unknown platform string", () => {
    const res = validatePost({ platforms: ["myspace"], caption: "hi" });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "unknown_platform")).toBe(true);
  });
});
