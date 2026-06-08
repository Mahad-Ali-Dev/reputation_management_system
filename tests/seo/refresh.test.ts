import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit — `refreshSeoForDueOrgs` / `refreshOrg`.
 *
 * Proves: stage-1 unscoped select feeds per-org `withTenant` work; with ALL
 * adapters `{available:false}` a reputation-only `SeoSnapshot` is still upserted;
 * the per-run org cap is respected; one failing org does not abort the batch;
 * stage-1 fails soft to [] on an unmigrated DB.
 *
 * `prisma`, `withTenant`, every adapter, `buildOverviewMetrics`,
 * `generateExecSummary`, and the read queries are mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ── prisma (stage-1 select) ─────────────────────────────────────
const prismaState = vi.hoisted(() => ({
  orgFindMany: vi.fn(async (_args?: { take?: number }) => [] as { id: string }[]),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: { organization: { findMany: (...a: unknown[]) => prismaState.orgFindMany(...(a as [])) } },
}));

// ── withTenant (per-org stage-2) ────────────────────────────────
const tenantState = vi.hoisted(() => ({
  snapshotCreate: vi.fn(async (_args?: { data: Record<string, unknown> }) => ({ id: "snap-1" })),
  latestSnapshot: null as { generatedAt: Date } | null,
  estId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" as string | null,
  throwForOrg: null as string | null,
}));
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (orgId: string, fn: (tx: unknown) => unknown) => {
    if (tenantState.throwForOrg === orgId) throw new Error("tenant boom");
    const tx = {
      seoSnapshot: {
        findFirst: vi.fn(async () => tenantState.latestSnapshot),
        create: (...a: unknown[]) => tenantState.snapshotCreate(...(a as [])),
      },
      establishment: { findFirst: vi.fn(async () => (tenantState.estId ? { id: tenantState.estId } : null)) },
      keywordRank: { createMany: vi.fn(async () => ({ count: 0 })) },
      geoGridSnapshot: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    };
    return fn(tx);
  },
}));

// ── adapters — all unavailable by default ───────────────────────
const adapters = vi.hoisted(() => ({
  fetchGbpInsights: vi.fn(async () => ({ available: false })),
  fetchGa4Summary: vi.fn(async () => ({ available: false })),
  fetchKeywordRanks: vi.fn(async () => ({ available: false })),
  fetchGeoGrid: vi.fn(async () => ({ available: false })),
  runCitationAudit: vi.fn(async () => ({ available: false, rows: [] })),
}));
vi.mock("@/lib/seo/adapters/gbp-insights", () => ({
  fetchGbpInsights: (...a: unknown[]) => adapters.fetchGbpInsights(...(a as [])),
}));
vi.mock("@/lib/seo/adapters/ga4", () => ({
  fetchGa4Summary: (...a: unknown[]) => adapters.fetchGa4Summary(...(a as [])),
}));
vi.mock("@/lib/seo/adapters/rank-tracker", () => ({
  fetchKeywordRanks: (...a: unknown[]) => adapters.fetchKeywordRanks(...(a as [])),
  fetchGeoGrid: (...a: unknown[]) => adapters.fetchGeoGrid(...(a as [])),
}));
vi.mock("@/lib/seo/citation-audit", () => ({
  runCitationAudit: (...a: unknown[]) => adapters.runCitationAudit(...(a as [])),
}));

// ── overview + exec summary + queries ───────────────────────────
const overviewMetrics = vi.hoisted(() => ({
  value: {
    rangeDays: 30,
    reputation: {
      reviewCount: 10,
      avgRating: 4.5,
      responseRate: 80,
      scanCount: 0,
      npsScore: null,
      conversationCount: 0,
      recentReviewVelocity: 10,
      daysSinceLastReview: 3,
      reviewsPerDay: [],
      ratingBreakdown: [],
    },
    seo: { reputationScore: 0, scoreFactors: [], localPackPosition: null, websiteSessions: null },
    connected: { ga4: false, gbp: false, rankTracking: false },
  },
}));
vi.mock("@/lib/seo/overview", () => ({
  buildOverviewMetrics: vi.fn(async () => overviewMetrics.value),
}));
vi.mock("@/lib/seo/exec-summary", () => ({
  generateExecSummary: vi.fn(async () => ({ summary: "Fallback.", generatedAt: new Date(), ai: false })),
}));
vi.mock("@/lib/seo/queries", () => ({
  listKeywordRanks: vi.fn(async () => []),
  getCitationAudit: vi.fn(async () => []),
}));

import { refreshSeoForDueOrgs, refreshOrg, selectDueOrgs } from "@/lib/seo/refresh";

