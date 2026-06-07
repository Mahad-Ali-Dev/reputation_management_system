import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Survey AI Insights tests (Module 11).
 *
 * Part A — pure contracts (no DB, no network): the fixed taxonomy sets, the
 * total priority→colour map, and the gating helper.
 *
 * Part B — mocked-AI engine: the Anthropic client, budget, entitlement, and the
 * tenant DB are all mocked. Asserts the tool-use payload maps to insight rows +
 * a cost-logged ai_messages row, and — critically — that with NO ANTHROPIC_API_KEY
 * the generator NO-OPS (returns cached, makes ZERO paid calls).
 */

// ── Part A: pure ──────────────────────────────────────────────────────────────
import {
  INSIGHT_PRIORITIES,
  INSIGHT_TYPES,
  isGated,
  MIN_RESPONSES_FOR_INSIGHTS,
  PRIORITY_COLOR,
  coercePriority,
  coerceType,
} from "@/lib/surveys/insights";

describe("INSIGHT_TYPES / INSIGHT_PRIORITIES (fixed sets)", () => {
  it("INSIGHT_TYPES has the expected members and no dupes", () => {
    expect([...INSIGHT_TYPES]).toEqual([
      "recurring_negative_theme",
      "staff_highlight",
      "nps_trend",
      "survey_fatigue",
      "period_comparison",
      "improvement_rec",
    ]);
    expect(new Set(INSIGHT_TYPES).size).toBe(INSIGHT_TYPES.length);
  });

  it("INSIGHT_PRIORITIES is exactly red/orange/green/blue with no dupes", () => {
    expect([...INSIGHT_PRIORITIES]).toEqual(["red", "orange", "green", "blue"]);
    expect(new Set(INSIGHT_PRIORITIES).size).toBe(INSIGHT_PRIORITIES.length);
  });

  it("PRIORITY_COLOR is total over INSIGHT_PRIORITIES", () => {
    for (const p of INSIGHT_PRIORITIES) {
      expect(typeof PRIORITY_COLOR[p]).toBe("string");
      expect(PRIORITY_COLOR[p].length).toBeGreaterThan(0);
    }
    expect(Object.keys(PRIORITY_COLOR).sort()).toEqual([...INSIGHT_PRIORITIES].sort());
  });
});

describe("isGated", () => {
  it("gates below the threshold and ungates at/above it", () => {
    expect(MIN_RESPONSES_FOR_INSIGHTS).toBe(10);
    expect(isGated(0)).toBe(true);
    expect(isGated(9)).toBe(true);
    expect(isGated(10)).toBe(false);
    expect(isGated(50)).toBe(false);
  });
});

describe("coercePriority / coerceType (defensive on model output)", () => {
  it("passes through known values", () => {
    expect(coercePriority("red")).toBe("red");
    expect(coerceType("staff_highlight")).toBe("staff_highlight");
  });
  it("falls back for unknown values", () => {
    expect(coercePriority("magenta")).toBe("blue");
    expect(coerceType("totally_made_up")).toBe("improvement_rec");
  });
});

// ── Part B: mocked-AI engine ──────────────────────────────────────────────────

const messagesCreate = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  MODELS: { SONNET: "claude-sonnet-test", HAIKU: "h", OPUS: "o" },
  PRICING: {
    "claude-sonnet-test": { input: 3, output: 15, cache_read: 0.3, cache_write_5m: 3.75 },
  },
  anthropic: { messages: { create: (...args: unknown[]) => messagesCreate(...args) } },
}));

vi.mock("@/lib/billing/entitlements", () => ({
  assertEntitled: vi.fn(async () => {}),
  PlanInactiveError: class PlanInactiveError extends Error {},
}));

vi.mock("@/lib/ai/budget", () => ({
  checkBudget: vi.fn(async () => ({ ok: true, spentMicros: 0, capMicros: 4_000_000, remainingMicros: 4_000_000 })),
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

// In-memory tenant DB. surveyResponse.findMany returns the corpus; insight
// create/delete + aiMessage create are captured.
const dbState = {
  corpus: [] as Array<{ createdAt: Date; ratingSummary: unknown; answers: Array<{ value: unknown; question: { type: string } }> }>,
  cachedInsights: [] as Array<Record<string, unknown>>,
  createdInsights: [] as Array<Record<string, unknown>>,
  deletedInsights: 0,
  aiMessages: [] as Array<Record<string, unknown>>,
};

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      surveyResponse: {
        findMany: async () => dbState.corpus,
      },
      surveyInsight: {
        findMany: async () => dbState.cachedInsights,
        deleteMany: async () => {
          dbState.deletedInsights++;
          return { count: dbState.cachedInsights.length };
        },
        createMany: async (a: { data: Array<Record<string, unknown>> }) => {
          dbState.createdInsights.push(...a.data);
          return { count: a.data.length };
        },
      },
      aiMessage: {
        create: async (a: { data: Record<string, unknown> }) => {
          dbState.aiMessages.push(a.data);
          return { id: "ai-msg-1", ...a.data };
        },
      },
    }),
}));

