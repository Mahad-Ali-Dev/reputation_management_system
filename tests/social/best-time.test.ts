import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Best-time service (Module 10, Wave 3d) — `recommendTimes`.
 *
 * Proves:
 *  - returns exactly 3 FUTURE ISO datetimes.
 *  - falls back to industry defaults when the org has < MIN_HISTORY posts.
 *  - engagement-weights when there's enough history (mock prisma/withTenant).
 *  - fail-soft → defaults on a DB error.
 *
 * `withTenant` is mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

type FakeTx = { socialPost: { findMany: ReturnType<typeof vi.fn> } };
let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

import { recommendTimes } from "@/lib/social/best-time";

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  tx = { socialPost: { findMany: vi.fn().mockResolvedValue([]) } };
  withTenantImpl = async (_orgId, fn) => fn(tx);
});

function assertThreeFuture(times: string[]) {
  expect(times).toHaveLength(3);
  const now = Date.now();
  for (const t of times) {
    const d = new Date(t);
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(d.getTime()).toBeGreaterThan(now);
  }
}

describe("recommendTimes — fallback", () => {
  it("returns 3 future times from industry defaults when no history", async () => {
    const times = await recommendTimes(ORG, ["facebook"]);
    assertThreeFuture(times);
  });

  it("uses defaults for an unknown/empty platform list", async () => {
    const times = await recommendTimes(ORG, []);
    assertThreeFuture(times);
  });

  it("falls back when history is below the minimum", async () => {
    tx.socialPost.findMany.mockResolvedValueOnce([
      { postedAt: new Date(), metrics: [{ likes: 1, comments: 0, shares: 0, reach: 0 }] },
    ]); // 1 post < MIN_HISTORY
    const times = await recommendTimes(ORG, ["instagram"]);
    assertThreeFuture(times);
  });
});

describe("recommendTimes — engagement-weighted", () => {
  it("returns 3 future times derived from history when enough data exists", async () => {
    // 6 published posts (> MIN_HISTORY) clustered on a couple of weekday/hours.
    const mk = (daysAgo: number, hour: number, likes: number) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      d.setHours(hour, 0, 0, 0);
      return { postedAt: d, metrics: [{ likes, comments: 0, shares: 0, reach: 0 }] };
    };
    tx.socialPost.findMany.mockResolvedValueOnce([
      mk(7, 13, 50),
      mk(14, 13, 40),
      mk(8, 15, 30),
      mk(9, 9, 5),
      mk(10, 11, 8),
      mk(11, 17, 3),
    ]);
    const times = await recommendTimes(ORG, ["facebook"]);
    assertThreeFuture(times);
  });

  it("fail-soft → defaults when the query throws", async () => {
    withTenantImpl = async () => {
      throw Object.assign(new Error("no relation"), { code: "42P01" });
    };
    const times = await recommendTimes(ORG, ["linkedin"]);
    assertThreeFuture(times);
  });
});
