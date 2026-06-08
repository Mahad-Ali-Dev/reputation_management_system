import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rankProviderCall } from "./_transport";

/**
 * Rank-tracking adapter (Module 13) — the PAID tier.
 *
 * One provider interface over `dataforseo | brightlocal` covering:
 *   - `fetchKeywordRanks`   → keyword positions + local-pack flags
 *   - `fetchGeoGrid`        → the 5-mile NxN ranking grid (heatmap)
 *   - `suggestKeywords`     → AI/provider keyword ideas for onboarding step 3
 *   - `suggestCompetitors`  → local rival suggestions for onboarding step 4
 *
 * ── ENV GATE (load-bearing) ───────────────────────────────────────────────
 * Env-gated on `RANK_TRACKER_PROVIDER` ∈ {dataforseo, brightlocal} +
 * `RANK_TRACKER_API_KEY`. With either unset, EVERY function returns
 * `{ available:false }` / `[]` and makes ZERO paid calls. All outbound traffic
 * funnels through the single `callProvider()` seam so a test can spy that it is
 * never invoked when creds are absent — the guarantee that the default code
 * path makes no live paid call.
 */

const VALID_PROVIDERS = new Set(["dataforseo", "brightlocal"]);

export type RankTrackerProvider = "dataforseo" | "brightlocal";

export type KeywordRankResult = {
  keyword: string;
  position: number | null;
  inLocalPack: boolean;
  searchVolume?: number | null;
  raw?: unknown;
};

export type KeywordRanksResponse =
  | { available: false }
  | { available: true; provider: RankTrackerProvider; ranks: KeywordRankResult[] };

export type GeoGridCell = { lat: number; lng: number; position: number | null };

export type GeoGridResponse =
  | { available: false }
  | {
      available: true;
      provider: RankTrackerProvider;
      gridSize: number;
      centerLat: number;
      centerLng: number;
      radiusMiles: number;
      cells: GeoGridCell[];
      avgPosition: number | null;
    };

export type SuggestResponse<T> = { available: boolean; items: T[] };

/** Resolve the configured provider, or null when not configured. */
export function rankTrackerProvider(): RankTrackerProvider | null {
  const p = (env.RANK_TRACKER_PROVIDER || "").toLowerCase();
  if (!env.RANK_TRACKER_API_KEY) return null;
  if (!VALID_PROVIDERS.has(p)) return null;
  return p as RankTrackerProvider;
}

export function rankTrackerConfigured(): boolean {
  return rankTrackerProvider() !== null;
}

/** The provider operations the single seam dispatches on. */
export type ProviderOp =
  | "keyword_ranks"
  | "geo_grid"
  | "suggest_keywords"
  | "suggest_competitors";

/**
 * Provider call wrapper. Delegates to the shared `_transport` seam so the whole
 * adapter family has ONE place a test stubs to prove "no creds ⇒ never called".
 * Kept exported because `citation-audit.ts` reuses it for the citation endpoint.
 */
export async function callProvider(args: {
  provider: RankTrackerProvider;
  apiKey: string;
  op: ProviderOp | "citations";
  params: Record<string, unknown>;
}): Promise<unknown | null> {
  return rankProviderCall(args);
}

export async function fetchKeywordRanks(args: {
  orgId: string;
  establishmentId?: string | null;
  keywords: string[];
  geo?: string | null;
}): Promise<KeywordRanksResponse> {
  const provider = rankTrackerProvider();
  if (!provider) return { available: false };
  if (!args.keywords || args.keywords.length === 0) return { available: false };

  try {
    const raw = (await callProvider({
      provider,
      apiKey: env.RANK_TRACKER_API_KEY,
      op: "keyword_ranks",
      params: { keywords: args.keywords, geo: args.geo ?? null },
    })) as { ranks?: KeywordRankResult[] } | null;
    if (!raw) return { available: false };
    return { available: true, provider, ranks: raw.ranks ?? [] };
  } catch (err) {
    logger.warn({
      orgId: args.orgId,
      event: "seo.rank_tracker.keyword_ranks_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false };
  }
}

export async function fetchGeoGrid(args: {
  orgId: string;
  establishmentId?: string | null;
  keyword: string;
  centerLat: number;
  centerLng: number;
  radiusMiles?: number;
  gridSize?: number;
}): Promise<GeoGridResponse> {
  const provider = rankTrackerProvider();
  if (!provider) return { available: false };

  try {
    const raw = (await callProvider({
      provider,
      apiKey: env.RANK_TRACKER_API_KEY,
      op: "geo_grid",
      params: {
        keyword: args.keyword,
        centerLat: args.centerLat,
        centerLng: args.centerLng,
        radiusMiles: args.radiusMiles ?? 5,
        gridSize: args.gridSize ?? 5,
      },
    })) as { cells?: GeoGridCell[]; avgPosition?: number | null } | null;
    if (!raw) return { available: false };
    const cells = raw.cells ?? [];
    const ranked = cells.map((c) => c.position).filter((p): p is number => p != null);
    const avgPosition =
      raw.avgPosition ??
      (ranked.length > 0 ? ranked.reduce((a, b) => a + b, 0) / ranked.length : null);
    return {
      available: true,
      provider,
      gridSize: args.gridSize ?? 5,
      centerLat: args.centerLat,
      centerLng: args.centerLng,
      radiusMiles: args.radiusMiles ?? 5,
      cells,
      avgPosition,
    };
  } catch (err) {
    logger.warn({
      orgId: args.orgId,
      event: "seo.rank_tracker.geo_grid_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false };
  }
}

export async function suggestKeywords(args: {
  category?: string | null;
  location?: string | null;
}): Promise<SuggestResponse<string>> {
  const provider = rankTrackerProvider();
  if (!provider) return { available: false, items: [] };

  try {
    const raw = (await callProvider({
      provider,
      apiKey: env.RANK_TRACKER_API_KEY,
      op: "suggest_keywords",
      params: { category: args.category ?? null, location: args.location ?? null },
    })) as { keywords?: string[] } | null;
    if (!raw) return { available: false, items: [] };
    return { available: true, items: raw.keywords ?? [] };
  } catch (err) {
    logger.warn({
      event: "seo.rank_tracker.suggest_keywords_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false, items: [] };
  }
}

export type CompetitorSuggestion = {
  name: string;
  googlePlaceId?: string | null;
  websiteUrl?: string | null;
};

export async function suggestCompetitors(args: {
  category?: string | null;
  location?: string | null;
  placeId?: string | null;
}): Promise<SuggestResponse<CompetitorSuggestion>> {
  const provider = rankTrackerProvider();
  if (!provider) return { available: false, items: [] };

  try {
    const raw = (await callProvider({
      provider,
      apiKey: env.RANK_TRACKER_API_KEY,
      op: "suggest_competitors",
      params: {
        category: args.category ?? null,
        location: args.location ?? null,
        placeId: args.placeId ?? null,
      },
    })) as { competitors?: CompetitorSuggestion[] } | null;
    if (!raw) return { available: false, items: [] };
    return { available: true, items: raw.competitors ?? [] };
  } catch (err) {
    logger.warn({
      event: "seo.rank_tracker.suggest_competitors_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { available: false, items: [] };
  }
}
