import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AiAssist orchestrator (00_foundation §A4) — `runAiAssist` in
 * `lib/ai/assist/index.ts`. The load-bearing behavior under test is the
 * §A4.4 confidence threshold → §A4.6 learning loop:
 *
 *   best option confidence >= threshold (0.7)  → return options, NO KnowledgeGap
 *   best option confidence <  threshold        → WRITE a KnowledgeGap, surface its id
 *
 * We mock the orchestrator's sibling seams (the same boundary the spec calls
 * out — anthropic client + retrieveChunks live inside `./generate` and
 * `./context`, so mocking those modules substitutes for mocking the SDK), the
 * paid-feature gate, and `checkBudget`. Crucially we DO NOT mock
 * `./confidence` — the real `scoreConfidence`/`isLowConfidence` (and the real
 * 0.7 threshold from `./types`) decide, so this test actually exercises the
 * threshold rather than a stubbed verdict. `inbox_reply` is a SELF_RATED_PURPOSE,
 * so the model self-rating we feed via `generate` flows straight to the score.
 *
 * vitest env is node; this is plain async server code.
 */

// ---- paid-feature gate + budget (always pass unless a test overrides) ----
const assertEntitled = vi.fn(async (_orgId: string) => undefined);
vi.mock("@/lib/billing/entitlements", () => ({
  assertEntitled: (orgId: string) => assertEntitled(orgId),
}));

const checkBudget = vi.fn(async (_orgId: string) => ({
  ok: true,
  spentMicros: 0,
  capMicros: 1_000_000,
}));
vi.mock("@/lib/ai/budget", () => ({
  checkBudget: (orgId: string) => checkBudget(orgId),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---- context assembly (stands in for KB retrieveChunks + rerank + profile) ----
const assembleContext = vi.fn(async () => ({
  kbChunks: [{ id: "c1" }],
  usedChunkIds: ["c1"],
  rerankRationaleStrong: true,
  costMicros: 10,
}));
vi.mock("@/lib/ai/assist/context", () => ({
  assembleContext: () => assembleContext(),
}));

// ---- generation (stands in for the anthropic client). modelSelfRating is the
// confidence dial for self-rated purposes like inbox_reply. ----
type GenOpt = {
  text: string;
  aiMessageId: string;
  costMicros: number;
  modelSelfRating?: number | null;
};
const genState: { options: GenOpt[]; promptVersionId: string | null } = {
  options: [],
  promptVersionId: "pv1",
};
const generate = vi.fn(async () => ({
  options: genState.options,
  promptVersionId: genState.promptVersionId,
}));
vi.mock("@/lib/ai/assist/generate", () => ({
  generate: () => generate(),
}));

// ---- safety: clean by default ----
const classifyText = vi.fn(async (_args: { candidate: string }) => ({
  blocked: false,
  flags: [] as string[],
}));
vi.mock("@/lib/ai/assist/safety", () => ({
  classifyText: (args: { candidate: string }) => classifyText(args),
}));

// ---- the KnowledgeGap write (the thing we assert fires or not) ----
const writeKnowledgeGap = vi.fn(async (_args: { confidence: number }) => ({
  id: "gap-1",
}));
vi.mock("@/lib/ai/assist/knowledge-gap", () => ({
  writeKnowledgeGap: (args: { confidence: number }) => writeKnowledgeGap(args),
}));

// ---- escalation hook ----
const runEscalation = vi.fn(async () => undefined);
vi.mock("@/lib/ai/assist/escalate", () => ({
  runEscalation: () => runEscalation(),
}));

import { runAiAssist } from "@/lib/ai/assist";
import { AiBudgetError } from "@/lib/ai/assist/types";

const ORG = "org-123";
const LONG = "x".repeat(120); // length heuristic non-zero; irrelevant for self-rated

function setOptions(opts: GenOpt[]): void {
  genState.options = opts;
}

beforeEach(() => {
  assertEntitled.mockClear().mockResolvedValue(undefined);
  checkBudget.mockClear().mockResolvedValue({
    ok: true,
    spentMicros: 0,
    capMicros: 1_000_000,
  });
  assembleContext.mockClear();
  generate.mockClear();
  classifyText.mockClear();
  writeKnowledgeGap.mockClear().mockResolvedValue({ id: "gap-1" });
  runEscalation.mockClear();
  genState.options = [];
  genState.promptVersionId = "pv1";
});

afterEach(() => {
  delete process.env.AI_ASSIST_CONFIDENCE_THRESHOLD;
});

describe("runAiAssist — confidence >= threshold (no KnowledgeGap)", () => {
  it("returns options and does NOT write a gap when best confidence is high", async () => {
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.92 },
    ]);

    const res = await runAiAssist({
      orgId: ORG,
      purpose: "inbox_reply",
      query: "What are your hours?",
    });

    expect(res.options).toHaveLength(1);
    expect(res.options[0]!.confidence).toBeCloseTo(0.92, 5);
    expect(res.knowledgeGapId).toBeNull();
    expect(writeKnowledgeGap).not.toHaveBeenCalled();
  });

  it("exactly AT the threshold (0.70) is NOT low — no gap (boundary)", async () => {
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.7 },
    ]);

    const res = await runAiAssist({
      orgId: ORG,
      purpose: "inbox_reply",
      query: "hours?",
    });

    // isLowConfidence is `confidence < threshold`, so 0.70 is the inclusive top.
    expect(res.options[0]!.confidence).toBeCloseTo(0.7, 5);
    expect(writeKnowledgeGap).not.toHaveBeenCalled();
    expect(res.knowledgeGapId).toBeNull();
  });

  it("uses the BEST (highest-confidence) option to decide, not the worst", async () => {
    setOptions([
      { text: LONG, aiMessageId: "lo", costMicros: 5, modelSelfRating: 0.4 },
      { text: LONG, aiMessageId: "hi", costMicros: 5, modelSelfRating: 0.95 },
    ]);

    const res = await runAiAssist({
      orgId: ORG,
      purpose: "inbox_reply",
      query: "hours?",
    });

    // Sorted best-first; best is 0.95 ≥ threshold → no gap despite the 0.4 option.
    expect(res.options[0]!.aiMessageId).toBe("hi");
    expect(writeKnowledgeGap).not.toHaveBeenCalled();
  });
});

