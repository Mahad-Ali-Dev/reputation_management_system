import { describe, it, expect } from "vitest";
import { TOPIC_TAXONOMY } from "@/lib/ai/topic-sentiment";

describe("Topic taxonomy", () => {
  it("contains a fixed set of categories", () => {
    expect(TOPIC_TAXONOMY).toContain("service_quality");
    expect(TOPIC_TAXONOMY).toContain("staff");
    expect(TOPIC_TAXONOMY).toContain("pricing");
    expect(TOPIC_TAXONOMY).toContain("cleanliness");
    expect(TOPIC_TAXONOMY).toContain("food_quality");
    expect(TOPIC_TAXONOMY).toContain("other");
  });

  it("has no duplicate labels", () => {
    const set = new Set(TOPIC_TAXONOMY);
    expect(set.size).toBe(TOPIC_TAXONOMY.length);
  });

  it("uses snake_case labels only", () => {
    for (const t of TOPIC_TAXONOMY) {
      expect(t).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("is short enough to be useful (< 20 labels)", () => {
    // Long taxonomies make the downstream chart unusable
    expect(TOPIC_TAXONOMY.length).toBeLessThan(20);
  });
});
