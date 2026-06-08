import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * SEO read layer (Module 13) — tenant-scoped reads for the report panels.
 *
 * Every function:
 *   - runs inside `withTenant(orgId, …)` so RLS applies,
 *   - returns a plain, serializable shape (Decimals → numbers, Dates kept as
 *     Date for the server components to format),
 *   - FAILS SOFT: the six SEO tables don't exist in the live DB until the
 *     founder applies the master migration. Postgres 42P01 (undefined_table) /
 *     42703 (undefined_column) — and any transient error — degrade to
 *     empty/null so `next build` (force-dynamic page) and runtime renders never
 *     500 on an unmigrated deploy. The panels treat empty as "not set up yet".
 */

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

/** Run a tenant read, degrading to `fallback` on any error (logged once). */
async function safeRead<T>(orgId: string, label: string, fn: Parameters<typeof withTenant<T>>[1], fallback: T): Promise<T> {
  try {
    return await withTenant(orgId, fn);
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, event: `seo.queries.${label}.skipped_unmigrated` });
    } else {
      logger.warn({
        orgId,
        event: `seo.queries.${label}.failed`,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return fallback;
  }
}

const dec = (v: unknown): number | null =>
  v == null ? null : typeof v === "number" ? v : Number(v.toString());

// ─────────────────────────── SeoSnapshot ───────────────────────────

export type SeoSnapshotView = {
  id: string;
  establishmentId: string | null;
  periodStart: Date;
  periodEnd: Date;
  reputationScore: number;
  scoreFactors: unknown;
  localPackPosition: number | null;
  websiteSessions: number | null;
  execSummary: string | null;
  generatedAt: Date;
};

export async function getSeoSnapshotLatest(
  orgId: string,
  establishmentId?: string | null,
): Promise<SeoSnapshotView | null> {
  return safeRead<SeoSnapshotView | null>(
    orgId,
    "snapshot_latest",
    async (tx) => {
      const row = await tx.seoSnapshot.findFirst({
        where: establishmentId ? { establishmentId } : {},
        orderBy: { generatedAt: "desc" },
      });
      if (!row) return null;
      return {
        id: row.id,
        establishmentId: row.establishmentId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        reputationScore: row.reputationScore,
        scoreFactors: row.scoreFactors,
        localPackPosition: row.localPackPosition,
        websiteSessions: row.websiteSessions,
        execSummary: row.execSummary,
        generatedAt: row.generatedAt,
      };
    },
    null,
  );
}

/** Recent snapshots for the Weekly Reports list (newest first). */
export async function listSeoSnapshots(
  orgId: string,
  opts?: { establishmentId?: string | null; limit?: number },
): Promise<SeoSnapshotView[]> {
  return safeRead<SeoSnapshotView[]>(
    orgId,
    "snapshot_list",
    async (tx) => {
      const rows = await tx.seoSnapshot.findMany({
        where: opts?.establishmentId ? { establishmentId: opts.establishmentId } : {},
        orderBy: { generatedAt: "desc" },
        take: opts?.limit ?? 12,
      });
      return rows.map((row) => ({
        id: row.id,
        establishmentId: row.establishmentId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        reputationScore: row.reputationScore,
        scoreFactors: row.scoreFactors,
        localPackPosition: row.localPackPosition,
        websiteSessions: row.websiteSessions,
        execSummary: row.execSummary,
        generatedAt: row.generatedAt,
      }));
    },
    [],
  );
}

// ─────────────────────────── KeywordRank ───────────────────────────

export type KeywordRankView = {
  keyword: string;
  position: number | null;
  previousPosition: number | null;
  inLocalPack: boolean;
  searchVolume: number | null;
  geo: string | null;
  checkedAt: Date;
};

/**
 * Latest rank per keyword + the prior reading for a 7-day delta arrow. We pull a
 * window of recent rows and reduce to (latest, previous) per keyword in JS —
 * cheap and avoids a window-function dependency.
 */
export async function listKeywordRanks(
  orgId: string,
  establishmentId?: string | null,
): Promise<KeywordRankView[]> {
  return safeRead<KeywordRankView[]>(
    orgId,
    "keyword_ranks",
    async (tx) => {
      const rows = await tx.keywordRank.findMany({
        where: establishmentId ? { establishmentId } : {},
        orderBy: { checkedAt: "desc" },
        take: 500,
      });
      const byKeyword = new Map<string, typeof rows>();
      for (const r of rows) {
        const list = byKeyword.get(r.keyword) ?? [];
        list.push(r);
        byKeyword.set(r.keyword, list);
      }
      const out: KeywordRankView[] = [];
      for (const [keyword, list] of byKeyword) {
        const latest = list[0]!; // rows are newest-first
        const previous = list[1] ?? null;
        out.push({
          keyword,
          position: latest.position,
          previousPosition: previous?.position ?? null,
          inLocalPack: latest.inLocalPack,
          searchVolume: latest.searchVolume,
          geo: latest.geo,
          checkedAt: latest.checkedAt,
        });
      }
      // Stable: local-pack first, then best position, then keyword.
      out.sort((a, b) => {
        if (a.inLocalPack !== b.inLocalPack) return a.inLocalPack ? -1 : 1;
        const pa = a.position ?? 999;
        const pb = b.position ?? 999;
        if (pa !== pb) return pa - pb;
        return a.keyword.localeCompare(b.keyword);
      });
      return out;
    },
    [],
  );
}

// ─────────────────────────── CitationAudit ─────────────────────────

export type CitationAuditView = {
  directory: string;
  nameMatch: boolean | null;
  addressMatch: boolean | null;
  phoneMatch: boolean | null;
  listedName: string | null;
  listedAddress: string | null;
  listedPhone: string | null;
  status: string;
  checkedAt: Date;
};

export async function getCitationAudit(
  orgId: string,
  establishmentId?: string | null,
): Promise<CitationAuditView[]> {
  return safeRead<CitationAuditView[]>(
    orgId,
    "citation_audit",
    async (tx) => {
      const rows = await tx.citationAudit.findMany({
        where: establishmentId ? { establishmentId } : {},
        orderBy: { checkedAt: "desc" },
        take: 20,
      });
      // Latest row per directory (rows newest-first).
      const seen = new Set<string>();
      const out: CitationAuditView[] = [];
      for (const r of rows) {
        if (seen.has(r.directory)) continue;
        seen.add(r.directory);
        out.push({
          directory: r.directory,
          nameMatch: r.nameMatch,
          addressMatch: r.addressMatch,
          phoneMatch: r.phoneMatch,
          listedName: r.listedName,
          listedAddress: r.listedAddress,
          listedPhone: r.listedPhone,
          status: r.status,
          checkedAt: r.checkedAt,
        });
      }
      return out;
    },
    [],
  );
}

// ──────────────────────────── Competitor ───────────────────────────

export type CompetitorView = {
  id: string;
  name: string;
  googlePlaceId: string | null;
  websiteUrl: string | null;
  rating: number | null;
  reviewCount: number | null;
  shareOfVoice: number | null;
  metrics: unknown;
  keywordGap: string[];
};

export async function listCompetitors(
  orgId: string,
  establishmentId?: string | null,
): Promise<CompetitorView[]> {
  return safeRead<CompetitorView[]>(
    orgId,
    "competitors",
    async (tx) => {
      const rows = await tx.competitor.findMany({
        where: establishmentId ? { establishmentId } : {},
        orderBy: { createdAt: "asc" },
        take: 3,
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        googlePlaceId: r.googlePlaceId,
        websiteUrl: r.websiteUrl,
        rating: dec(r.rating),
        reviewCount: r.reviewCount,
        shareOfVoice: dec(r.shareOfVoice),
        metrics: r.metrics,
        keywordGap: r.keywordGap ?? [],
      }));
    },
    [],
  );
}