describe("runAiAssist — confidence < threshold (writes KnowledgeGap)", () => {
  it("writes a gap and surfaces its id when best confidence is low", async () => {
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.35 },
    ]);

    const res = await runAiAssist({
      orgId: ORG,
      purpose: "inbox_reply",
      query: "Do you offer same-day crowns?",
    });

    expect(writeKnowledgeGap).toHaveBeenCalledTimes(1);
    const arg = writeKnowledgeGap.mock.calls[0]![0] as {
      orgId: string;
      confidence: number;
      purpose: string;
      query: string;
    };
    expect(arg.orgId).toBe(ORG);
    expect(arg.purpose).toBe("inbox_reply");
    expect(arg.query).toBe("Do you offer same-day crowns?");
    expect(arg.confidence).toBeCloseTo(0.35, 5);
    expect(res.knowledgeGapId).toBe("gap-1");
  });

  it("just BELOW the threshold (0.69) writes a gap (boundary)", async () => {
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.69 },
    ]);

    await runAiAssist({ orgId: ORG, purpose: "inbox_reply", query: "q" });

    expect(writeKnowledgeGap).toHaveBeenCalledTimes(1);
  });

  it("writes a gap when generate returns NO options (best is undefined)", async () => {
    setOptions([]);

    const res = await runAiAssist({
      orgId: ORG,
      purpose: "inbox_reply",
      query: "q",
    });

    expect(res.options).toHaveLength(0);
    expect(writeKnowledgeGap).toHaveBeenCalledTimes(1);
    const arg = writeKnowledgeGap.mock.calls[0]![0] as { confidence: number };
    expect(arg.confidence).toBe(0); // bestConfidence defaults to 0
    expect(res.knowledgeGapId).toBe("gap-1");
  });

  it("honors an env-overridden threshold (gap fires below the new bar)", async () => {
    process.env.AI_ASSIST_CONFIDENCE_THRESHOLD = "0.9";
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.85 },
    ]);

    // 0.85 ≥ default 0.7 (would be fine) but < the configured 0.9 → low → gap.
    await runAiAssist({ orgId: ORG, purpose: "inbox_reply", query: "q" });

    expect(writeKnowledgeGap).toHaveBeenCalledTimes(1);
  });
});

describe("runAiAssist — escalation only on low confidence + escalate flag", () => {
  it("runs escalation when low-confidence AND escalate:true", async () => {
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.2 },
    ]);

    const res = await runAiAssist({
      orgId: ORG,
      purpose: "inbox_reply",
      query: "q",
      escalate: true,
    });

    expect(writeKnowledgeGap).toHaveBeenCalledTimes(1);
    expect(runEscalation).toHaveBeenCalledTimes(1);
    expect(res.escalated).toBe(true);
  });

  it("does NOT escalate when confidence is high even if escalate:true", async () => {
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.95 },
    ]);

    const res = await runAiAssist({
      orgId: ORG,
      purpose: "inbox_reply",
      query: "q",
      escalate: true,
    });

    expect(runEscalation).not.toHaveBeenCalled();
    expect(res.escalated).toBe(false);
  });

  it("does NOT escalate on low confidence when escalate is unset", async () => {
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.2 },
    ]);

    await runAiAssist({ orgId: ORG, purpose: "inbox_reply", query: "q" });

    expect(writeKnowledgeGap).toHaveBeenCalledTimes(1);
    expect(runEscalation).not.toHaveBeenCalled();
  });
});

describe("runAiAssist — gates run BEFORE generation", () => {
  it("throws AiBudgetError and never generates when the budget is exhausted", async () => {
    checkBudget.mockResolvedValue({
      ok: false,
      spentMicros: 1_000_000,
      capMicros: 1_000_000,
    });
    setOptions([
      { text: LONG, aiMessageId: "m1", costMicros: 5, modelSelfRating: 0.9 },
    ]);

    await expect(
      runAiAssist({ orgId: ORG, purpose: "inbox_reply", query: "q" }),
    ).rejects.toBeInstanceOf(AiBudgetError);

    expect(generate).not.toHaveBeenCalled();
    expect(writeKnowledgeGap).not.toHaveBeenCalled();
  });

  it("propagates an entitlement failure before budget/generate", async () => {
    assertEntitled.mockRejectedValue(new Error("PlanInactive"));

    await expect(
      runAiAssist({ orgId: ORG, purpose: "inbox_reply", query: "q" }),
    ).rejects.toThrow("PlanInactive");

    expect(checkBudget).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });
});
