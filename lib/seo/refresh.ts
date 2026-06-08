import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { computeReputationScore, type ReputationScoreInput } from "./reputation-score";
import { buildOverviewMetrics } from "./overview";
import { generateExecSummary } from "./exec-summary";
import { fetchGbpInsights } from "./adapters/gbp-insights";
import { fetchGa4Summary } from "./adapters/ga4";
import { fetchKeywordRanks, fetchGeoGrid } from "./adapters/rank-tracker";
import { runCitationAudit } from "./citation-audit";
import { getCitationAudit, listKeywordRanks } from "./queries";

/**
 * SEO refresh orchestrator (Module 13) — the batch the `seo-refresh` cron calls,
 * and the same code the on-demand "Generate now" action reuses.
 *
 * STAGE-1 (cross-tenant, unscoped): select orgs with active SEO config whose
 * latest snapshot is stale — mirrors `publishDueAutoReplies` /
 * `syncAllActiveConnections`. STAGE-2 (per org): `withTenant(orgId, …)` to pull
 * the adapters (EACH no-op-safe without creds → reputation-only still works),
 * write `KeywordRank`/`GeoGridSnapshot`/`CitationAudit`, recompute the
 * reputation score, refresh the exec summary, and upsert a `SeoSnapshot`.
 *
 * Cost-throttled: capped orgs per run. One failing org never aborts the batch.
 * Fail-soft on the unmigrated tables (42P01/42703): stage-1 → [] (nothing due),
 * per-org writes are wrapped so the cron still returns 200.
 */

const DEFAULT_LIMIT = 25;
const STALE_HOURS = 20; // re-run if the newest snapshot is older than this
const ONBOARDING_COMPLETE_STEP = 5;

export type RefreshCounts = {
  considered: number;
  refreshed: number;
  failed: number;
  skipped: number;
};

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

/**
 * STAGE-1: orgs eligible for a refresh. An org is eligible when it has completed
 * SEO onboarding (`seoOnboardingStep >= 5`). Staleness is checked per-org in
 * stage-2 against its latest snapshot (kept simple + index-friendly here).
 * Returns [] on any error (incl. unmigrated columns) so the cron no-ops cleanly.
 */
