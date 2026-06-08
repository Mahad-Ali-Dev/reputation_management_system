import { describe, it, expect } from "vitest";
import { computeHealthScore, type HealthSignals } from "@/lib/dashboard/health-score";

const base: HealthSignals = { avgRating: 0, responseRate: 0, reviews7d: 0, seo: null };

describe("computeHealthScore", () => {
  it("returns a low score for all-zero signals", () => {
    const r = computeHealthScore(base);
    expect(r.score).toBe(0);
    expect(r.band).toBe("weak");
  });

  it("returns ~100 for perfect live signals (SEO locked)", () => {
    const r = computeHealthScore({ avgRating: 5, responseRate: 100, reviews7d: 20, seo: null });
    expect(r.score).toBe(100);
    expect(r.band).toBe("strong");
  });

  it("clamps the score to 0..100", () => {
    const r = computeHealthScore({ avgRating: 9, responseRate: 999, reviews7d: 9999, seo: 999 });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("reports SEO as a locked metric when seo is null and excludes its weight", () => {
    const r = computeHealthScore({ avgRating: 5, responseRate: 100, reviews7d: 20, seo: null });
    const seo = r.metrics.find((m) => m.key === "seo");
    expect(seo?.status).toBe("locked");
    expect(seo?.value).toMatch(/connect/i);
    // With SEO locked, perfect live signals still reach 100 (weight redistributed).
    expect(r.score).toBe(100);
  });

  it("includes SEO in the score once a non-null seo signal is supplied (no UI change)", () => {
    // Perfect live signals but SEO at 0 → score drops below 100 because SEO now
    // carries weight. This is the Section-13 plug-in path.
    const withSeo = computeHealthScore({ avgRating: 5, responseRate: 100, reviews7d: 20, seo: 0 });
    expect(withSeo.score).toBeLessThan(100);
    const seo = withSeo.metrics.find((m) => m.key === "seo");
    expect(seo?.status).not.toBe("locked");
  });

  it("is monotonic in average rating", () => {
    const low = computeHealthScore({ ...base, avgRating: 2, responseRate: 50, reviews7d: 5 });
    const high = computeHealthScore({ ...base, avgRating: 5, responseRate: 50, reviews7d: 5 });
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("is monotonic in response rate", () => {
    const low = computeHealthScore({ ...base, avgRating: 4, responseRate: 10, reviews7d: 5 });
    const high = computeHealthScore({ ...base, avgRating: 4, responseRate: 90, reviews7d: 5 });
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("is monotonic in review velocity (up to the soft cap)", () => {
    const low = computeHealthScore({ ...base, avgRating: 4, responseRate: 50, reviews7d: 1 });
    const high = computeHealthScore({ ...base, avgRating: 4, responseRate: 50, reviews7d: 10 });
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("always returns exactly four metrics in a stable order", () => {
    const r = computeHealthScore({ avgRating: 4.5, responseRate: 80, reviews7d: 6, seo: null });
    expect(r.metrics.map((m) => m.key)).toEqual(["rating", "responseRate", "velocity", "seo"]);
  });

  it("does not shame a brand-new account with an all-red rating metric", () => {
    const r = computeHealthScore(base);
    const rating = r.metrics.find((m) => m.key === "rating");
    expect(rating?.status).toBe("warn"); // neutral, not "bad", when avgRating === 0
  });
});
