import { describe, expect, it } from "vitest";
import {
  computeRecommendations,
  RECOMMENDATION_KINDS,
  type GeoCell,
} from "@/lib/seo/recommendations";

/**
 * Unit — `computeRecommendations` (pure rules engine).
 *
 * Proves: `review_gen` fires only when velocity < competitor median; one
 * `geo_post` per below-threshold (or not-ranking) cell; expected-impact string
 * format; stable priority ordering; `RECOMMENDATION_KINDS` is the fixed set.
 */

describe("RECOMMENDATION_KINDS", () => {
  it("is the fixed set with no dupes", () => {
    expect([...RECOMMENDATION_KINDS]).toEqual(["review_gen", "geo_post"]);
    expect(new Set(RECOMMENDATION_KINDS).size).toBe(RECOMMENDATION_KINDS.length);
  });
});

describe("review_gen trigger", () => {
  it("fires when our velocity is below the competitor median", () => {
    const recs = computeRecommendations({
      ourRecentReviewVelocity: 2,
      competitorVelocities: [8, 10, 12],
    });
    const rg = recs.filter((r) => r.kind === "review_gen");
    expect(rg).toHaveLength(1);
    expect(rg[0]!.expectedImpact).toMatch(/^\+\d+ reviews?\/month/);
  });

  it("does NOT fire when we meet or beat the competitor median", () => {
    const recs = computeRecommendations({
      ourRecentReviewVelocity: 12,
      competitorVelocities: [8, 10, 12],
    });
    expect(recs.some((r) => r.kind === "review_gen")).toBe(false);
  });

  it("with no competitors, fires only when our velocity is stalled (<1)", () => {
    expect(
      computeRecommendations({ ourRecentReviewVelocity: 0, competitorVelocities: [] }).some(
        (r) => r.kind === "review_gen",
      ),
    ).toBe(true);
    expect(
      computeRecommendations({ ourRecentReviewVelocity: 5, competitorVelocities: [] }).some(
        (r) => r.kind === "review_gen",
      ),
    ).toBe(false);
  });
});

describe("geo_post trigger", () => {
  const cells = (positions: (number | null)[]): GeoCell[] =>
    positions.map((position, i) => ({ lat: 30 + i * 0.01, lng: -97 - i * 0.01, position }));

  it("emits one geo_post per below-threshold or not-ranking cell", () => {
    const recs = computeRecommendations({
      ourRecentReviewVelocity: 100,
      competitorVelocities: [1],
      geoGrid: {
        keyword: "dentist near me",
        areaLabel: "South Austin",
        // positions: 1 (ok), 2 (ok), 5 (below thr 3), null (not ranking)
        cells: cells([1, 2, 5, null]),
      },
      geoThreshold: 3,
    });
    const gp = recs.filter((r) => r.kind === "geo_post");
    expect(gp).toHaveLength(2);
  });

  it("not-ranking cell expected-impact says 'break into the top N in {area}'", () => {
    const recs = computeRecommendations({
      ourRecentReviewVelocity: 100,
      competitorVelocities: [1],
      geoGrid: { keyword: "k", areaLabel: "Downtown", cells: cells([null]) },
      geoThreshold: 3,
    });
    const gp = recs.find((r) => r.kind === "geo_post")!;
    expect(gp.expectedImpact).toBe("Break into the top 3 in Downtown");
    expect(gp.payload.action).toBe("schedule_geo_post");
    expect(gp.payload.keyword).toBe("k");
  });

  it("below-threshold cell expected-impact matches '+N positions in {area}'", () => {
    const recs = computeRecommendations({
      ourRecentReviewVelocity: 100,
      competitorVelocities: [1],
      geoGrid: { keyword: "k", areaLabel: "North Loop", cells: cells([7]) },
      geoThreshold: 3,
    });
    const gp = recs.find((r) => r.kind === "geo_post")!;
    expect(gp.expectedImpact).toMatch(/^\+\d+ positions? in North Loop$/);
  });

  it("emits nothing when all cells are within threshold", () => {
    const recs = computeRecommendations({
      ourRecentReviewVelocity: 100,
      competitorVelocities: [1],
      geoGrid: { keyword: "k", cells: cells([1, 2, 3]) },
      geoThreshold: 3,
    });
    expect(recs.some((r) => r.kind === "geo_post")).toBe(false);
  });
});

describe("priority ordering", () => {
  it("is stable and ascending: review_gen, then not-ranking geo, then weak geo", () => {
    const recs = computeRecommendations({
      ourRecentReviewVelocity: 1,
      competitorVelocities: [10],
      geoGrid: {
        keyword: "k",
        areaLabel: "Zone",
        cells: [
          { lat: 1, lng: 1, position: 6 }, // weak → priority 3
          { lat: 2, lng: 2, position: null }, // not ranking → priority 2
        ],
      },
      geoThreshold: 3,
    });
    expect(recs.map((r) => r.kind)).toEqual(["review_gen", "geo_post", "geo_post"]);
    expect(recs.map((r) => r.priority)).toEqual([1, 2, 3]);
  });

  it("identical inputs produce identical output (deterministic)", () => {
    const input = {
      ourRecentReviewVelocity: 2,
      competitorVelocities: [9],
      geoGrid: {
        keyword: "k",
        cells: [{ lat: 1, lng: 1, position: null }],
      },
    };
    expect(computeRecommendations(input)).toEqual(computeRecommendations(input));
  });
});
