import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unified Inbox — inbound ingest pipeline unit tests (Module 09, Wave 3c-B).
 *
 * Guarantees under test (lib/inbox/ingest.ts):
 *  - ingestInbound(): upserts an InboxThread by (org, channel, externalThreadId),
 *    appends an inbound InboxMessage, and FIRES the contact auto-capture hook.
 *  - ingestInbound(): idempotent on the provider message id — a re-delivered
 *    event with the same externalId inserts NOTHING and does NOT re-capture.
 *  - ingestInbound(): existing thread → bumps last-message pointers + unread.
 *  - ingestComment(): upserts a SocialComment by (platform, externalId) and fires
 *    contact capture from the author; re-delivery updates, never duplicates.
 *  - Fail-soft: a missing-relation (42P01, pre-migration) is swallowed → ok:false,
 *    and the capture hook is NOT fired.
 *
 * Everything is mocked (withTenant + a fake tx, the capture hook, logger) so this
 * is fully offline + deterministic.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ---- Fake tenant transaction client ----
type FakeTx = {
  inboxThread: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  inboxMessage: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  socialComment: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
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

import { ingestComment, ingestInbound, isMissingRelation } from "@/lib/inbox/ingest";

const ORG = "11111111-1111-4111-8111-111111111111";

function freshTx(): FakeTx {
  return {
    inboxThread: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "thread-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
    inboxMessage: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "msg-1" }),
    },
    socialComment: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "comment-1" }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

beforeEach(() => {
  tx = freshTx();
  withTenantImpl = async (_orgId, fn) => fn(tx);
  captureSpy.mockReset();
});