export async function selectDueOrgs(limit: number): Promise<string[]> {
  try {
    const rows = await prisma.organization.findMany({
      where: { seoOnboardingStep: { gte: ONBOARDING_COMPLETE_STEP } },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ event: "seo.refresh.stage1.skipped_unmigrated" });
    } else {
      logger.warn({
        event: "seo.refresh.stage1.failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return [];
  }
}

/** Whether the org's newest snapshot is stale enough to refresh. */
async function isStale(orgId: string, establishmentId: string | null): Promise<boolean> {
  try {
    return await withTenant(orgId, async (tx) => {
      const latest = await tx.seoSnapshot.findFirst({
        where: establishmentId ? { establishmentId } : {},
        orderBy: { generatedAt: "desc" },
        select: { generatedAt: true },
      });
      if (!latest) return true;
      const ageHours = (Date.now() - latest.generatedAt.getTime()) / (60 * 60 * 1000);
      return ageHours >= STALE_HOURS;
    });
  } catch {
    // If we can't read snapshots, attempt the refresh anyway (write may still work).
    return true;
  }
}

/**
 * Refresh a SINGLE org end-to-end. Idempotent-ish: writes a fresh snapshot each
 * run. Returns true on a successful snapshot upsert. Adapter failures inside are
 * swallowed (each adapter is `{available:false}`-tolerant) so a missing
 * integration never blocks the reputation-only snapshot.
 */
export async function refreshOrg(
  orgId: string,
  opts?: { establishmentId?: string | null; force?: boolean },
): Promise<boolean> {
  // Resolve the primary establishment if none supplied.
  let establishmentId = opts?.establishmentId ?? null;
  if (!establishmentId) {
    establishmentId = await firstEstablishmentId(orgId);
  }

  // 1. Pull paid/external adapters (each no-op-safe; failures isolated).
  await safe(() =>
    refreshKeywordRanksFor(orgId, establishmentId),
  );
  await safe(() => refreshGeoGridFor(orgId, establishmentId));
  if (establishmentId) {
    await safe(() => runCitationAudit(orgId, establishmentId as string));
  }
  const gbp = await safe(() => fetchGbpInsights({ orgId, establishmentId }));
  const ga4 = await safe(() => fetchGa4Summary({ orgId, establishmentId }));

  // 2. Recompute reputation score from live aggregates + the freshest SEO signal.
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const metrics = await buildOverviewMetrics(orgId, 30, establishmentId);

  // Best local-pack position from the freshly-written ranks (if any).
  const ranks = await listKeywordRanks(orgId, establishmentId);
  const localPackPositions = ranks
    .filter((r) => r.inLocalPack && r.position != null)
    .map((r) => r.position as number);
  const localPackPosition =
    localPackPositions.length > 0 ? Math.min(...localPackPositions) : null;

  // Citation consistency from the freshly-written audit.
  const citations = await getCitationAudit(orgId, establishmentId);
  const citationConsistency =
    citations.length > 0
      ? citations.filter((c) => c.status === "consistent").length / citations.length
      : null;

  const websiteSessions = ga4?.available ? (ga4.sessions ?? null) : null;

  const scoreInput: ReputationScoreInput = {
    avgRating: metrics.reputation.avgRating,
    reviewCount: metrics.reputation.reviewCount,
    recentReviewCount: metrics.reputation.recentReviewVelocity,
    repliesCount: Math.round(
      (metrics.reputation.responseRate / 100) * metrics.reputation.reviewCount,
    ),
    daysSinceLastReview: metrics.reputation.daysSinceLastReview,
    localPackPosition,
    citationConsistency,
  };
  const { score, factors } = computeReputationScore(scoreInput);

  // 3. Refresh exec summary (env-gated; deterministic fallback otherwise).
  const exec = await generateExecSummary(orgId, 30, {
    ...metrics,
    seo: {
      reputationScore: score,
      scoreFactors: factors,
      localPackPosition,
      websiteSessions,
    },
  });

  // 4. Upsert the snapshot (fail-soft on unmigrated table).
  try {
    await withTenant(orgId, async (tx) => {
      await tx.seoSnapshot.create({
        data: {
          organizationId: orgId,
          establishmentId,
          periodStart: since,
          periodEnd: now,
          reputationScore: score,
          scoreFactors: factors as unknown as object,
          localPackPosition,
          websiteSessions,
          execSummary: exec.summary,
          generatedAt: now,
        },
      });
    });
    void gbp; // metrics surfaced via the adapter on read; snapshot stores the score + sessions
    return true;
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, event: "seo.refresh.snapshot.skipped_unmigrated" });
    } else {
      logger.warn({
        orgId,
        event: "seo.refresh.snapshot.failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return false;
  }
}

/**
 * The cron entry point. Selects due orgs (capped) and refreshes each, isolating
 * failures. Returns counts.
 */
export async function refreshSeoForDueOrgs(opts?: { limit?: number }): Promise<RefreshCounts> {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const orgIds = await selectDueOrgs(limit);

  let refreshed = 0;
  let failed = 0;
  let skipped = 0;

  for (const orgId of orgIds) {
    try {
      const establishmentId = await firstEstablishmentId(orgId);
      if (!(await isStale(orgId, establishmentId))) {
        skipped++;
        continue;
      }
      const ok = await refreshOrg(orgId, { establishmentId });
      if (ok) refreshed++;
      else skipped++;
    } catch (err) {
      failed++;
      logger.error({
        orgId,
        event: "seo.refresh.org_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ event: "seo.refresh.batch_complete", considered: orgIds.length, refreshed, failed, skipped });
  return { considered: orgIds.length, refreshed, failed, skipped };
}

// ── helpers ─────────────────────────────────────────────────────

/** Run a fn, swallowing + logging any error (returns null on failure). */
async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({
      event: "seo.refresh.adapter_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function firstEstablishmentId(orgId: string): Promise<string | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const est = await tx.establishment.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      return est?.id ?? null;
    });
  } catch {
    return null;
  }
}

/** Pull tracked keywords and write a KeywordRank row per keyword (if provider on). */
async function refreshKeywordRanksFor(
  orgId: string,
  establishmentId: string | null,
): Promise<void> {
  // The tracked-keyword set is the distinct keywords already on file for this
  // establishment (seeded by the onboarding "set keywords" step).
  const existing = await listKeywordRanks(orgId, establishmentId);
  const keywords = existing.map((r) => r.keyword);
  if (keywords.length === 0) return;

  const res = await fetchKeywordRanks({ orgId, establishmentId, keywords });
  if (!res.available) return;

  const now = new Date();
  await withTenant(orgId, async (tx) => {
    await tx.keywordRank.createMany({
      data: res.ranks.map((r) => ({
        organizationId: orgId,
        establishmentId,
        keyword: r.keyword,
        position: r.position,
        inLocalPack: r.inLocalPack,
        searchVolume: r.searchVolume ?? null,
        provider: res.provider,
        checkedAt: now,
        raw: (r.raw as object) ?? undefined,
      })),
    });
  });
}

/** Refresh the geo grid for the primary tracked keyword (if provider on). */
async function refreshGeoGridFor(orgId: string, establishmentId: string | null): Promise<void> {
  if (!establishmentId) return;
  // Use the most recent grid's keyword + center, or skip if none configured.
  const prev = await withTenant(orgId, async (tx) =>
    tx.geoGridSnapshot.findFirst({
      where: { establishmentId },
      orderBy: { checkedAt: "desc" },
      select: { keyword: true, centerLat: true, centerLng: true, radiusMiles: true, gridSize: true },
    }),
  ).catch(() => null);
  if (!prev) return;

  const res = await fetchGeoGrid({
    orgId,
    establishmentId,
    keyword: prev.keyword,
    centerLat: Number(prev.centerLat),
    centerLng: Number(prev.centerLng),
    radiusMiles: Number(prev.radiusMiles),
    gridSize: prev.gridSize,
  });
  if (!res.available) return;

  const now = new Date();
  await withTenant(orgId, async (tx) => {
    await tx.geoGridSnapshot.create({
      data: {
        organizationId: orgId,
        establishmentId,
        keyword: prev.keyword,
        centerLat: res.centerLat,
        centerLng: res.centerLng,
        radiusMiles: res.radiusMiles,
        gridSize: res.gridSize,
        cells: res.cells as unknown as object,
        avgPosition: res.avgPosition,
        provider: res.provider,
        checkedAt: now,
      },
    });
  });
}
