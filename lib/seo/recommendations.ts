/**
 * Recommendations rules engine (module 13 — Recommendations tab).
 *
 * PURE over already-loaded rows: the caller (panel / refresh) loads reviews,
 * competitors, and the latest geo grid tenant-scoped and hands plain data here.
 * No DB, no network, no AI — the AI "what to improve" prose is the separate
 * exec-summary path. This produces the prioritized, deterministic, testable
 * action cards with an **expected-impact** string each.
 *
 * Two highest-impact local-SEO levers (per spec):
 *   - `review_gen` — fires when OUR review velocity is below the competitor
 *     median (we're losing the freshness/volume race).
 *   - `geo_post` — one card per geo-grid cell ranking below a threshold
 *     (we're invisible in a neighborhood); expected impact derived from the
 *     cell's current position + a conservative lift.
 */

/** The fixed set of recommendation kinds (no dupes; stable). */
export const RECOMMENDATION_KINDS = ["review_gen", "geo_post"] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

/** A single prioritized recommendation card. */
export type Recommendation = {
  kind: RecommendationKind;
  /** Lower number = higher priority (sorted ascending). */
  priority: number;
  /** One-line headline for the card. */
  headline: string;
  /** Concrete "expected impact" copy, e.g. "+2 positions in South Austin grid". */
  expectedImpact: string;
  /**
   * Action payload the "Do it" button uses — deep-links to Review Requests
   * (Step 7) or schedules a geo-post (Step 10) via the Scheduler.
   */
  payload: Record<string, unknown>;
};

/** A geo-grid cell as stored in `GeoGridSnapshot.cells`. */
export type GeoCell = {
  lat: number;
  lng: number;
  /** Rank at this point; `null` = not ranking in top-N. */
  position: number | null;
};

export type RecommendationsInput = {
  establishmentId?: string | null;
  /** Our reviews in the recent window (e.g. last 30 days). */
  ourRecentReviewVelocity: number;
  /**
   * Each competitor's recent review velocity (same window). The median is the
   * benchmark for the `review_gen` trigger. Empty ⇒ no competitor baseline →
   * `review_gen` only fires on an absolute-floor heuristic.
   */
  competitorVelocities: number[];
  /** Latest geo grid (optional). */
  geoGrid?: {
    keyword: string;
    /** Human area label for the expected-impact copy (e.g. "South Austin"). */
    areaLabel?: string | null;
    cells: GeoCell[];
  } | null;
  /**
   * Grid cells with a position worse than this rank (or not ranking) become a
   * `geo_post` recommendation. Default 3 (outside the local 3-pack).
   */
  geoThreshold?: number;
};

/** Median of a numeric list (0 for empty). */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2 : (s[mid] ?? 0);
}

/** A short ordinal area label for cells when the grid has no name. */
function cellArea(areaLabel: string | null | undefined, index: number): string {
  if (areaLabel && areaLabel.trim().length > 0) return areaLabel.trim();
  return `grid cell ${index + 1}`;
}

/**
 * Build the prioritized recommendation list. Deterministic ordering:
 * `priority` ascending, then a stable kind order, then headline — so the same
 * inputs always yield the same sequence (snapshot-stable, test-stable).
 */
export function computeRecommendations(input: RecommendationsInput): Recommendation[] {
  const recs: Recommendation[] = [];
  const threshold = input.geoThreshold ?? 3;

  // ── review_gen ────────────────────────────────────────────────
  const compMedian = median(input.competitorVelocities);
  const haveCompetitors = input.competitorVelocities.length > 0;
  // Fire when we trail the competitor median, or (with no competitors) when our
  // own velocity is effectively stalled (absolute floor of 1/window).
  const trailsCompetitors = haveCompetitors && input.ourRecentReviewVelocity < compMedian;
  const stalled = !haveCompetitors && input.ourRecentReviewVelocity < 1;

  if (trailsCompetitors || stalled) {
    const gap = haveCompetitors
      ? Math.max(1, Math.ceil(compMedian - input.ourRecentReviewVelocity))
      : 4;
    recs.push({
      kind: "review_gen",
      // High priority: velocity gaps compound fast.
      priority: 1,
      headline: trailsCompetitors
        ? "Your review velocity is below your competitors"
        : "Your review flow has stalled",
      expectedImpact: `+${gap} review${gap === 1 ? "" : "s"}/month closes the gap`,
      payload: {
        action: "send_review_requests",
        establishmentId: input.establishmentId ?? null,
        deficit: gap,
        competitorMedian: compMedian,
        ourVelocity: input.ourRecentReviewVelocity,
        href: "/outreach",
      },
    });
  }

  // ── geo_post (one per below-threshold cell) ───────────────────
  const grid = input.geoGrid;
  if (grid && Array.isArray(grid.cells)) {
    grid.cells.forEach((cell, i) => {
      const notRanking = cell.position == null;
      const belowThreshold = cell.position != null && cell.position > threshold;
      if (!notRanking && !belowThreshold) return;

      const area = cellArea(grid.areaLabel, i);
      // Conservative expected lift: not-ranking cells aim into the pack;
      // below-threshold cells aim to climb halfway toward the top.
      const currentPos = cell.position;
      const lift =
        currentPos == null ? 3 : Math.max(1, Math.ceil((currentPos - 1) / 2));
      const expectedImpact =
        currentPos == null
          ? `Break into the top ${threshold} in ${area}`
          : `+${lift} position${lift === 1 ? "" : "s"} in ${area}`;

      recs.push({
        kind: "geo_post",
        // Not-ranking cells (priority 2) before merely-weak cells (priority 3).
        priority: notRanking ? 2 : 3,
        headline: `Not ranking well for "${grid.keyword}" near ${area}`,
        expectedImpact,
        payload: {
          action: "schedule_geo_post",
          establishmentId: input.establishmentId ?? null,
          keyword: grid.keyword,
          lat: cell.lat,
          lng: cell.lng,
          currentPosition: currentPos,
          area,
        },
      });
    });
  }

  // Deterministic, stable ordering.
  const kindOrder: Record<RecommendationKind, number> = { review_gen: 0, geo_post: 1 };
  recs.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
    return a.headline.localeCompare(b.headline);
  });

  return recs;
}
