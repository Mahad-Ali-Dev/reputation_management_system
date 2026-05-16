import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

/**
 * Tests the determinism of the rollout-percentage hash.
 *
 * Same org + same key → same bucket forever (no flicker).
 * Distribution across 1000 orgs should be roughly uniform.
 *
 * We replicate the formula from lib/flags/client.ts directly here because the
 * function isn't exported (it's internal to evaluateFlag). If you change the
 * hash formula there, mirror it here too.
 */
function rolloutHash(orgId: string, key: string): number {
  const h = createHash("sha256").update(`${orgId}:${key}`).digest();
  const n = (((h[0]! << 24) | (h[1]! << 16) | (h[2]! << 8) | h[3]!) >>> 0);
  return n % 100;
}

describe("rollout hash", () => {
  it("is deterministic for the same org+key", () => {
    const a = rolloutHash("00000000-0000-0000-0000-000000000001", "feature_x");
    const b = rolloutHash("00000000-0000-0000-0000-000000000001", "feature_x");
    expect(a).toBe(b);
  });

  it("returns a value in [0, 99]", () => {
    for (let i = 0; i < 100; i++) {
      const v = rolloutHash(`org-${i}`, "feature_y");
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(100);
    }
  });

  it("distributes orgs roughly uniformly", () => {
    // Generate 10_000 synthetic orgs, count how many land in each decile
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const h = rolloutHash(`org-${i.toString(16).padStart(8, "0")}`, "k");
      buckets[Math.floor(h / 10)]!++;
    }
    // Each decile should be within ±20% of the mean (1000)
    for (const b of buckets) {
      expect(b).toBeGreaterThan(800);
      expect(b).toBeLessThan(1200);
    }
  });

  it("different keys produce independent hashes for the same org", () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const keys = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const results = keys.map((k) => rolloutHash(orgId, k));
    // Highly unlikely to all be equal; sanity check >= 8 distinct values
    const distinct = new Set(results);
    expect(distinct.size).toBeGreaterThanOrEqual(8);
  });
});
