/**
 * ROI revenue estimator (Module 15 — Differentiators).
 *
 * PURE money math: no DB, no network, no Date. The funnel (reviews → GBP views →
 * calls → bookings) comes from `lib/roi/attribution.ts`; this file turns it into
 * an ESTIMATED booked-revenue figure using per-establishment `RoiSettings`.
 *
 * The output is always labeled "estimated" in the UI — it is NOT booked revenue.
 * Keeping the assumptions in one tunable constant (`ROI_ASSUMPTIONS`) means
 * re-tuning the model is a one-line change, and the unit tests pin the
 * invariants (monotonic, non-negative, no NaN, byChannel sums to total).
 */

/** The funnel shape this estimator consumes (subset of `RoiFunnel`). */
export type RoiFunnelInput = {
  /** Reviews attributed to a QR device scan. */
  reviewsFromQr: number;
  /** Reviews attributed to an outreach review-request (non-voice). */
  reviewsFromOutreach: number;
  /** Reviews attributed to a Voice→Review request (subset of outreach origin). */
  reviewsFromVoice: number;
  /** Reviews with no attribution (organic / direct). */
  reviewsOrganic: number;
  /** Inbound phone calls in range. */
  calls: number;
  /** Confirmed/booked appointments in range. */
  bookings: number;
};

/** Per-establishment assumptions, sourced from `RoiSettings` (with fallbacks). */
export type RoiSettingsInput = {
  /** Average revenue per completed job/appointment. Null → use the default. */
  averageJobValue: number | null;
  /** Fraction of bookings that convert to a paid job (0..1). */
  bookingToJobRate: number;
  /**
   * Fraction of NEW reviews that drive an incremental call (0..1). Null → use
   * the default. This is what attributes review volume to phone revenue — the
   * "reviews → calls → $" link competitors can't close.
   */
  reviewToCallRate: number | null;
  currency: string;
};

/**
 * Tunable model constants. CONSERVATIVE by default — we under-claim rather than
 * over-claim, because over-claiming revenue erodes the trust the feature sells.
 */
export const ROI_ASSUMPTIONS = {
  /** Default job value when an establishment hasn't set one ($). */
  DEFAULT_AVERAGE_JOB_VALUE: 150,
  /** Default booking→job conversion (60% of booked appts become paid jobs). */
  DEFAULT_BOOKING_TO_JOB_RATE: 0.6,
  /** Default review→incremental-call rate (each new review nudges ~8% a call). */
  DEFAULT_REVIEW_TO_CALL_RATE: 0.08,
  /** Of the calls a review drives, the fraction that become a booked job. */
  CALL_TO_JOB_RATE: 0.35,
} as const;

/** Per-channel estimated-revenue breakdown. */
export type RoiByChannel = {
  /** Revenue attributed to booked appointments (the most direct signal). */
  bookings: number;
  /** Incremental revenue attributed to QR-driven reviews. */
  qrReviews: number;
  /** Incremental revenue attributed to outreach-driven reviews (excl. voice). */
  outreachReviews: number;
  /** Incremental revenue attributed to Voice→Review-driven reviews. */
  voiceReviews: number;
};

export type RoiEstimate = {
  /** Total estimated booked revenue ($). Always ≥ 0, never NaN. */
  estimatedRevenue: number;
  /** The split that sums (to cents) to `estimatedRevenue`. */
  byChannel: RoiByChannel;
  /** The exact assumptions used, surfaced for the "how is this computed?" UI. */
  assumptions: {
    averageJobValue: number;
    bookingToJobRate: number;
    reviewToCallRate: number;
    callToJobRate: number;
    currency: string;
  };
};

/** Clamp to a finite, non-negative number (defends against NaN/Infinity/neg). */
function clampNonNeg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Round to whole dollars to avoid floating-point noise in the UI. */
function roundMoney(n: number): number {
  return Math.round(clampNonNeg(n));
}

/**
 * Estimate booked revenue from a funnel + settings. PURE.
 *
 * Model:
 *   bookingRevenue   = bookings × bookingToJobRate × avgJobValue
 *   reviewRevenue(c) = reviewsFromChannel × reviewToCallRate × callToJobRate × avgJobValue
 *   total            = bookingRevenue + Σ reviewRevenue(channel)
 *
 * Organic reviews are intentionally EXCLUDED from attributed revenue — we only
 * claim revenue for reviews repulabs actually drove (QR / outreach / voice).
 */
export function estimateRevenue(
  funnel: RoiFunnelInput,
  settings: RoiSettingsInput,
): RoiEstimate {
  const avgJobValue = clampNonNeg(
    settings.averageJobValue ?? ROI_ASSUMPTIONS.DEFAULT_AVERAGE_JOB_VALUE,
  );
  // Rates clamped to [0,1].
  const bookingToJobRate = clamp01(
    settings.bookingToJobRate ?? ROI_ASSUMPTIONS.DEFAULT_BOOKING_TO_JOB_RATE,
  );
  const reviewToCallRate = clamp01(
    settings.reviewToCallRate ?? ROI_ASSUMPTIONS.DEFAULT_REVIEW_TO_CALL_RATE,
  );
  const callToJobRate = clamp01(ROI_ASSUMPTIONS.CALL_TO_JOB_RATE);

  const bookings = clampNonNeg(funnel.bookings);
  const reviewsFromQr = clampNonNeg(funnel.reviewsFromQr);
  const reviewsFromOutreach = clampNonNeg(funnel.reviewsFromOutreach);
  const reviewsFromVoice = clampNonNeg(funnel.reviewsFromVoice);

  const perReviewValue = reviewToCallRate * callToJobRate * avgJobValue;

  const byChannel: RoiByChannel = {
    bookings: roundMoney(bookings * bookingToJobRate * avgJobValue),
    qrReviews: roundMoney(reviewsFromQr * perReviewValue),
    outreachReviews: roundMoney(reviewsFromOutreach * perReviewValue),
    voiceReviews: roundMoney(reviewsFromVoice * perReviewValue),
  };

  const estimatedRevenue =
    byChannel.bookings + byChannel.qrReviews + byChannel.outreachReviews + byChannel.voiceReviews;

  return {
    estimatedRevenue,
    byChannel,
    assumptions: {
      averageJobValue: avgJobValue,
      bookingToJobRate,
      reviewToCallRate,
      callToJobRate,
      currency: settings.currency || "USD",
    },
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? 1 : n;
}
