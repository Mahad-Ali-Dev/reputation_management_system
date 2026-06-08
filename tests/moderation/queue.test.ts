import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Moderation QUEUE unit tests (Module 09 — Inbox, Wave 3c-A).
 *
 * Under test:
 *   - evaluateInbound REJECTS source "google" (Google-exclusion contract) → no item.
 *   - keyword match → enqueues ModerationItem(reason:"keyword", suggestedAction:"hide"),
 *     flips the source SocialComment to "hidden", AND bumps CommentBlacklist.hiddenCount.
 *   - negativity → enqueues reason "negativity", suggestedAction "review", and DOES
 *     NOT hide the source.
 *   - allow → no item, no writes.
 *   - resolveModerationItem: approve un-hides the source; hide hides it.
 *   - fail-soft: a 42P01 (table not migrated) on create → outcome "skipped", no throw.
 *
 * `withTenant`, the classifier, and the rules loaders are mocked → fully offline.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Programmable fake transaction client.
type FakeTx = {
  moderationItem: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  socialComment: { update: ReturnType<typeof vi.fn> };
  commentBlacklist: { updateMany: ReturnType<typeof vi.fn> };
};

let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

// Classifier is mocked so no AI client is touched; tests set the confidence.
const classifyMock = vi.fn();
vi.mock("@/lib/moderation/classify", () => ({
  classifyContent: (args: unknown) => classifyMock(args),
}));

// Rules: real evaluateRules (pure) but mocked config/blacklist loaders.
const getConfigMock = vi.fn();
const loadKwMock = vi.fn();
vi.mock("@/lib/moderation/rules", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    getModerationConfig: (orgId: string) => getConfigMock(orgId),
    loadKeywordRules: (orgId: string) => loadKwMock(orgId),
  };
});

import { DEFAULT_MODERATION_CONFIG } from "@/lib/moderation/rules";
import { evaluateInbound, resolveModerationItem } from "@/lib/moderation/queue";

const ORG = "11111111-1111-4111-8111-111111111111";

