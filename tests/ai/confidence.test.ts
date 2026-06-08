import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_GAP_THRESHOLD,
  estimateReplyConfidence,
  isMissingRelationError,
  normalizeQuestion,
} from "@/lib/ai/confidence";

describe("estimateReplyConfidence", () => {
  it("scores empty / trivial answers low", () => {
    expect(estimateReplyConfidence("")).toBe(0);
    expect(estimateReplyConfidence("ok")).toBeLessThan(CONFIDENCE_GAP_THRESHOLD);
  });

  it("scores confident, specific answers high (>= threshold)", () => {
    const ans =
      "We're open Monday to Friday from 9am to 6pm, and Saturday 10am to 4pm. Haircuts start at $35 and we accept all major cards.";
    expect(estimateReplyConfidence(ans)).toBeGreaterThanOrEqual(CONFIDENCE_GAP_THRESHOLD);
  });

  it("drops below threshold for hedging answers", () => {
    expect(estimateReplyConfidence("I'm not sure, but I don't have that information.")).toBeLessThan(
      CONFIDENCE_GAP_THRESHOLD,
    );
    expect(
      estimateReplyConfidence("I don't know — please contact us and we'll get back to you."),
    ).toBeLessThan(CONFIDENCE_GAP_THRESHOLD);
  });

  it("a single soft phrase stays above threshold (conservative)", () => {
    const ans =
      "Yes, we offer balayage starting at $180 and the appointment usually takes about three hours. I'm sorry if there was any confusion earlier.";
    expect(estimateReplyConfidence(ans)).toBeGreaterThanOrEqual(CONFIDENCE_GAP_THRESHOLD - 0.01);
  });

  it("clamps to [0,1]", () => {
    for (const s of ["", "x", "a confident specific helpful answer with many details here"]) {
      const v = estimateReplyConfidence(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("normalizeQuestion", () => {
  it("lowercases, strips punctuation, collapses whitespace", () => {
    expect(normalizeQuestion("  What  are YOUR Hours??? ")).toBe("what are your hours");
  });

  it("collapses two phrasings of the same question to the same key", () => {
    const a = normalizeQuestion("Do you offer parking?");
    const b = normalizeQuestion("do you offer parking");
    expect(a).toBe(b);
  });

  it("caps very long input", () => {
    const long = "a ".repeat(1000);
    expect(normalizeQuestion(long).length).toBeLessThanOrEqual(500);
  });
});

describe("isMissingRelationError", () => {
  it("detects raw 42P01 / 42703 in the message", () => {
    expect(isMissingRelationError(new Error('relation "knowledge_gaps" does not exist (42P01)'))).toBe(true);
    expect(isMissingRelationError(new Error("column foo does not exist 42703"))).toBe(true);
  });

  it("is false for unrelated errors", () => {
    expect(isMissingRelationError(new Error("network timeout"))).toBe(false);
  });
});
