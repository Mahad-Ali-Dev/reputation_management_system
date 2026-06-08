/**
 * Online Visibility Health Score — the dashboard's flagship composite metric.
 *
 * This is a PURE, pluggable function (no DB, no I/O → unit-testable). Phase-1
 * weights only what we can measure today:
 *
 *   - rating          40%   (avg star rating, normalized 0..5 → 0..1)
 *   - responseRate    30%   (share of reviews that have a reply, 0..100)
 *   - reviewVelocity  30%   (reviews in the last 7 days, soft-capped at 10/wk)
 *
 * The `seo` signal is intentionally `null` in Phase 1 → it is reported as a
 * `locked` metric ("connect to unlock") and contributes ZERO weight. When
 * Section 13 (Business Reports / SEO) lands, it passes a non-null `seo` signal
 * and the weights rebalance to include it — with NO change to the dashboard UI
 * (the banner just renders one more metric and a higher max-weight base).
 *
 * The output is a clamped 0..100 score plus a per-metric breakdown the banner
 * renders as status-dot rows. Status thresholds are deliberately generous so a
 * brand-new account isn't shamed with all-red on day one.
 */

/** Inputs to the health score. All optional signals default to "not yet known". */
export type HealthSignals = {
  /** Average star rating 0..5 (0 when no reviews yet). */
  avgRating: number;
  /** Reply coverage as a percentage 0..100. */
  responseRate: number;
  /** Number of reviews collected in the last 7 days. */
  reviews7d: number;
  /**
   * SEO/visibility signal 0..100, or `null` when not connected yet. `null`
   * means "locked" — excluded from the weighted score (Section 13 plugs this
   * in later with zero UI change).
   */
  seo: number | null;
};

/** Status of a single metric, drives the colored dot in the banner. */
export type MetricStatus = "good" | "warn" | "bad" | "locked";

/** One row of the health breakdown shown beside the score ring. */
export type HealthMetric = {
  /** Stable identifier (not shown). */
  key: "rating" | "responseRate" | "velocity" | "seo";
  /** Human label, e.g. "Average rating". */
  label: string;
  /** Display value, e.g. "4.7", "94%", "18 / wk", "Connect to unlock". */
  value: string;
  status: MetricStatus;
};

export type HealthScoreResult = {
  /** Composite score, integer 0..100. */
  score: number;
  /** Per-metric breakdown (rating, responseRate, velocity, seo). */
  metrics: HealthMetric[];
  /** One-line summary keyed off the score band. */
  summary: string;
  /** Coarse band, useful for chips/coloring. */
  band: "strong" | "fair" | "weak";
};

/** Soft cap for "healthy" weekly review velocity. */
const VELOCITY_TARGET = 10;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function ratingStatus(avg: number): MetricStatus {
  if (avg <= 0) return "warn"; // no data yet — neutral, not "bad"
  if (avg >= 4.3) return "good";
  if (avg >= 3.5) return "warn";
  return "bad";
}

function rateStatus(pct: number): MetricStatus {
  if (pct >= 80) return "good";
  if (pct >= 50) return "warn";
  return "bad";
}

function velocityStatus(n: number): MetricStatus {
  if (n >= 5) return "good";
  if (n >= 1) return "warn";
  return "bad";
}

/**
 * Compute the composite Online Visibility Health Score from raw signals.
 *
 * Weights are normalized over the signals that are actually present, so the
 * score stays on a 0..100 scale whether or not the (currently locked) SEO
 * signal is supplied. This is the "no UI change when Section 13 lands" contract.
 */
export function computeHealthScore(signals: HealthSignals): HealthScoreResult {
  const ratingNorm = clamp01(signals.avgRating / 5);
  const responseNorm = clamp01(signals.responseRate / 100);
  const velocityNorm = clamp01(signals.reviews7d / VELOCITY_TARGET);
  const seoConnected = signals.seo !== null;
  const seoNorm = seoConnected ? clamp01((signals.seo as number) / 100) : 0;

  // Base weights. When SEO is locked, its weight is redistributed pro-rata over
  // the three live signals so the score still spans the full 0..100 range.
  const W = { rating: 0.4, response: 0.3, velocity: 0.3, seo: 0.0 };
  if (seoConnected) {
    // Rebalanced weights once SEO is a real signal (kept here so Section 13 is
    // a one-line flip of `seo` from null → number, with this branch already in
    // place and unit-tested).
    W.rating = 0.32;
    W.response = 0.24;
    W.velocity = 0.24;
    W.seo = 0.2;
  }

  const weighted =
    ratingNorm * W.rating +
    responseNorm * W.response +
    velocityNorm * W.velocity +
    seoNorm * W.seo;

  // Normalize by the total active weight (handles the locked-SEO case cleanly).
  const totalWeight = W.rating + W.response + W.velocity + W.seo;
  const score = clampScore((weighted / totalWeight) * 100);

  const metrics: HealthMetric[] = [
    {
      key: "rating",
      label: "Average rating",
      value: signals.avgRating > 0 ? signals.avgRating.toFixed(1) : "—",
      status: ratingStatus(signals.avgRating),
    },
    {
      key: "responseRate",
      label: "Response rate",
      value: `${Math.round(signals.responseRate)}%`,
      status: rateStatus(signals.responseRate),
    },
    {
      key: "velocity",
      label: "New reviews / wk",
      value: String(signals.reviews7d),
      status: velocityStatus(signals.reviews7d),
    },
    {
      key: "seo",
      label: "SEO signals",
      value: seoConnected ? `${Math.round(signals.seo as number)}%` : "Connect to unlock",
      status: seoConnected ? rateStatus(signals.seo as number) : "locked",
    },
  ];

  const band: HealthScoreResult["band"] =
    score >= 75 ? "strong" : score >= 50 ? "fair" : "weak";
  const summary =
    band === "strong"
      ? "Your visibility is strong — customers are finding and trusting your business."
      : band === "fair"
        ? "You're on track. A few quick wins will push your reputation higher."
        : "Let's build momentum — replying and requesting reviews will lift your score fast.";

  return { score, metrics, summary, band };
}
