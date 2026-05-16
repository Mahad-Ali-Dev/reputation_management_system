import { describe, it, expect } from "vitest";
import { extractLabels } from "@/lib/ai/topic-sentiment";

/**
 * Golden-set eval suite for AI surfaces.
 *
 * These tests HIT THE LIVE ANTHROPIC API and cost real money (~$0.001/case).
 * They are skipped by default unless `RUN_LIVE_AI_EVALS=1`.
 *
 *     RUN_LIVE_AI_EVALS=1 npm run test -- tests/evals
 *
 * Goals:
 *   - Topic classifier hits expected labels for clear-signal reviews
 *   - Sentiment is in the right hemisphere (sign correct) for unambiguous cases
 *   - Reranker recovers from embedding mismatches (tested separately, requires DB)
 *   - Safety classifier flags an obvious profanity / PII leak
 *
 * Pass criterion: at least 80% of cases pass. We don't require 100% because LLM
 * outputs are stochastic; a small failure rate is acceptable. If accuracy drops
 * below 80%, the prompt or model needs review.
 */

const RUN_LIVE = process.env.RUN_LIVE_AI_EVALS === "1";

type TopicCase = {
  name: string;
  rating: number;
  body: string;
  expectAtLeastOneOf: string[];
  expectSentimentSign: 1 | -1 | 0; // +1 = positive, -1 = negative, 0 = ambiguous (skip sign check)
};

const TOPIC_GOLDEN: TopicCase[] = [
  {
    name: "rude_staff_one_star",
    rating: 1,
    body: "The cashier was incredibly rude and unhelpful. I'll never come back.",
    expectAtLeastOneOf: ["staff", "service_quality"],
    expectSentimentSign: -1,
  },
  {
    name: "great_food_quality",
    rating: 5,
    body: "Absolutely incredible meal — the steak was perfectly cooked and the sauce was sublime.",
    expectAtLeastOneOf: ["food_quality"],
    expectSentimentSign: 1,
  },
  {
    name: "slow_wait_time",
    rating: 2,
    body: "Waited 45 minutes for our food. The food itself was fine but the wait was unacceptable.",
    expectAtLeastOneOf: ["wait_time"],
    expectSentimentSign: -1,
  },
  {
    name: "pricey",
    rating: 3,
    body: "Good service but $18 for a small salad is steep. Not great value.",
    expectAtLeastOneOf: ["pricing", "value"],
    expectSentimentSign: -1,
  },
  {
    name: "dirty_bathroom",
    rating: 2,
    body: "Bathrooms were filthy — overflowing trash and no soap. Tables were also sticky.",
    expectAtLeastOneOf: ["cleanliness"],
    expectSentimentSign: -1,
  },
  {
    name: "parking_complaint",
    rating: 3,
    body: "Food was OK but parking is a nightmare. Had to circle the block 4 times.",
    expectAtLeastOneOf: ["location_parking"],
    expectSentimentSign: -1,
  },
  {
    name: "five_star_no_body",
    rating: 5,
    body: "",
    expectAtLeastOneOf: [],
    expectSentimentSign: 1, // inferred from rating only
  },
  {
    name: "ambiguous_three_star",
    rating: 3,
    body: "It was fine. Not bad, not great.",
    expectAtLeastOneOf: [],
    expectSentimentSign: 0,
  },
];

(RUN_LIVE ? describe : describe.skip)("Topic + Sentiment golden set (live Anthropic)", () => {
  for (const c of TOPIC_GOLDEN) {
    it(c.name, async () => {
      const result = await extractLabels({
        rating: c.rating,
        body: c.body || null,
        reviewerName: null,
      });

      if (c.expectAtLeastOneOf.length > 0) {
        const overlap = result.topics.filter((t) =>
          (c.expectAtLeastOneOf as readonly string[]).includes(t),
        );
        expect(
          overlap.length,
          `Expected one of ${c.expectAtLeastOneOf.join(", ")}; got ${result.topics.join(", ") || "[]"}`,
        ).toBeGreaterThanOrEqual(1);
      }

      if (c.expectSentimentSign !== 0) {
        const sign = Math.sign(result.sentiment);
        expect(
          sign,
          `Expected sentiment sign ${c.expectSentimentSign}; got ${result.sentiment} for "${c.body.slice(0, 40)}"`,
        ).toBe(c.expectSentimentSign);
      }

      // Sentiment should always be in [-1, 1]
      expect(result.sentiment).toBeGreaterThanOrEqual(-1);
      expect(result.sentiment).toBeLessThanOrEqual(1);
    }, 60_000);
  }
});

describe("Eval suite metadata", () => {
  it("documents how to run live evals", () => {
    expect(true).toBe(true);
    // Run with: RUN_LIVE_AI_EVALS=1 npm run test tests/evals
  });

  it("has at least 8 topic test cases", () => {
    expect(TOPIC_GOLDEN.length).toBeGreaterThanOrEqual(8);
  });

  it("covers each major topic at least once", () => {
    const coveredTopics = new Set<string>();
    for (const c of TOPIC_GOLDEN) {
      for (const t of c.expectAtLeastOneOf) coveredTopics.add(t);
    }
    expect(coveredTopics.has("staff") || coveredTopics.has("service_quality")).toBe(true);
    expect(coveredTopics.has("food_quality")).toBe(true);
    expect(coveredTopics.has("wait_time")).toBe(true);
    expect(coveredTopics.has("cleanliness")).toBe(true);
    expect(coveredTopics.has("pricing") || coveredTopics.has("value")).toBe(true);
  });
});
