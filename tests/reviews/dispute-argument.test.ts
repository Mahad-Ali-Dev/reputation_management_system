import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * dispute-argument tests (Module 08). The Anthropic client, KB retrieval, and
 * the tenant DB are all mocked so we assert behavior without a live DB or a
 * paid call. Key contracts:
 *   - the review is fenced in <untrusted_review>, KB chunks in <untrusted_doc>
 *   - Sonnet is used (sensitive task)
 *   - exactly one ai_messages row is logged with purpose "dispute_argument"
 *   - the system prompt carries the no-fabrication instruction
 */

const messagesCreate = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  MODELS: { SONNET: "claude-sonnet-test", HAIKU: "h", OPUS: "o" },
  PRICING: {
    "claude-sonnet-test": { input: 3, output: 15, cache_read: 0.3, cache_write_5m: 3.75 },
  },
  anthropic: { messages: { create: (...args: unknown[]) => messagesCreate(...args) } },
}));

const retrieveChunks = vi.fn();
vi.mock("@/lib/ai/ingest", () => ({
  retrieveChunks: (...args: unknown[]) => retrieveChunks(...args),
}));

const aiMessageCreate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
  id: "ai-msg-1",
  ...args.data,
}));
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ aiMessage: { create: (a: { data: Record<string, unknown> }) => aiMessageCreate(a) } }),
}));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { draftDisputeArgument } from "@/lib/reviews/dispute-argument";

function mockResponse(text: string) {
  return {
    id: "msg_abc",
    content: [{ type: "text", text }],
    usage: { input_tokens: 500, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  };
}

beforeEach(() => {
  messagesCreate.mockReset();
  retrieveChunks.mockReset();
  aiMessageCreate.mockClear();
  messagesCreate.mockResolvedValue(mockResponse("This review appears to violate Google's policy."));
  retrieveChunks.mockResolvedValue([
    { chunkText: "We have no booking for this name in our system.", documentId: "doc-1", position: 0, metadata: {} },
  ]);
});

describe("draftDisputeArgument", () => {
  it("fences the review and KB, uses Sonnet, and returns the argument", async () => {
    const res = await draftDisputeArgument({
      orgId: "org-1",
      establishmentId: "est-1",
      reviewBody: "Terrible place, never going back",
      reviewerName: "Jane D",
      rating: 1,
      violationType: "spam_fake",
    });

    expect(res.argument).toContain("violate");
    expect(res.aiMessageId).toBe("ai-msg-1");
    expect(res.kbChunksUsed).toBe(1);

    expect(messagesCreate).toHaveBeenCalledTimes(1);
    const call = messagesCreate.mock.calls[0]![0] as {
      model: string;
      max_tokens: number;
      system: Array<{ text: string }>;
      messages: Array<{ role: string; content: string }>;
    };
    expect(call.model).toBe("claude-sonnet-test");

    const userTurn = call.messages[0]!.content;
    expect(userTurn).toContain("<untrusted_review");
    expect(userTurn).toContain("Terrible place");
    expect(userTurn).toContain("<untrusted_doc");
    expect(userTurn).toContain("We have no booking for this name");
  });

  it("includes the no-fabrication instruction in the system prompt", async () => {
    await draftDisputeArgument({
      orgId: "org-1",
      establishmentId: null,
      reviewBody: "x",
      reviewerName: null,
      rating: 2,
      violationType: "off_topic",
    });
    const call = messagesCreate.mock.calls[0]![0] as { system: Array<{ text: string }> };
    const sys = call.system.map((s) => s.text).join("\n");
    expect(sys).toMatch(/Ground EVERY factual claim ONLY in/i);
    expect(sys).toMatch(/never a customer/i);
    expect(sys).toMatch(/NEVER promise or imply the review will be removed/i);
  });

  it("logs exactly one ai_messages row with purpose dispute_argument + a cost", async () => {
    await draftDisputeArgument({
      orgId: "org-1",
      establishmentId: "est-1",
      reviewBody: "spam",
      reviewerName: null,
      rating: 1,
      violationType: "profanity_harassment",
    });
    expect(aiMessageCreate).toHaveBeenCalledTimes(1);
    const data = aiMessageCreate.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.purpose).toBe("dispute_argument");
    expect(data.model).toBe("claude-sonnet-test");
    // 500*3 + 200*15 = 1500 + 3000 = 4500 micros
    expect(data.costMicros).toBe(4500);
    expect(Array.isArray(data.retrievedChunkIds)).toBe(true);
    expect((data.retrievedChunkIds as string[])).toContain("doc-1");
  });

  it("still drafts (generic) when KB retrieval is empty", async () => {
    retrieveChunks.mockResolvedValue([]);
    const res = await draftDisputeArgument({
      orgId: "org-1",
      establishmentId: null,
      reviewBody: "x",
      reviewerName: null,
      rating: 3,
      violationType: "illegal_content",
    });
    expect(res.kbChunksUsed).toBe(0);
    const call = messagesCreate.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    expect(call.messages[0]!.content).toContain("No Knowledge Base facts available");
  });

  it("does not blow up if KB retrieval throws (degrades to no-KB)", async () => {
    retrieveChunks.mockRejectedValue(Object.assign(new Error("boom"), { code: "XX000" }));
    const res = await draftDisputeArgument({
      orgId: "org-1",
      establishmentId: "est-1",
      reviewBody: "x",
      reviewerName: null,
      rating: 1,
      violationType: "spam_fake",
    });
    expect(res.kbChunksUsed).toBe(0);
    expect(res.aiMessageId).toBe("ai-msg-1");
  });
});