// ─────────────────────────── GeoGridSnapshot ───────────────────────

export type GeoGridView = {
  id: string;
  keyword: string;
  centerLat: number;
  centerLng: number;
  radiusMiles: number;
  gridSize: number;
  cells: { lat: number; lng: number; position: number | null }[];
  avgPosition: number | null;
  checkedAt: Date;
};

export async function getGeoGridLatest(
  orgId: string,
  establishmentId?: string | null,
): Promise<GeoGridView | null> {
  return safeRead<GeoGridView | null>(
    orgId,
    "geo_grid",
    async (tx) => {
      const row = await tx.geoGridSnapshot.findFirst({
        where: establishmentId ? { establishmentId } : {},
        orderBy: { checkedAt: "desc" },
      });
      if (!row) return null;
      const cells = Array.isArray(row.cells)
        ? (row.cells as { lat: number; lng: number; position: number | null }[])
        : [];
      return {
        id: row.id,
        keyword: row.keyword,
        centerLat: Number(dec(row.centerLat) ?? 0),
        centerLng: Number(dec(row.centerLng) ?? 0),
        radiusMiles: Number(dec(row.radiusMiles) ?? 5),
        gridSize: row.gridSize,
        cells,
        avgPosition: dec(row.avgPosition),
        checkedAt: row.checkedAt,
      };
    },
    null,
  );
}

