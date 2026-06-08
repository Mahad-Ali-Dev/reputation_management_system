import { describe, expect, it } from "vitest";
import {
  type RoiFunnelInput,
  type RoiSettingsInput,
  ROI_ASSUMPTIONS,
  estimateRevenue,
} from "@/lib/roi/estimate";

/** Pure money-math tests — pins the invariants so re-tuning can't regress them. */

const ZERO_FUNNEL: RoiFunnelInput = {
  reviewsFromQr: 0,
  reviewsFromOutreach: 0,
  reviewsFromVoice: 0,
  reviewsOrganic: 0,
  calls: 0,
  bookings: 0,
};

const SETTINGS: RoiSettingsInput = {
  averageJobValue: 200,
  bookingToJobRate: 0.6,
  reviewToCallRate: 0.1,
  currency: "USD",
};

function funnel(overrides: Partial<RoiFunnelInput> = {}): RoiFunnelInput {
  return { ...ZERO_FUNNEL, ...overrides };
}

describe("estimateRevenue", () => {
  it("zero funnel → zero revenue (no NaN, no negative)", () => {
    const r = estimateRevenue(ZERO_FUNNEL, SETTINGS);
    expect(r.estimatedRevenue).toBe(0);
    expect(Number.isNaN(r.estimatedRevenue)).toBe(false);
    expect(r.estimatedRevenue).toBeGreaterThanOrEqual(0);
    expect(r.byChannel.bookings).toBe(0);
    expect(r.byChannel.qrReviews).toBe(0);
    expect(r.byChannel.outreachReviews).toBe(0);
    expect(r.byChannel.voiceReviews).toBe(0);
  });

  it("byChannel sums to estimatedRevenue", () => {
    const r = estimateRevenue(
      funnel({ bookings: 10, reviewsFromQr: 5, reviewsFromOutreach: 4, reviewsFromVoice: 3 }),
      SETTINGS,
    );
    const sum =
      r.byChannel.bookings +
      r.byChannel.qrReviews +
      r.byChannel.outreachReviews +
      r.byChannel.voiceReviews;
    expect(sum).toBe(r.estimatedRevenue);
  });

  it("is monotonic in bookings", () => {
    const a = estimateRevenue(funnel({ bookings: 5 }), SETTINGS);
    const b = estimateRevenue(funnel({ bookings: 10 }), SETTINGS);
    expect(b.estimatedRevenue).toBeGreaterThan(a.estimatedRevenue);
  });

  it("is monotonic in averageJobValue", () => {
    const a = estimateRevenue(funnel({ bookings: 10 }), { ...SETTINGS, averageJobValue: 100 });
    const b = estimateRevenue(funnel({ bookings: 10 }), { ...SETTINGS, averageJobValue: 300 });
    expect(b.estimatedRevenue).toBeGreaterThan(a.estimatedRevenue);
  });

  it("bookings revenue = bookings × bookingToJobRate × avgJobValue", () => {
    const r = estimateRevenue(funnel({ bookings: 10 }), SETTINGS);
    // 10 × 0.6 × 200 = 1200
    expect(r.byChannel.bookings).toBe(1200);
  });

  it("organic reviews contribute zero attributed revenue", () => {
    const withOrganic = estimateRevenue(funnel({ reviewsOrganic: 100 }), SETTINGS);
    expect(withOrganic.estimatedRevenue).toBe(0);
  });

  it("uses defaults when settings are null", () => {
    const r = estimateRevenue(funnel({ bookings: 10 }), {
      averageJobValue: null,
      bookingToJobRate: ROI_ASSUMPTIONS.DEFAULT_BOOKING_TO_JOB_RATE,
      reviewToCallRate: null,
      currency: "USD",
    });
    expect(r.assumptions.averageJobValue).toBe(ROI_ASSUMPTIONS.DEFAULT_AVERAGE_JOB_VALUE);
    expect(r.assumptions.reviewToCallRate).toBe(ROI_ASSUMPTIONS.DEFAULT_REVIEW_TO_CALL_RATE);
    expect(r.estimatedRevenue).toBeGreaterThan(0);
  });

  it("surfaces the assumptions used", () => {
    const r = estimateRevenue(funnel({ bookings: 1 }), SETTINGS);
    expect(r.assumptions.averageJobValue).toBe(200);
    expect(r.assumptions.bookingToJobRate).toBe(0.6);
    expect(r.assumptions.callToJobRate).toBe(ROI_ASSUMPTIONS.CALL_TO_JOB_RATE);
    expect(r.assumptions.currency).toBe("USD");
  });

  it("defends against garbage input (negative / NaN / Infinity) → 0, never NaN", () => {
    const r = estimateRevenue(
      funnel({ bookings: -5, reviewsFromQr: Number.NaN, reviewsFromVoice: Number.POSITIVE_INFINITY }),
      { averageJobValue: -100, bookingToJobRate: 5, reviewToCallRate: -1, currency: "" },
    );
    expect(Number.isNaN(r.estimatedRevenue)).toBe(false);
    expect(r.estimatedRevenue).toBeGreaterThanOrEqual(0);
    expect(r.assumptions.currency).toBe("USD"); // empty → default
    expect(r.assumptions.bookingToJobRate).toBeLessThanOrEqual(1); // clamped
  });

  it("voice reviews are valued the same per-review as outreach reviews", () => {
    const v = estimateRevenue(funnel({ reviewsFromVoice: 7 }), SETTINGS);
    const o = estimateRevenue(funnel({ reviewsFromOutreach: 7 }), SETTINGS);
    expect(v.byChannel.voiceReviews).toBe(o.byChannel.outreachReviews);
  });
});
