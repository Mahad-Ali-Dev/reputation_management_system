/**
 * Reputation Score — the 0–100 composite that backs the Reputation Score tab,
 * the Overview KPI, and the per-run `SeoSnapshot.reputationScore`.
 *
 * PURE. No DB, no network, no `Date.now()` — every input is passed in so the
 * function is trivially unit-testable and the number is reproducible. The
 * caller (lib/seo/overview.ts / lib/seo/refresh.ts) loads the inputs
 * tenant-scoped and hands them here.
 *
 * Design rule (from the module plan): **missing SEO inputs contribute 0**, so
 * the score works in the reputation-only phase (before any SEO integration is
 * connected) and gracefully grows as citation/local-pack data lands. The two
 * SEO factors are therefore weighted into the total but score 0 until present —
 * an org with no SEO data is capped below 100 by design (it has not earned the
 * citation/visibility points yet), which is the intended "connect SEO to reach
 * 100" nudge.
 *
 * Weights are a single exported const so re-tuning is a one-file change; the
 * orchestrator never scatters the math.
 */

/** A single scored factor, surfaced as a labelled bar in the UI. */
export type ScoreFactor = {
  /** Stable key (also used in the snapshot JSON). */
  key: ScoreFactorKey;
  /** Human label for the breakdown list. */
  label: string;
  /** Points earned for this factor (0..weight). */
  points: number;
  /** Max points this factor can contribute (its weight). */
  weight: number;
  /**
   * `true` when the underlying signal exists. SEO factors are `false` (and
   * therefore 0 points) until the integration is connected — the UI shows a
   * muted "Connect to unlock" affordance for these.
   */
  available: boolean;
};

export type ScoreFactorKey =
  | "rating"
  | "volume"
  | "response_rate"
  | "recency"
  | "citation_consistency"
  | "local_pack";

export type ReputationScoreInput = {
  /** Average star rating over the window (1..5). 0/undefined ⇒ no reviews. */
  avgRating?: number | null;
  /** Review count over the window. */
  reviewCount?: number | null;
  /**
   * Review velocity: reviews in the most recent sub-window (e.g. last 30d).
   * Used for the recency/momentum factor. Defaults to `reviewCount` semantics
   * being window-total; pass the recent slice for a momentum read.
   */
  recentReviewCount?: number | null;
  /** Published replies over the window (numerator of response rate). */
  repliesCount?: number | null;
  /** Days since the most recent review. `null` ⇒ no reviews ever. */
  daysSinceLastReview?: number | null;
  /**
   * Citation consistency 0..1 (fraction of audited directories whose NAP
   * matches the canonical record). `null`/undefined ⇒ no audit yet → 0 points.
   */
  citationConsistency?: number | null;
  /**
   * Best local-pack position 1..N (1 = top of the 3-pack). `null`/undefined ⇒
   * no rank data yet → 0 points.
   */
  localPackPosition?: number | null;
};

/**
 * Factor weights (sum = 100). Reputation factors carry the bulk; the two SEO
 * factors are a 25-point "upside" that only materializes once SEO data exists.
 */
export const SCORE_WEIGHTS: Record<ScoreFactorKey, number> = {
  rating: 35,
  volume: 20,
  response_rate: 15,
  recency: 5,
  citation_consistency: 10,
  local_pack: 15,
};

const FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  rating: "Average rating",
  volume: "Review volume",
  response_rate: "Response rate",
  recency: "Recency",
  citation_consistency: "Citation consistency",
  local_pack: "Local-pack visibility",
};

/** Clamp to [0,1]. */
function unit(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Rating → [0,1]. Maps the meaningful 3.0–5.0 band onto the full range so a
 * 4.5 (good) and a 5.0 (excellent) are clearly differentiated; ≤3.0 floors to
 * 0 because a 3-star average is a reputation problem.
 */
function ratingFraction(avg: number): number {
  if (avg <= 3) return 0;
  return unit((avg - 3) / 2); // 3→0, 4→0.5, 5→1
}

/**
 * Volume → [0,1] with diminishing returns. 0 reviews → 0; ~50 reviews → ~0.83;
 * asymptotes toward 1. Uses a smooth saturating curve so the factor rewards
 * having a healthy base without ever needing thousands of reviews.
 */
function volumeFraction(count: number): number {
  if (count <= 0) return 0;
  return unit(count / (count + 10)); // 10→0.5, 40→0.8, 90→0.9
}

/**
 * Recency → [0,1]. A review within ~14 days is full marks; decays to 0 by ~90
 * days of silence. `null` (never reviewed) → 0.
 */
function recencyFraction(daysSince: number | null | undefined): number {
  if (daysSince == null) return 0;
  if (daysSince <= 14) return 1;
  if (daysSince >= 90) return 0;
  return unit(1 - (daysSince - 14) / (90 - 14));
}

/**
 * Local-pack position → [0,1]. Position 1 = full marks; linear decay; nothing
 * beyond ~10 earns points. `null` (no data) → 0.
 */
function localPackFraction(position: number | null | undefined): number {
  if (position == null || position <= 0) return 0;
  if (position === 1) return 1;
  if (position >= 10) return 0;
  return unit(1 - (position - 1) / (10 - 1));
}

/**
 * Compute the 0–100 reputation score + the per-factor breakdown.
 *
 * The returned `score` is the rounded sum of the factor `points`. The breakdown
 * preserves each factor's earned points, its weight, and whether the signal was
 * available — the UI renders the SEO factors as locked when `available` is
 * false.
 */
export function computeReputationScore(input: ReputationScoreInput): {
  score: number;
  factors: ScoreFactor[];
} {
  const avgRating = Number(input.avgRating ?? 0);
  const reviewCount = Math.max(0, Number(input.reviewCount ?? 0));
  const repliesCount = Math.max(0, Number(input.repliesCount ?? 0));

  // Response rate is only meaningful with at least one review; otherwise 0.
  const responseRate = reviewCount > 0 ? unit(repliesCount / reviewCount) : 0;

  const citationAvailable =
    input.citationConsistency != null && Number.isFinite(input.citationConsistency);
  const localPackAvailable = input.localPackPosition != null && input.localPackPosition > 0;

  const fractions: Record<ScoreFactorKey, number> = {
    rating: ratingFraction(avgRating),
    volume: volumeFraction(reviewCount),
    response_rate: responseRate,
    recency: recencyFraction(input.daysSinceLastReview),
    citation_consistency: citationAvailable ? unit(Number(input.citationConsistency)) : 0,
    local_pack: localPackAvailable ? localPackFraction(input.localPackPosition) : 0,
  };

  const availability: Record<ScoreFactorKey, boolean> = {
    rating: reviewCount > 0,
    volume: reviewCount > 0,
    response_rate: reviewCount > 0,
    recency: input.daysSinceLastReview != null,
    citation_consistency: citationAvailable,
    local_pack: localPackAvailable,
  };

  const keys = Object.keys(SCORE_WEIGHTS) as ScoreFactorKey[];
  const factors: ScoreFactor[] = keys.map((key) => {
    const weight = SCORE_WEIGHTS[key];
    const points = Math.round(fractions[key] * weight * 10) / 10;
    return {
      key,
      label: FACTOR_LABELS[key],
      points,
      weight,
      available: availability[key],
    };
  });

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return { score, factors };
}
