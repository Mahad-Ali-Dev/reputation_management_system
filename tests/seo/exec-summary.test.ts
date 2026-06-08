import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit (mocked AI) — `generateExecSummary`.
 *
 * Proves: with `ANTHROPIC_API_KEY` unset, returns the deterministic fallback and
 * NEVER calls `runAiAssist`; with a mocked `runAiAssist`, returns the model
 * summary; entitlement/budget errors degrade to the fallback (no throw). No live
 * paid call in any path.
 *
 * `runAiAssist`, `buildOverviewMetrics`, and the logger are mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const ORG = "11111111-1111-4111-8111-111111111111";

const h = vi.hoisted(() => {
  class PlanInactiveError extends Error {
    readonly code = "plan_inactive";
    constructor() {
      super("plan_inactive");
      this.name = "PlanInactiveError";
    }
  }
  class AiBudgetError extends Error {
    readonly code = "ai_budget";
    constructor() {
      super("ai_budget");
      this.name = "AiBudgetError";
    }
  }
  return { PlanInactiveError, AiBudgetError, runAiAssist: vi.fn() };
});

vi.mock("@/lib/ai/assist", () => ({
  runAiAssist: (...a: unknown[]) => h.runAiAssist(...(a as [])),
  AiBudgetError: h.AiBudgetError,
}));
vi.mock("@/lib/billing/entitlements", () => ({
  PlanInactiveError: h.PlanInactiveError,
}));

const METRICS = vi.hoisted(() => ({
  value: {
    rangeDays: 30,
    reputation: {
      reviewCount: 12,
      avgRating: 4.6,
      responseRate: 75,
      scanCount: 30,
      npsScore: 40,
      conversationCount: 5,
      recentReviewVelocity: 12,
      daysSinceLastReview: 2,
      reviewsPerDay: [],
      ratingBreakdown: [],
    },
    seo: { reputationScore: 78, scoreFactors: [], localPackPosition: 3, websiteSessions: 1500 },
    connected: { ga4: false, gbp: true, rankTracking: false },
  },
}));
const buildOverviewMetrics = vi.fn(async () => METRICS.value);
vi.mock("@/lib/seo/overview", () => ({
  buildOverviewMetrics: (...a: unknown[]) => buildOverviewMetrics(...(a as [])),
}));

import { generateExecSummary, fallbackSummary } from "@/lib/seo/exec-summary";

let savedKey: string | undefined;
beforeEach(() => {
  h.runAiAssist.mockReset();
  buildOverviewMetrics.mockClear();
  savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

describe("generateExecSummary — no key", () => {
  it("returns deterministic fallback and NEVER calls runAiAssist", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await generateExecSummary(ORG, 30);
    expect(res.ai).toBe(false);
    expect(res.summary).toBe(fallbackSummary(METRICS.value));
    expect(res.generatedAt).toBeInstanceOf(Date);
    expect(h.runAiAssist).not.toHaveBeenCalled();
  });
});

describe("generateExecSummary — AI path", () => {
  it("returns the model summary when runAiAssist yields an option", async () => {
    h.runAiAssist.mockResolvedValueOnce({
      purpose: "seo_recommendation",
      options: [{ text: "Reviews are up and your rating is strong.", confidence: 0.9, blocked: false, safetyFlags: [], aiMessageId: "m1" }],
      usedChunkIds: [],
      costMicros: 100,
      knowledgeGapId: null,
      escalated: false,
      promptVersionId: "pv1",
    });
    const res = await generateExecSummary(ORG, 30);
    expect(res.ai).toBe(true);
    expect(res.summary).toBe("Reviews are up and your rating is strong.");
    expect(h.runAiAssist).toHaveBeenCalledTimes(1);
    // Uses the reserved purpose, never a forked one.
    expect((h.runAiAssist.mock.calls[0]![0] as { purpose: string }).purpose).toBe(
      "seo_recommendation",
    );
  });

  it("empty model text → falls back without throwing", async () => {
    h.runAiAssist.mockResolvedValueOnce({
      purpose: "seo_recommendation",
      options: [{ text: "   ", confidence: 0.5, blocked: false, safetyFlags: [], aiMessageId: "m1" }],
      usedChunkIds: [],
      costMicros: 0,
      knowledgeGapId: null,
      escalated: false,
      promptVersionId: null,
    });
    const res = await generateExecSummary(ORG, 30);
    expect(res.ai).toBe(false);
    expect(res.summary).toBe(fallbackSummary(METRICS.value));
  });

  it("PlanInactiveError → fallback (no throw)", async () => {
    h.runAiAssist.mockRejectedValueOnce(new h.PlanInactiveError());
    const res = await generateExecSummary(ORG, 30);
    expect(res.ai).toBe(false);
    expect(res.summary).toBe(fallbackSummary(METRICS.value));
  });

  it("AiBudgetError → fallback (no throw)", async () => {
    h.runAiAssist.mockRejectedValueOnce(new h.AiBudgetError());
    const res = await generateExecSummary(ORG, 30);
    expect(res.ai).toBe(false);
  });

  it("accepts prebuilt metrics (skips the aggregate pass)", async () => {
    h.runAiAssist.mockResolvedValueOnce({
      purpose: "seo_recommendation",
      options: [{ text: "Prebuilt path.", confidence: 0.9, blocked: false, safetyFlags: [], aiMessageId: "m1" }],
      usedChunkIds: [],
      costMicros: 1,
      knowledgeGapId: null,
      escalated: false,
      promptVersionId: null,
    });
    await generateExecSummary(ORG, 30, METRICS.value);
    expect(buildOverviewMetrics).not.toHaveBeenCalled();
  });
});

describe("fallbackSummary", () => {
  it("mentions review count, rating, and the score", () => {
    const s = fallbackSummary(METRICS.value);
    expect(s).toMatch(/12 new reviews/);
    expect(s).toMatch(/4\.60/);
    expect(s).toMatch(/78\/100/);
  });

  it("handles the zero-review empty state", () => {
    const empty = {
      ...METRICS.value,
      reputation: { ...METRICS.value.reputation, reviewCount: 0 },
    };
    const s = fallbackSummary(empty);
    expect(s).toMatch(/No new reviews/);
  });
});