function freshTx(): FakeTx {
  return {
    moderationItem: {
      create: vi.fn().mockResolvedValue({ id: "item-1" }),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    socialComment: { update: vi.fn().mockResolvedValue({}) },
    commentBlacklist: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

beforeEach(() => {
  tx = freshTx();
  withTenantImpl = async (_orgId, fn) => fn(tx);
  classifyMock.mockResolvedValue({ confidence: 0, label: "benign", heuristic: true });
  getConfigMock.mockResolvedValue({ ...DEFAULT_MODERATION_CONFIG });
  loadKwMock.mockResolvedValue([]);
});

describe("evaluateInbound — Google exclusion", () => {
  it("rejects source 'google' and never enqueues", async () => {
    const res = await evaluateInbound({
      orgId: ORG,
      // @ts-expect-error — intentionally passing a disallowed source
      source: "google",
      sourceType: "comment",
      sourceId: "c1",
      body: "anything at all",
    });
    expect(res.outcome).toBe("skipped");
    expect(res.itemId).toBeNull();
    expect(tx.moderationItem.create).not.toHaveBeenCalled();
  });
});

describe("evaluateInbound — keyword auto-hide", () => {
  beforeEach(() => {
    loadKwMock.mockResolvedValue([{ keyword: "scam", matchMode: "contains" }]);
  });

  it("enqueues a hide item, hides the source comment, and bumps hiddenCount", async () => {
    const res = await evaluateInbound({
      orgId: ORG,
      source: "facebook",
      sourceType: "comment",
      sourceId: "c1",
      authorName: "Bob",
      body: "this is a scam!",
    });

    expect(res.outcome).toBe("enqueued");
    expect(res.itemId).toBe("item-1");
    expect(res.sourceHidden).toBe(true);

    const created = tx.moderationItem.create.mock.calls[0]![0].data;
    expect(created.reason).toBe("keyword");
    expect(created.suggestedAction).toBe("hide");
    expect(created.matchedKeyword).toBe("scam");
    expect(created.source).toBe("facebook");

    // source hidden + hiddenCount bumped
    expect(tx.socialComment.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "hidden" },
    });
    expect(tx.commentBlacklist.updateMany).toHaveBeenCalledWith({
      where: { keyword: "scam", isActive: true },
      data: { hiddenCount: { increment: 1 } },
    });
  });
});

describe("evaluateInbound — negativity is flagged, source NOT hidden", () => {
  it("enqueues reason negativity / suggestedAction review and leaves the source visible", async () => {
    classifyMock.mockResolvedValue({ confidence: 0.9, label: "negative", heuristic: false });
    const res = await evaluateInbound({
      orgId: ORG,
      source: "instagram",
      sourceType: "comment",
      sourceId: "c2",
      body: "the staff were so rude to me",
    });

    expect(res.outcome).toBe("enqueued");
    expect(res.sourceHidden).toBe(false);
    const created = tx.moderationItem.create.mock.calls[0]![0].data;
    expect(created.reason).toBe("negativity");
    expect(created.suggestedAction).toBe("review");
    expect(Number(created.aiConfidence)).toBeCloseTo(0.9, 2);
    // never hid the source on a negativity flag
    expect(tx.socialComment.update).not.toHaveBeenCalled();
  });
});

describe("evaluateInbound — allow path", () => {
  it("does nothing when content is clean", async () => {
    const res = await evaluateInbound({
      orgId: ORG,
      source: "facebook",
      sourceType: "comment",
      sourceId: "c3",
      body: "thank you so much, loved it!",
    });
    expect(res.outcome).toBe("skipped");
    expect(tx.moderationItem.create).not.toHaveBeenCalled();
  });
});

describe("evaluateInbound — fail-soft when not migrated", () => {
  it("returns skipped (no throw) when create raises 42P01", async () => {
    loadKwMock.mockResolvedValue([{ keyword: "scam", matchMode: "contains" }]);
    tx.moderationItem.create.mockRejectedValue(Object.assign(new Error("no table"), { code: "42P01" }));
    const res = await evaluateInbound({
      orgId: ORG,
      source: "facebook",
      sourceType: "comment",
      sourceId: "c4",
      body: "scam!",
    });
    expect(res.outcome).toBe("skipped");
    expect(res.itemId).toBeNull();
  });
});

describe("resolveModerationItem", () => {
  it("approve → status approved + un-hides the source comment", async () => {
    tx.moderationItem.findUnique.mockResolvedValue({
      id: "item-1",
      source: "facebook",
      sourceType: "comment",
      sourceId: "c1",
    });
    const res = await resolveModerationItem({ orgId: ORG, itemId: "item-1", action: "approve", userId: "u1" });
    expect(res.ok).toBe(true);

    expect(tx.moderationItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "item-1" }, data: expect.objectContaining({ status: "approved" }) }),
    );
    expect(tx.socialComment.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { status: "needs_reply" },
    });
  });

  it("hide → status hidden + hides the source comment", async () => {
    tx.moderationItem.findUnique.mockResolvedValue({
      id: "item-2",
      source: "instagram",
      sourceType: "comment",
      sourceId: "c2",
    });
    await resolveModerationItem({ orgId: ORG, itemId: "item-2", action: "hide" });
    expect(tx.socialComment.update).toHaveBeenCalledWith({
      where: { id: "c2" },
      data: { status: "hidden" },
    });
  });

  it("webchat item does not touch SocialComment", async () => {
    tx.moderationItem.findUnique.mockResolvedValue({
      id: "item-3",
      source: "webchat",
      sourceType: "chat_message",
      sourceId: "m1",
    });
    await resolveModerationItem({ orgId: ORG, itemId: "item-3", action: "hide" });
    expect(tx.socialComment.update).not.toHaveBeenCalled();
  });

  it("fail-soft → ok:false when the table is missing", async () => {
    withTenantImpl = async () => {
      throw Object.assign(new Error("no table"), { code: "42P01" });
    };
    const res = await resolveModerationItem({ orgId: ORG, itemId: "x", action: "approve" });
    expect(res.ok).toBe(false);
  });
});