beforeEach(() => {
  prismaState.orgFindMany.mockReset().mockResolvedValue([]);
  tenantState.snapshotCreate.mockClear();
  tenantState.latestSnapshot = null;
  tenantState.estId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  tenantState.throwForOrg = null;
  for (const a of Object.values(adapters)) a.mockClear();
  adapters.fetchGbpInsights.mockResolvedValue({ available: false });
  adapters.fetchGa4Summary.mockResolvedValue({ available: false });
  adapters.fetchKeywordRanks.mockResolvedValue({ available: false });
  adapters.fetchGeoGrid.mockResolvedValue({ available: false });
  adapters.runCitationAudit.mockResolvedValue({ available: false, rows: [] });
});

describe("selectDueOrgs", () => {
  it("returns the org ids from the unscoped stage-1 select", async () => {
    prismaState.orgFindMany.mockResolvedValueOnce([{ id: ORG_A }, { id: ORG_B }]);
    expect(await selectDueOrgs(25)).toEqual([ORG_A, ORG_B]);
    expect(prismaState.orgFindMany).toHaveBeenCalledTimes(1);
  });

  it("fails soft to [] on an unmigrated DB (42P01)", async () => {
    prismaState.orgFindMany.mockRejectedValueOnce(Object.assign(new Error("x"), { code: "42P01" }));
    expect(await selectDueOrgs(25)).toEqual([]);
  });
});

describe("refreshOrg — reputation-only when all adapters unavailable", () => {
  it("still upserts a snapshot (score from reputation factors)", async () => {
    const ok = await refreshOrg(ORG_A, { establishmentId: "est-1" });
    expect(ok).toBe(true);
    expect(tenantState.snapshotCreate).toHaveBeenCalledTimes(1);
    const created = tenantState.snapshotCreate.mock.calls[0]![0] as {
      data: { reputationScore: number; localPackPosition: number | null; websiteSessions: number | null };
    };
    // No SEO data → local pack + sessions are null, score derives from reputation.
    expect(created.data.localPackPosition).toBeNull();
    expect(created.data.websiteSessions).toBeNull();
    expect(created.data.reputationScore).toBeGreaterThan(0);
  });

  it("does not throw when an adapter rejects (isolated)", async () => {
    adapters.fetchGbpInsights.mockRejectedValueOnce(new Error("gbp down"));
    const ok = await refreshOrg(ORG_A, { establishmentId: "est-1" });
    expect(ok).toBe(true);
    expect(tenantState.snapshotCreate).toHaveBeenCalledTimes(1);
  });
});

describe("refreshSeoForDueOrgs — batch", () => {
  it("refreshes each due org and counts results", async () => {
    prismaState.orgFindMany.mockResolvedValueOnce([{ id: ORG_A }, { id: ORG_B }]);
    const counts = await refreshSeoForDueOrgs({ limit: 25 });
    expect(counts.considered).toBe(2);
    expect(counts.refreshed).toBe(2);
    expect(counts.failed).toBe(0);
  });

  it("respects the per-run cap (passed to stage-1 take)", async () => {
    prismaState.orgFindMany.mockResolvedValueOnce([{ id: ORG_A }]);
    await refreshSeoForDueOrgs({ limit: 1 });
    const arg = prismaState.orgFindMany.mock.calls[0]![0] as { take: number };
    expect(arg.take).toBe(1);
  });

  it("one failing org does not abort the batch (ORG_B still refreshed)", async () => {
    prismaState.orgFindMany.mockResolvedValueOnce([{ id: ORG_A }, { id: ORG_B }]);
    tenantState.throwForOrg = ORG_A; // every withTenant for ORG_A throws
    const counts = await refreshSeoForDueOrgs({ limit: 25 });
    expect(counts.considered).toBe(2);
    // ORG_A's snapshot write fails-soft (not refreshed); the batch continues and
    // ORG_B is refreshed — the isolation guarantee.
    expect(counts.refreshed).toBe(1);
    expect(counts.failed + counts.skipped).toBe(1);
  });

  it("skips a fresh org (snapshot newer than the stale window)", async () => {
    prismaState.orgFindMany.mockResolvedValueOnce([{ id: ORG_A }]);
    tenantState.latestSnapshot = { generatedAt: new Date() }; // brand new
    const counts = await refreshSeoForDueOrgs({ limit: 25 });
    expect(counts.skipped).toBe(1);
    expect(counts.refreshed).toBe(0);
    expect(tenantState.snapshotCreate).not.toHaveBeenCalled();
  });
});