import { generateSurveyInsights } from "@/lib/surveys/insights";

function corpusOf(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    createdAt: new Date(),
    ratingSummary: null,
    answers: [
      { value: { number: i % 11 }, question: { type: "nps" } },
      { value: { text: `comment ${i}` }, question: { type: "text" } },
    ],
  }));
}

function mockToolResponse() {
  return {
    id: "msg_insights",
    content: [
      {
        type: "tool_use",
        name: "emit_survey_insights",
        input: {
          insights: [
            {
              type: "recurring_negative_theme",
              priority: "red",
              headline: "Wait times are your #1 issue",
              description: "12 of 30 comments mention long waits.",
              recommendation: "Add a second front-desk shift at peak hours.",
              evidenceCount: 12,
            },
            {
              type: "staff_highlight",
              priority: "green",
              headline: "Customers love Dr. Lee",
              description: "Named positively 8 times.",
              recommendation: "Feature Dr. Lee in marketing.",
              evidenceCount: 8,
            },
          ],
        },
      },
    ],
    usage: { input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}

const ORG = "00000000-0000-0000-0000-000000000001";

beforeEach(() => {
  messagesCreate.mockReset();
  dbState.corpus = [];
  dbState.cachedInsights = [];
  dbState.createdInsights = [];
  dbState.deletedInsights = 0;
  dbState.aiMessages = [];
  messagesCreate.mockResolvedValue(mockToolResponse());
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("generateSurveyInsights — gating", () => {
  it("returns gated when below the response threshold (no AI call)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-realkey";
    dbState.corpus = corpusOf(9);
    const res = await generateSurveyInsights(ORG);
    expect(res).toMatchObject({ ok: true, gated: true, responseCount: 9 });
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});

describe("generateSurveyInsights — env gate (adapter rule)", () => {
  it("makes ZERO paid calls with no ANTHROPIC_API_KEY and returns cached", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    dbState.corpus = corpusOf(30);
    dbState.cachedInsights = [
      {
        type: "nps_trend",
        priority: "blue",
        headline: "cached",
        description: "d",
        recommendation: "r",
        evidenceCount: 3,
        generatedAt: new Date(),
        basedOnResponseCount: 30,
      },
    ];
    const res = await generateSurveyInsights(ORG);
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_key");
    expect(res.insights[0]?.headline).toBe("cached");
  });

  it("treats the placeholder key as no key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-...";
    dbState.corpus = corpusOf(30);
    const res = await generateSurveyInsights(ORG);
    expect(messagesCreate).not.toHaveBeenCalled();
    if (!res.ok) expect(res.reason).toBe("no_key");
  });
});

describe("generateSurveyInsights — happy path (mocked AI)", () => {
  it("maps tool-use output to insight rows, replace-all upserts, logs one ai_messages row", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-realkey";
    dbState.corpus = corpusOf(30);

    const res = await generateSurveyInsights(ORG);

    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const call = messagesCreate.mock.calls[0]![0] as {
      model: string;
      tool_choice: { name: string };
      messages: Array<{ content: string }>;
    };
    expect(call.model).toBe("claude-sonnet-test");
    expect(call.tool_choice.name).toBe("emit_survey_insights");
    // Corpus is fenced as DATA.
    expect(call.messages[0]!.content).toContain("<survey_corpus");

    expect(res.ok).toBe(true);
    if (res.ok && !res.gated) {
      expect(res.insights).toHaveLength(2);
      expect(res.insights[0]).toMatchObject({ type: "recurring_negative_theme", priority: "red", evidenceCount: 12 });
      expect(res.basedOnResponseCount).toBe(30);
    }

    // replace-all: delete then createMany
    expect(dbState.deletedInsights).toBe(1);
    expect(dbState.createdInsights).toHaveLength(2);

    // exactly one cost-logged ai_messages row, purpose survey_insights
    expect(dbState.aiMessages).toHaveLength(1);
    const msg = dbState.aiMessages[0]!;
    expect(msg.purpose).toBe("survey_insights");
    expect(msg.model).toBe("claude-sonnet-test");
    // 1000*3 + 300*15 = 3000 + 4500 = 7500 micros
    expect(msg.costMicros).toBe(7500);
  });
});
