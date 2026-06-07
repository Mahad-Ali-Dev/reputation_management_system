import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Gap router + learning stats + applyTaughtFact.
 * withTenant is mocked with a controllable in-memory KnowledgeGap store so we
 * assert insert/dedup/stat behavior without a live DB.
 */

type Gap = {
  id: string;
  organizationId: string;
  questionNorm: string;
  question: string;
  status: string;
  hitCount: number;
  createdAt: Date;
  answeredAt: Date | null;
  confidence: string | null;
};

const store: { gaps: Gap[]; failWith: Error | null } = { gaps: [], failWith: null };

// knowledge-gaps.ts transitively imports next-auth / next cache+navigation —
// stub them so the unit under test has no framework side effects.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/auth/config", () => ({ auth: async () => null }));
vi.mock("@/lib/billing/entitlements", () => ({ assertEntitled: async () => undefined }));

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) => {
    if (store.failWith) throw store.failWith;
    let seq = store.gaps.length;
    const tx = {
      knowledgeGap: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          store.gaps.find(
            (g) =>
              g.organizationId === where.organizationId &&
              (where.questionNorm === undefined || g.questionNorm === where.questionNorm) &&
              (where.status === undefined || g.status === where.status) &&
              (where.id === undefined || g.id === where.id),
          ) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const g: Gap = {
            id: `g${++seq}`,
            organizationId: data.organizationId as string,
            questionNorm: data.questionNorm as string,
            question: data.question as string,
            status: (data.status as string) ?? "open",
            hitCount: 1,
            createdAt: new Date(),
            answeredAt: null,
            confidence: (data.confidence as string) ?? null,
          };
          store.gaps.push(g);
          return g;
        },
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const g = store.gaps.find((x) => x.id === where.id);
          if (g && data.hitCount && typeof data.hitCount === "object") {
            g.hitCount += (data.hitCount as { increment: number }).increment;
          }
          if (g && data.status) g.status = data.status as string;
          return g;
        },
        count: async ({ where }: { where: Record<string, unknown> }) =>
          store.gaps.filter(
            (g) =>
              g.organizationId === where.organizationId &&
              (where.status === undefined || g.status === where.status),
          ).length,
        aggregate: async ({ where }: { where: Record<string, unknown> }) => ({
          _sum: {
            hitCount: store.gaps
              .filter(
                (g) =>
                  g.organizationId === where.organizationId &&
                  (where.status === undefined || g.status === where.status),
              )
              .reduce((s, g) => s + g.hitCount, 0),
          },
        }),
      },
    };
    return fn(tx);
  },
}));

const ORG = "00000000-0000-4000-8000-00000000000a";

beforeEach(() => {
  store.gaps = [];
  store.failWith = null;
});

describe("recordConfidence / recordKnowledgeGap", () => {
  it("does NOT record a gap for confidence >= threshold", async () => {
    const { recordConfidence } = await import("@/lib/ai/confidence");
    await recordConfidence({
      orgId: ORG,
      purpose: "chatbot",
      question: "what are your hours",
      answer: "9-5",
      confidence: 0.92,
      source: "widget",
    });
    expect(store.gaps).toHaveLength(0);
  });

  it("records a gap for confidence < threshold", async () => {
    const { recordConfidence } = await import("@/lib/ai/confidence");
    await recordConfidence({
      orgId: ORG,
      purpose: "chatbot",
      question: "do you do gel nails",
      answer: "not sure",
      confidence: 0.3,
      source: "widget",
    });
    expect(store.gaps).toHaveLength(1);
    expect(store.gaps[0]?.question).toBe("do you do gel nails");
  });

  it("increments hitCount on a duplicate normalized question instead of inserting", async () => {
    const { recordKnowledgeGap } = await import("@/lib/ai/confidence");
    await recordKnowledgeGap({ orgId: ORG, question: "Do you do gel nails?", source: "widget" });
    await recordKnowledgeGap({ orgId: ORG, question: "do you do gel nails", source: "chat" });
    expect(store.gaps).toHaveLength(1);
    expect(store.gaps[0]?.hitCount).toBe(2);
  });

  it("never throws when the table is missing (fail-soft)", async () => {
    store.failWith = new Error('relation "knowledge_gaps" does not exist (42P01)');
    const { recordConfidence } = await import("@/lib/ai/confidence");
    await expect(
      recordConfidence({ orgId: ORG, purpose: "chatbot", question: "q", answer: "a", confidence: 0.1, source: "widget" }),
    ).resolves.toBeUndefined();
  });
});

describe("learningStats", () => {
  it("returns real percentages (not stuck at 0%)", async () => {
    store.gaps = [
      mkGap("open"),
      mkGap("open"),
      mkGap("answered"),
      mkGap("answered"),
      mkGap("answered"),
    ];
    const { learningStats } = await import("@/lib/ai/knowledge-gaps");
    const s = await learningStats(ORG);
    expect(s.open).toBe(2);
    expect(s.answered).toBe(3);
    // 3 answered of 5 answerable = 60%
    expect(s.answeredPct).toBe(60);
  });

  it("returns zeros (no NaN) when there are no gaps", async () => {
    const { learningStats } = await import("@/lib/ai/knowledge-gaps");
    const s = await learningStats(ORG);
    expect(s.answeredPct).toBe(0);
    expect(s.open).toBe(0);
  });
});

function mkGap(status: string): Gap {
  return {
    id: Math.random().toString(36).slice(2),
    organizationId: ORG,
    questionNorm: Math.random().toString(36).slice(2),
    question: "q",
    status,
    hitCount: 1,
    createdAt: new Date(),
    answeredAt: status === "answered" ? new Date() : null,
    confidence: null,
  };
}

describe("applyTaughtFact", () => {
  it("appends a Q→A to customPrompt while under the cap", async () => {
    const { applyTaughtFact } = await import("@/lib/ai/knowledge-gaps");
    const r = applyTaughtFact({
      question: "Do you offer parking?",
      answer: "Yes, free lot behind the building.",
      customPrompt: "Be friendly.",
      taughtFacts: null,
    });
    expect(r.customPrompt).toContain("Be friendly.");
    expect(r.customPrompt).toContain("Q: Do you offer parking?");
    expect(r.customPrompt).toContain("A: Yes, free lot behind the building.");
    expect(r.taughtFacts).toEqual([]);
  });

  it("overflows into taughtFacts when customPrompt is near the cap", async () => {
    const { applyTaughtFact } = await import("@/lib/ai/knowledge-gaps");
    const nearCap = "x".repeat(2790);
    const r = applyTaughtFact({
      question: "Big question?",
      answer: "Big answer.",
      customPrompt: nearCap,
      taughtFacts: null,
    });
    expect(r.customPrompt).toBe(nearCap); // unchanged
    expect(r.taughtFacts).toHaveLength(1);
    expect(r.taughtFacts[0]?.q).toBe("Big question?");
  });

  it("never produces a customPrompt over 3000 chars", async () => {
    const { applyTaughtFact } = await import("@/lib/ai/knowledge-gaps");
    const r = applyTaughtFact({
      question: "Q",
      answer: "A",
      customPrompt: "y".repeat(2799),
      taughtFacts: [],
    });
    expect((r.customPrompt ?? "").length).toBeLessThanOrEqual(3000);
  });
});