// ─────────────────────────── Ga4 summary ───────────────────────────

export type Ga4SummaryView = {
  connected: boolean;
  propertyId: string | null;
  status: string | null;
  lastSyncedAt: Date | null;
};

/**
 * The GA4 *connection* state (not the live metric pull — that's the adapter).
 * Used by the SEO panel to decide between a ConnectionGate and a metric card.
 */
export async function getGa4Summary(
  orgId: string,
  establishmentId?: string | null,
): Promise<Ga4SummaryView> {
  return safeRead<Ga4SummaryView>(
    orgId,
    "ga4_summary",
    async (tx) => {
      const row = await tx.ga4Connection.findFirst({
        where: establishmentId ? { establishmentId } : {},
        orderBy: { updatedAt: "desc" },
        select: { propertyId: true, status: true, lastSyncedAt: true },
      });
      return {
        connected: row?.status === "active",
        propertyId: row?.propertyId ?? null,
        status: row?.status ?? null,
        lastSyncedAt: row?.lastSyncedAt ?? null,
      };
    },
    { connected: false, propertyId: null, status: null, lastSyncedAt: null },
  );
}

// ─────────────────────────── Onboarding state ──────────────────────

export type SeoOnboardingState = {
  step: number; // 0 = not started; 5 = complete
  complete: boolean;
  firstReportRequestedAt: Date | null;
  firstReportReadyAt: Date | null;
};

const ONBOARDING_COMPLETE_STEP = 5;

/**
 * The org's SEO onboarding progress (columns on `organizations`). Fail-soft to
 * step 0 if the columns aren't migrated yet (so the wizard simply shows at the
 * start rather than the page crashing).
 */
export async function getSeoOnboardingState(orgId: string): Promise<SeoOnboardingState> {
  return safeRead<SeoOnboardingState>(
    orgId,
    "onboarding_state",
    async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: orgId },
        select: {
          seoOnboardingStep: true,
          seoFirstReportRequestedAt: true,
          seoFirstReportReadyAt: true,
        },
      });
      const step = org?.seoOnboardingStep ?? 0;
      return {
        step,
        complete: step >= ONBOARDING_COMPLETE_STEP,
        firstReportRequestedAt: org?.seoFirstReportRequestedAt ?? null,
        firstReportReadyAt: org?.seoFirstReportReadyAt ?? null,
      };
    },
    { step: 0, complete: false, firstReportRequestedAt: null, firstReportReadyAt: null },
  );
}

/** The primary establishment id for an org (first by createdAt), or null. */
export async function getPrimaryEstablishmentId(orgId: string): Promise<string | null> {
  return safeRead<string | null>(
    orgId,
    "primary_establishment",
    async (tx) => {
      const est = await tx.establishment.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      return est?.id ?? null;
    },
    null,
  );
}