describe("ingestInbound — DMs/messages", () => {
  const fbMsg = {
    channel: "facebook_msg" as const,
    externalThreadId: "page1:user9",
    externalId: "mid.abc123",
    body: "Hi, are you open on Sunday?",
    sentAt: new Date("2026-06-08T10:00:00Z"),
    participant: { externalId: "user9", name: "Maria Rivera" },
  };

  it("creates a thread, appends an inbound message, and fires contact capture", async () => {
    const res = await ingestInbound(ORG, fbMsg);

    // New thread created with the inbound pointers + unread.
    expect(tx.inboxThread.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.inboxThread.create).toHaveBeenCalledTimes(1);
    const threadData = tx.inboxThread.create.mock.calls[0]![0].data;
    expect(threadData.channel).toBe("facebook_msg");
    expect(threadData.externalThreadId).toBe("page1:user9");
    expect(threadData.lastMessageDirection).toBe("inbound");
    expect(threadData.unreadCount).toBe(1);

    // Inbound message persisted with the provider message id.
    expect(tx.inboxMessage.create).toHaveBeenCalledTimes(1);
    const msgData = tx.inboxMessage.create.mock.calls[0]![0].data;
    expect(msgData.direction).toBe("inbound");
    expect(msgData.externalId).toBe("mid.abc123");
    expect(msgData.organizationId).toBe(ORG);

    // Contact capture fired with the facebook socialId + a stable activity ref.
    expect(captureSpy).toHaveBeenCalledTimes(1);
    const cap = captureSpy.mock.calls[0]![0];
    expect(cap.orgId).toBe(ORG);
    expect(cap.source).toBe("facebook");
    expect(cap.socialId).toBe("facebook:user9");
    expect(cap.activity.externalRef).toBe("inbox-inbound:mid.abc123");

    expect(res.ok).toBe(true);
    expect(res.messageInserted).toBe(true);
    expect(res.threadId).toBe("thread-1");
  });

  it("is idempotent: a re-delivered message id inserts nothing and does NOT re-capture", async () => {
    // Thread already exists; the message id is already stored.
    tx.inboxThread.findFirst.mockResolvedValueOnce({ id: "thread-1", participant: {} });
    tx.inboxMessage.findFirst.mockResolvedValueOnce({ id: "msg-1" }); // dup

    const res = await ingestInbound(ORG, fbMsg);

    // Thread pointers still bumped (we saw activity), but NO new message + NO capture.
    expect(tx.inboxThread.update).toHaveBeenCalledTimes(1);
    expect(tx.inboxMessage.create).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();

    expect(res.ok).toBe(true);
    expect(res.messageInserted).toBe(false);
  });

  it("maps Instagram DMs to the instagram_dm channel + instagram socialId", async () => {
    const igMsg = { ...fbMsg, channel: "instagram_dm" as const };
    await ingestInbound(ORG, igMsg);
    const threadData = tx.inboxThread.create.mock.calls[0]![0].data;
    expect(threadData.channel).toBe("instagram_dm");
    expect(captureSpy.mock.calls[0]![0].socialId).toBe("instagram:user9");
  });

  it("skips (ok:false) when the provider ids are missing", async () => {
    const res = await ingestInbound(ORG, { ...fbMsg, externalId: "" });
    expect(res.ok).toBe(false);
    expect(res.skipped).toBe("missing_ids");
    expect(tx.inboxThread.create).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("fail-soft: swallows a missing-relation (pre-migration) → ok:false, no capture", async () => {
    const err = Object.assign(new Error('relation "inbox_threads" does not exist'), {
      code: "42P01",
    });
    tx.inboxThread.findFirst.mockRejectedValueOnce(err);

    const res = await ingestInbound(ORG, fbMsg);
    expect(res.ok).toBe(false);
    expect(res.skipped).toBe("ingest_failed");
    expect(captureSpy).not.toHaveBeenCalled();
  });

  it("does not fire capture when the participant has no identifier", async () => {
    const noId = { ...fbMsg, participant: { name: "Anonymous" } };
    await ingestInbound(ORG, noId);
    expect(tx.inboxMessage.create).toHaveBeenCalledTimes(1);
    expect(captureSpy).not.toHaveBeenCalled();
  });
});

describe("ingestComment — FB/IG comments", () => {
  const comment = {
    platform: "facebook" as const,
    externalId: "comment_123",
    externalPostId: "post_456",
    body: "Love this place!",
    authorName: "Sam P.",
    authorExternalId: "fbuser_77",
    postedAt: new Date("2026-06-08T09:00:00Z"),
  };

  it("creates a SocialComment and fires contact capture from the author", async () => {
    const res = await ingestComment(ORG, comment);

    expect(tx.socialComment.findUnique).toHaveBeenCalledTimes(1);
    expect(tx.socialComment.create).toHaveBeenCalledTimes(1);
    const data = tx.socialComment.create.mock.calls[0]![0].data;
    expect(data.platform).toBe("facebook");
    expect(data.externalId).toBe("comment_123");
    expect(data.status).toBe("needs_reply");

    expect(captureSpy).toHaveBeenCalledTimes(1);
    const cap = captureSpy.mock.calls[0]![0];
    expect(cap.source).toBe("facebook");
    expect(cap.socialId).toBe("facebook:fbuser_77");
    expect(cap.activity.externalRef).toBe("social-comment:comment_123");

    expect(res.ok).toBe(true);
    expect(res.commentInserted).toBe(true);
  });

  it("is idempotent: an existing (platform, externalId) updates, never duplicates, no re-capture", async () => {
    tx.socialComment.findUnique.mockResolvedValueOnce({ id: "comment-1" });

    const res = await ingestComment(ORG, comment);

    expect(tx.socialComment.update).toHaveBeenCalledTimes(1);
    expect(tx.socialComment.create).not.toHaveBeenCalled();
    expect(captureSpy).not.toHaveBeenCalled();
    expect(res.commentInserted).toBe(false);
  });
});

describe("isMissingRelation", () => {
  it("detects raw Postgres + Prisma wrapper codes and message text", () => {
    expect(isMissingRelation({ code: "42P01" })).toBe(true);
    expect(isMissingRelation({ code: "42703" })).toBe(true);
    expect(isMissingRelation({ code: "P2021" })).toBe(true);
    expect(isMissingRelation(new Error("column foo does not exist"))).toBe(true);
    expect(isMissingRelation(new Error("some other error"))).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});
