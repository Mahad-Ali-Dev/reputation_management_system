import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unified Inbox — Conversations + AI Suggest unit tests (Module 09, Wave 3c-A).
 *
 * Guarantees under test:
 *  - sendMessage(): writes an outbound InboxMessage, bumps the thread's
 *    last-message pointers + clears unread, and FIRES the contact auto-capture
 *    hook (fire-and-forget) when the participant has an identifier.
 *  - sendMessage(): returns null fail-soft when the thread doesn't exist.
 *  - addInternalNote(): writes a `direction:"internal"` message and does NOT
 *    touch the thread's last-message pointers.
 *  - suggestReplies(): returns the (deduped, unblocked) option strings from the
 *    mocked AiAssist; returns `{ options: [] }` when AI is unconfigured (no
 *    ANTHROPIC_API_KEY) and never calls the model.
 *
 * Everything is mocked (withTenant + a fake tx, the capture hook, assist, logger)
 * so this is fully offline + deterministic.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ---- Fake tenant transaction client ----
type FakeTx = {
  inboxThread: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  inboxMessage: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

// ---- Spy on the contact auto-capture hook ----
const captureSpy = vi.fn();
vi.mock("@/lib/contacts/upsert-from-interaction", () => ({
  captureContactInBackground: (...args: unknown[]) => captureSpy(...args),
}));

// ---- Programmable AiAssist mock ----
const assistMock = vi.fn();
vi.mock("@/lib/ai/assist", () => ({
  runAiAssist: (...args: unknown[]) => assistMock(...args),
  // Re-create the lightweight error classes the suggest service branches on.
  AiBudgetError: class AiBudgetError extends Error {
    readonly code = "ai_budget";
  },
}));
vi.mock("@/lib/billing/entitlements", () => ({
  PlanInactiveError: class PlanInactiveError extends Error {
    readonly code = "plan_inactive";
  },
}));

import { addInternalNote, sendMessage } from "@/lib/inbox/conversations";
import { suggestReplies } from "@/lib/inbox/suggest";

const ORG = "11111111-1111-4111-8111-111111111111";
const THREAD = "22222222-2222-4222-8222-222222222222";

function freshTx(): FakeTx {
  return {
    inboxThread: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    inboxMessage: {
      create: vi.fn().mockResolvedValue({
        id: "msg-1",
        threadId: THREAD,
        body: "Thanks for reaching out!",
        authorUserId: "user-1",
        aiSuggested: null,
        attachments: null,
        sentAt: new Date("2026-06-08T12:00:00Z"),
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

beforeEach(() => {
  tx = freshTx();
  withTenantImpl = async (_orgId, fn) => fn(tx);
  captureSpy.mockReset();
  assistMock.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("sendMessage", () => {
  it("writes an outbound message, bumps the thread, and fires contact capture", async () => {
    tx.inboxThread.findUnique.mockResolvedValueOnce({
      id: THREAD,
      channel: "facebook_msg",
      participant: { name: "Maria Rivera", email: "maria@example.com" },
      status: "open",
    });

    const res = await sendMessage({
      orgId: ORG,
      threadId: THREAD,
      body: "Thanks for reaching out!",
      authorUserId: "user-1",
    });

    // Message persisted as outbound.
    expect(tx.inboxMessage.create).toHaveBeenCalledTimes(1);
    const createArg = tx.inboxMessage.create.mock.calls[0]![0];
    expect(createArg.data.direction).toBe("outbound");
    expect(createArg.data.organizationId).toBe(ORG);
    expect(createArg.data.body).toBe("Thanks for reaching out!");

    // Thread last-message pointers bumped + unread cleared.
    expect(tx.inboxThread.update).toHaveBeenCalledTimes(1);
    const updateArg = tx.inboxThread.update.mock.calls[0]![0];
    expect(updateArg.data.lastMessageDirection).toBe("outbound");
    expect(updateArg.data.unreadCount).toBe(0);

    // Auto-capture fired with the participant email + a stable activity ref.
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const captureArg = captureSpy.mock.calls[0]![0];
    expect(captureArg.orgId).toBe(ORG);
    expect(captureArg.source).toBe("facebook");
    expect(captureArg.email).toBe("maria@example.com");
    expect(captureArg.activity.externalRef).toBe("inbox-reply:msg-1");

    // Returned shape is the serialized outbound message.
    expect(res).not.toBeNull();
    expect(res?.direction).toBe("outbound");
    expect(res?.id).toBe("msg-1");
    expect(res?.sentAt).toBe("2026-06-08T12:00:00.000Z");
  });

  it("does NOT fire capture when the participant has no identifier", async () => {
    tx.inboxThread.findUnique.mockResolvedValueOnce({
      id: THREAD,
      channel: "webchat",
      participant: { name: "Anonymous visitor" }, // no email/phone/social id
      status: "open",
    });

    await sendMessage({ orgId: ORG, threadId: THREAD, body: "Hello!" });

    expect(tx.inboxMessage.create).toHaveBeenCalledTimes(1);
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("returns null fail-soft when the thread does not exist", async () => {
    tx.inboxThread.findUnique.mockResolvedValueOnce(null);
    const res = await sendMessage({ orgId: ORG, threadId: THREAD, body: "Hi" });
    expect(res).toBeNull();
    expect(tx.inboxMessage.create).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    await expect(sendMessage({ orgId: ORG, threadId: THREAD, body: "   " })).rejects.toThrow(
      /body is required/i,
    );
  });
});

describe("addInternalNote", () => {
  it("writes an internal message and does NOT bump the thread pointers", async () => {
    tx.inboxThread.findUnique.mockResolvedValueOnce({ id: THREAD });
    tx.inboxMessage.create.mockResolvedValueOnce({
      id: "note-1",
      threadId: THREAD,
      body: "Follow up after the holiday.",
      authorUserId: "user-1",
      aiSuggested: null,
      attachments: null,
      sentAt: new Date("2026-06-08T12:05:00Z"),
    });

    await addInternalNote({
      orgId: ORG,
      threadId: THREAD,
      body: "Follow up after the holiday.",
      authorUserId: "user-1",
    });

    const createArg = tx.inboxMessage.create.mock.calls[0]![0];
    expect(createArg.data.direction).toBe("internal");
    // Notes are not customer-visible → no last-message bump, no capture.
    expect(tx.inboxThread.update).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();
  });
});

describe("suggestReplies", () => {
  it("returns deduped, unblocked option strings from AiAssist", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    tx.inboxThread.findUnique.mockResolvedValueOnce({
      id: THREAD,
      channel: "webchat",
      participant: { name: "Maria" },
      establishmentId: null,
    });
    tx.inboxMessage.findMany.mockResolvedValueOnce([
      { direction: "inbound", body: "Can I move my appointment to Wednesday?" },
    ]);

    assistMock.mockResolvedValueOnce({
      purpose: "inbox_reply",
      options: [
        { text: "Absolutely — Wednesday works! What time suits you?", blocked: false, confidence: 0.9 },
        { text: "Absolutely — Wednesday works! What time suits you?", blocked: false, confidence: 0.8 }, // dup
        { text: "Sure, we have 2:30pm or 4:10pm on Wednesday.", blocked: false, confidence: 0.85 },
        { text: "BLOCKED UNSAFE TEXT", blocked: true, confidence: 0.4 }, // dropped
      ],
      usedChunkIds: [],
      costMicros: 0,
      knowledgeGapId: null,
      escalated: false,
      promptVersionId: null,
    });

    const res = await suggestReplies({ orgId: ORG, threadId: THREAD });

    expect(assistMock).toHaveBeenCalledTimes(1);
    const assistArg = assistMock.mock.calls[0]![0];
    expect(assistArg.purpose).toBe("inbox_reply");
    expect(assistArg.escalate).toBe(true); // routes low-confidence to a flagged thread
    expect(assistArg.domain.primaryText).toContain("Maria:");

    expect(res.reason).toBe("ok");
    expect(res.options).toEqual([
      "Absolutely — Wednesday works! What time suits you?",
      "Sure, we have 2:30pm or 4:10pm on Wednesday.",
    ]);
  });

  it("returns no options (and never calls the model) when AI is unconfigured", async () => {
    // ANTHROPIC_API_KEY is unset in beforeEach.
    const res = await suggestReplies({ orgId: ORG, threadId: THREAD });
    expect(res.options).toEqual([]);
    expect(res.reason).toBe("ai_unconfigured");
    expect(assistMock).not.toHaveBeenCalled();
  });

  it("returns no options when the thread has no messages", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    tx.inboxThread.findUnique.mockResolvedValueOnce({
      id: THREAD,
      channel: "webchat",
      participant: {},
      establishmentId: null,
    });
    tx.inboxMessage.findMany.mockResolvedValueOnce([]); // empty transcript

    const res = await suggestReplies({ orgId: ORG, threadId: THREAD });
    expect(res.reason).toBe("no_thread");
    expect(res.options).toEqual([]);
    expect(assistMock).not.toHaveBeenCalled();
  });
});
