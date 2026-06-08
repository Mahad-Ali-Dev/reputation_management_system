import { describe, expect, it } from "vitest";
import {
  computeReputationScore,
  SCORE_WEIGHTS,
  type ScoreFactorKey,
} from "@/lib/seo/reputation-score";

/**
 * Unit — `computeReputationScore` (pure, no DB/network).
 *
 * Proves: 0–100 clamp; weights sum to 100; missing SEO inputs contribute 0
 * (reputation-only path still scores); monotonic in rating + response rate;
 * empty input floors at 0.
 */

describe("SCORE_WEIGHTS", () => {
  it("sums to 100", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

describe("computeReputationScore — clamp + floors", () => {
  it("empty input → score 0", () => {
    const { score, factors } = computeReputationScore({});
    expect(score).toBe(0);
    expect(factors.every((f) => f.points === 0)).toBe(true);
  });

  it("never exceeds 100 even with perfect inputs", () => {
    const { score } = computeReputationScore({
      avgRating: 5,
      reviewCount: 5000,
      recentReviewCount: 200,
      repliesCount: 5000,
      daysSinceLastReview: 0,
      citationConsistency: 1,
      localPackPosition: 1,
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBe(100);
  });

  it("never goes below 0", () => {
    const { score } = computeReputationScore({
      avgRating: 1,
      reviewCount: 0,
      repliesCount: 0,
      daysSinceLastReview: 365,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("computeReputationScore — SEO inputs contribute 0 when missing", () => {
  it("reputation-only org scores from reputation factors and caps below 100", () => {
    const { score, factors } = computeReputationScore({
      avgRating: 5,
      reviewCount: 5000,
      repliesCount: 5000,
      daysSinceLastReview: 0,
      // No citationConsistency, no localPackPosition.
    });
    const byKey = Object.fromEntries(factors.map((f) => [f.key, f])) as Record<
      ScoreFactorKey,
      (typeof factors)[number]
    >;
    expect(byKey.citation_consistency.points).toBe(0);
    expect(byKey.local_pack.points).toBe(0);
    expect(byKey.citation_consistency.available).toBe(false);
    expect(byKey.local_pack.available).toBe(false);
    // Reputation factors max at 35+20+15+5 = 75.
    expect(score).toBeLessThanOrEqual(75);
    expect(score).toBeGreaterThan(60);
  });

  it("adding SEO data raises the score (the 'connect to reach 100' nudge)", () => {
    const base = {
      avgRating: 5,
      reviewCount: 5000,
      repliesCount: 5000,
      daysSinceLastReview: 0,
    };
    const repOnly = computeReputationScore(base).score;
    const withSeo = computeReputationScore({
      ...base,
      citationConsistency: 1,
      localPackPosition: 1,
    }).score;
    expect(withSeo).toBeGreaterThan(repOnly);
  });

  it("zero is a distinct value from missing for citation consistency", () => {
    const missing = computeReputationScore({ avgRating: 4, reviewCount: 20 });
    const present0 = computeReputationScore({
      avgRating: 4,
      reviewCount: 20,
      citationConsistency: 0,
    });
    const cMissing = missing.factors.find((f) => f.key === "citation_consistency")!;
    const cPresent = present0.factors.find((f) => f.key === "citation_consistency")!;
    expect(cMissing.available).toBe(false);
    expect(cPresent.available).toBe(true);
    // Both earn 0 points, but availability differs (drives the UI).
    expect(cMissing.points).toBe(0);
    expect(cPresent.points).toBe(0);
  });
});

describe("computeReputationScore — monotonicity", () => {
  it("higher rating → higher (or equal) score", () => {
    const mk = (avgRating: number) =>
      computeReputationScore({ avgRating, reviewCount: 50, repliesCount: 25 }).score;
    expect(mk(5)).toBeGreaterThan(mk(4));
    expect(mk(4)).toBeGreaterThan(mk(3.5));
    expect(mk(3)).toBeGreaterThanOrEqual(0);
  });

  it("higher response rate → higher score", () => {
    const mk = (repliesCount: number) =>
      computeReputationScore({ avgRating: 4.5, reviewCount: 100, repliesCount }).score;
    expect(mk(100)).toBeGreaterThan(mk(50));
    expect(mk(50)).toBeGreaterThan(mk(0));
  });

  it("better local-pack position → higher score", () => {
    const mk = (localPackPosition: number) =>
      computeReputationScore({
        avgRating: 4.5,
        reviewCount: 100,
        repliesCount: 80,
        localPackPosition,
      }).score;
    expect(mk(1)).toBeGreaterThan(mk(5));
    expect(mk(5)).toBeGreaterThan(mk(10));
  });
});
