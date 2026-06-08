import { describe, expect, it } from "vitest";
import { computeNps, npsBucket } from "@/lib/surveys/queries";

/**
 * NPS math is the load-bearing correctness claim of the surveys module
 * (acceptance criterion: "% Promoters − % Detractors"). These exercise the
 * pure `computeNps` helper with no DB.
 */
describe("computeNps", () => {
  it("returns null for an empty array", () => {
    expect(computeNps([])).toBeNull();
  });

  it("is % promoters − % detractors, rounded to an integer", () => {
    // 2 promoters (9,10), 1 passive (8), 1 detractor (3) of 4
    // 50% − 25% = +25
    expect(computeNps([9, 10, 8, 3])).toBe(25);
  });

  it("all promoters → 100", () => {
    expect(computeNps([9, 10, 9, 10])).toBe(100);
  });

  it("all detractors → -100", () => {
    expect(computeNps([0, 1, 6, 6])).toBe(-100);
  });

  it("all passives → 0", () => {
    expect(computeNps([7, 8, 7, 8])).toBe(0);
  });

  it("honors bucket boundaries (9-10 promoter, 7-8 passive, 0-6 detractor)", () => {
    expect(npsBucket(10)).toBe("promoter");
    expect(npsBucket(9)).toBe("promoter");
    expect(npsBucket(8)).toBe("passive");
    expect(npsBucket(7)).toBe("passive");
    expect(npsBucket(6)).toBe("detractor");
    expect(npsBucket(0)).toBe("detractor");
  });

  it("rounds to the nearest integer", () => {
    // 1 promoter of 3 = 33.33% − 0% = 33
    expect(computeNps([9, 7, 8])).toBe(33);
    // 2 promoters, 1 detractor of 3 = 66.67% − 33.33% = 33.33 → 33
    expect(computeNps([9, 10, 0])).toBe(33);
  });

  it("ignores out-of-range scores", () => {
    // -1 and 11 dropped; remaining [9,3] → 50% − 50% = 0
    expect(computeNps([-1, 9, 3, 11])).toBe(0);
  });

  it("ignores NaN / Infinity", () => {
    expect(computeNps([Number.NaN, Number.POSITIVE_INFINITY, 9, 10])).toBe(100);
  });
});
