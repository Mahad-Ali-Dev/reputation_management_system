import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Moderation CLASSIFIER unit tests (Module 09 — Inbox, Wave 3c-A).
 *
 * Env-safety is the headline guarantee: with NO Anthropic key, classifyContent
 * must use the deterministic heuristic and make NO network call. The heuristic
 * itself must be stable + bounded to 0..1.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Spy on the Anthropic client to prove no call happens when unconfigured.
const createSpy = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  anthropic: { messages: { create: (...a: unknown[]) => createSpy(...a) } },
  MODELS: { HAIKU: "claude-haiku" },
}));

import { classifyContent, heuristicConfidence, isAiConfigured } from "@/lib/moderation/classify";

const ORG = "11111111-1111-4111-8111-111111111111";
const KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  createSpy.mockReset();
});
afterEach(() => {
  if (KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = KEY;
});

describe("heuristicConfidence", () => {
  it("scores benign text near zero", () => {
    const r = heuristicConfidence("thank you so much, the team was lovely");
    expect(r.confidence).toBeLessThan(0.3);
    expect(r.label).toBe("benign");
  });

  it("scores abusive text high and labels it abusive", () => {
    const r = heuristicConfidence("you are a fucking scam, total fraud idiots");
    expect(r.confidence).toBeGreaterThan(0.5);
    expect(["abusive", "spam", "negative"]).toContain(r.label);
  });

  it("flags link-stuffed spam", () => {
    const r = heuristicConfidence("FREE MONEY click here http://x.io https://y.io");
    expect(r.label).toBe("spam");
  });

  it("always returns a 0..1 score", () => {
    for (const s of ["", "ok", "WORST GARBAGE TRASH SCAM FRAUD LIAR", "neutral words here"]) {
      const r = heuristicConfidence(s);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("empty body → confidence 0, heuristic true", () => {
    expect(heuristicConfidence("")).toEqual({ confidence: 0, label: "benign", heuristic: true });
  });
});

describe("classifyContent — env safety", () => {
  it("makes NO model call and uses the heuristic when no key is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAiConfigured()).toBe(false);
    const r = await classifyContent({ orgId: ORG, body: "you absolute fraud scam" });
    expect(createSpy).not.toHaveBeenCalled();
    expect(r.heuristic).toBe(true);
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("empty body short-circuits to benign without a call", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const r = await classifyContent({ orgId: ORG, body: "   " });
    expect(createSpy).not.toHaveBeenCalled();
    expect(r).toEqual({ confidence: 0, label: "benign", heuristic: true });
  });

  it("falls back to the heuristic (never throws) if the model call errors", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    createSpy.mockRejectedValue(new Error("network"));
    const r = await classifyContent({ orgId: ORG, body: "this is a scam fraud rip-off" });
    expect(r.heuristic).toBe(true);
    expect(r.confidence).toBeGreaterThan(0);
  });
});
