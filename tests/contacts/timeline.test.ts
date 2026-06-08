import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Activity-timeline unit tests (Module 12, Wave 3b).
 *
 * Under test: pure normalizers map each source to the right kind/channel; the
 * merge/sort/paginate helper orders events desc + cursor-paginates; and a
 * failing/empty source is skipped (try/catch) without breaking the page.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

type FakeTx = Record<string, { findMany: ReturnType<typeof vi.fn> }>;
let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

import {
  getContactTimeline,
  mergeAndPaginate,
  reviewToEvent,
  reviewRequestToEvent,
  surveyResponseToEvent,
  inboxMessageToEvent,
  phoneCallToEvent,
  activityToEvent,
  type TimelineEvent,
} from "@/lib/contacts/timeline";

function ev(id: string, isoTime: string): TimelineEvent {
  return {
    id,
    kind: "x",
    channel: "system",
    title: id,
    body: null,
    occurredAt: new Date(isoTime),
    href: null,
    icon: "•",
  };
}

describe("normalizers", () => {
  it("review → review channel + rating in title", () => {
    const e = reviewToEvent({
      id: "r1",
      source: "google",
      rating: 5,
      body: "great",
      reviewerName: "Sam",
      postedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(e.channel).toBe("review");
    expect(e.id).toBe("review:r1");
    expect(e.title).toContain("5★");
  });

  it("review request → review_request channel, uses sentAt when present", () => {
    const sent = new Date("2026-02-02T00:00:00Z");
    const e = reviewRequestToEvent({
      id: "rr1",
      channel: "email",
      status: "sent",
      recipient: "a@b.com",
      createdAt: new Date("2026-02-01T00:00:00Z"),
      sentAt: sent,
    });
    expect(e.channel).toBe("review_request");
    expect(e.occurredAt.getTime()).toBe(sent.getTime());
  });

  it("survey response → survey channel", () => {
    const e = surveyResponseToEvent({
      id: "s1",
      rating: 9,
      createdAt: new Date("2026-03-01T00:00:00Z"),
      completedAt: null,
      campaignName: "NPS Q1",
    });
    expect(e.channel).toBe("survey");
    expect(e.title).toContain("NPS Q1");
  });

  it("inbox message → inbox channel, direction in title", () => {
    const e = inboxMessageToEvent({
      id: "m1",
      channel: "facebook_msg",
      direction: "inbound",
      body: "hi",
      sentAt: new Date("2026-04-01T00:00:00Z"),
      threadId: "t1",
    });
    expect(e.channel).toBe("inbox");
    expect(e.title.toLowerCase()).toContain("received");
  });

  it("phone call → phone channel", () => {
    const e = phoneCallToEvent({
      id: "p1",
      direction: "inbound",
      summary: "asked about hours",
      startedAt: new Date("2026-05-01T00:00:00Z"),
    });
    expect(e.channel).toBe("phone");
  });

  it("captured activity → system channel; other kinds → note", () => {
    const cap = activityToEvent({ id: "a1", kind: "captured", source: "survey", title: null, body: null, occurredAt: new Date() });
    expect(cap.channel).toBe("system");
    const note = activityToEvent({ id: "a2", kind: "note_added", source: null, title: "Notes", body: null, occurredAt: new Date() });
    expect(note.channel).toBe("note");
  });
});

describe("mergeAndPaginate", () => {
  it("sorts events newest-first", () => {
    const page = mergeAndPaginate(
      [ev("a", "2026-01-01T00:00:00Z"), ev("b", "2026-03-01T00:00:00Z"), ev("c", "2026-02-01T00:00:00Z")],
      null,
      10,
    );
    expect(page.events.map((e) => e.id)).toEqual(["b", "c", "a"]);
    expect(page.nextCursor).toBeNull();
  });

  it("returns a nextCursor when more pages remain and pages by it", () => {
    const all = [
      ev("a", "2026-05-01T00:00:00Z"),
      ev("b", "2026-04-01T00:00:00Z"),
      ev("c", "2026-03-01T00:00:00Z"),
      ev("d", "2026-02-01T00:00:00Z"),
    ];
    const first = mergeAndPaginate(all, null, 2);
    expect(first.events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(first.nextCursor).not.toBeNull();

    const second = mergeAndPaginate(all, first.nextCursor, 2);
    expect(second.events.map((e) => e.id)).toEqual(["c", "d"]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("getContactTimeline resilience", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const contact = { id: "c1", name: "Sam Smith", email: "sam@x.com", phone: "+15551234567" };

  beforeEach(() => {
    // Every source returns []; individual tests override one to throw.
    const findMany = () => vi.fn().mockResolvedValue([]);
    tx = {
      contactActivity: { findMany: findMany() },
      review: { findMany: findMany() },
      reviewRequest: { findMany: findMany() },
      surveyResponse: { findMany: findMany() },
      surveyResponseToken: { findMany: findMany() },
      inboxThread: { findMany: findMany() },
      inboxMessage: { findMany: findMany() },
      socialComment: { findMany: findMany() },
      aiConversation: { findMany: findMany() },
      phoneCall: { findMany: findMany() },
    };
    withTenantImpl = async (_orgId, fn) => fn(tx);
  });

  it("skips a failing source and still returns events from the others", async () => {
    tx.review!.findMany.mockRejectedValue(Object.assign(new Error("boom"), { code: "XX000" }));
    tx.reviewRequest!.findMany.mockResolvedValue([
      { id: "rr1", channel: "email", status: "sent", recipient: "sam@x.com", createdAt: new Date("2026-01-01T00:00:00Z"), sentAt: null },
    ]);
    const page = await getContactTimeline({ orgId: ORG, contact, take: 10 });
    expect(page.events.some((e) => e.id === "review_request:rr1")).toBe(true);
    // The review source failed but did not break the page.
    expect(page.events.some((e) => e.channel === "review")).toBe(false);
  });

  it("returns an empty page when the whole transaction fails", async () => {
    withTenantImpl = async () => {
      throw new Error("connection lost");
    };
    const page = await getContactTimeline({ orgId: ORG, contact, take: 10 });
    expect(page).toEqual({ events: [], nextCursor: null });
  });
});
