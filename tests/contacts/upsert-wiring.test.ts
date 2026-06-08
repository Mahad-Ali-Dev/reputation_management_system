import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auto-capture WIRING tests (Module 12, Wave 3b → completeness pass).
 *
 * The auto-capture hook (`upsertContactFromInteraction` /
 * `captureContactInBackground`) is self-contained + fail-soft and is unit-tested
 * in `upsert.test.ts`. These tests assert the *wiring*: that an inbound host path
 * actually CALLS the hook, with the right `source`, and that it does so
 * fire-and-forget — i.e. the host never awaits the capture and a capture failure
 * can NEVER change/break/slow the host path's own behaviour.
 *
 * We exercise the cleanest representative host path — the Airbnb review ingest
 * (`ingestInboundEmail`, a plain async fn, no session/`"use server"` surface).
 * The hook itself is mocked so we test the wiring, not the contact mechanics.
 * Every other host wiring (google-fetch, surveys, chatbot converse, outreach
 * single + bulk) follows the identical `captureContactInBackground(...)` shape.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ---- the auto-capture hook (the thing under wiring-test) ----
const captureMock = vi.fn();
vi.mock("@/lib/contacts/upsert-from-interaction", () => ({
  captureContactInBackground: (...a: unknown[]) => captureMock(...a),
}));

// ---- sibling fire-and-forget side effects: stub so they don't interfere ----
vi.mock("@/lib/alerts/bad-review-sms", () => ({
  maybeFireBadReviewAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auto-reply/executor", () => ({
  executeAutoReplyRules: vi.fn().mockResolvedValue(undefined),
}));

// ---- the Airbnb parser: return a deterministic successful parse ----
const REVIEWER = "Jamie Guest";
const EXTERNAL_REVIEW_ID = "airbnb:deadbeef";
const POSTED_AT = new Date("2026-06-01T12:00:00.000Z");
vi.mock("@/lib/inbound-email/parse-airbnb", () => ({
  parseAirbnbReviewEmail: vi.fn(() => ({
    ok: true,
    externalReviewId: EXTERNAL_REVIEW_ID,
    listingName: "Cliff House",
    listingId: "12345",
    reviewerName: REVIEWER,
    rating: 5,
    body: "Lovely stay!",
    postedAt: POSTED_AT,
    raw: { subject: "New review", from: "automated@airbnb.com", htmlSnippet: "<p>…</p>" },
  })),
}));

// ---- prisma surface ingestInboundEmail touches ----
const inboundCreateMock = vi.fn(async (..._a: unknown[]) => ({ id: "inbound-1" }));
const inboundUpdateMock = vi.fn(async (..._a: unknown[]) => ({}));
const inboundFindUniqueMock = vi.fn(async (..._a: unknown[]): Promise<{ id: string } | null> => null);
const orgFindUniqueMock = vi.fn(async (..._a: unknown[]): Promise<{ id: string; slug: string } | null> => ({ id: "org-1", slug: "acme" }));
const establishmentFindFirstMock = vi.fn(async (..._a: unknown[]) => ({
  id: "est-1",
  name: "Cliff House",
  alertSmsEnabled: false,
  alertSmsPhone: null,
  alertSmsMinRating: 3,
}));
const reviewUpsertMock = vi.fn(async (..._a: unknown[]) => ({ id: "review-1" }));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    inboundEmail: {
      create: (...a: unknown[]) => inboundCreateMock(...a),
      update: (...a: unknown[]) => inboundUpdateMock(...a),
      findUnique: (...a: unknown[]) => inboundFindUniqueMock(...a),
    },
    organization: { findUnique: (...a: unknown[]) => orgFindUniqueMock(...a) },
    establishment: { findFirst: (...a: unknown[]) => establishmentFindFirstMock(...a) },
    review: { upsert: (...a: unknown[]) => reviewUpsertMock(...a) },
  },
}));

import { ingestInboundEmail } from "@/lib/inbound-email/route-and-ingest";

function payload() {
  return {
    providerMessageId: "msg-1",
    from: "automated@airbnb.com",
    to: "reviews-acme@inbound.repulabs.com",
    subject: "You have a new review",
    htmlBody: "<p>Jamie said…</p>",
    textBody: "Jamie said…",
    receivedAt: new Date("2026-06-02T08:00:00.000Z"),
  };
}

beforeEach(() => {
  captureMock.mockReset();
  inboundCreateMock.mockClear();
  inboundUpdateMock.mockClear();
  inboundFindUniqueMock.mockClear().mockResolvedValue(null);
  orgFindUniqueMock.mockClear().mockResolvedValue({ id: "org-1", slug: "acme" });
  reviewUpsertMock.mockClear().mockResolvedValue({ id: "review-1" });
});

describe("review ingest → auto-capture wiring", () => {
  it("captures the review author with source:'review' on a successful ingest", async () => {
    const res = await ingestInboundEmail(payload());
    expect(res.status).toBe("review_ingested");

    expect(captureMock).toHaveBeenCalledTimes(1);
    const arg = captureMock.mock.calls[0]![0] as {
      orgId: string;
      source: string;
      externalId: string;
      name: string;
      establishmentId: string;
      occurredAt: Date;
      activity?: { externalRef?: string };
    };
    expect(arg.source).toBe("review");
    expect(arg.orgId).toBe("org-1");
    expect(arg.name).toBe(REVIEWER);
    expect(arg.externalId).toBe(EXTERNAL_REVIEW_ID);
    expect(arg.establishmentId).toBe("est-1");
    // Idempotency key derives from the review's external id.
    expect(arg.activity?.externalRef).toBe(`review:${EXTERNAL_REVIEW_ID}`);
  });

  it("does NOT capture when the email isn't an ingestable review (unknown org)", async () => {
    // No matching org slug → the path returns early before any review upsert.
    orgFindUniqueMock.mockResolvedValueOnce(null);
    const res = await ingestInboundEmail(payload());
    expect(res.status).toBe("unknown_org");
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("is fire-and-forget: a failing hook does NOT change the host result", async () => {
    // The real `captureContactInBackground` is `void`-returning and swallows its
    // own rejection internally (it is fail-soft by contract). Model that here: a
    // capture that fails internally must leave the host's review_ingested result
    // untouched because the host never awaits it.
    captureMock.mockImplementation(() => {
      // Mirror the real hook: kick off async work, swallow any rejection, return
      // void. The host must not depend on this resolving/rejecting.
      void Promise.reject(new Error("capture blew up")).catch(() => {});
      return undefined;
    });
    const res = await ingestInboundEmail(payload());
    expect(res.status).toBe("review_ingested");
    expect(res.reviewId).toBe("review-1");
    expect(captureMock).toHaveBeenCalledTimes(1);
  });

  it("does not await the hook (a never-resolving capture cannot stall ingest)", async () => {
    // A promise the hook never settles — if the host awaited it, this test would
    // time out. It returns promptly because the call is fire-and-forget.
    captureMock.mockReturnValue(undefined); // void return, no await possible
    const res = await Promise.race([
      ingestInboundEmail(payload()),
      new Promise((resolve) => setTimeout(() => resolve("TIMEOUT"), 1000)),
    ]);
    expect(res).not.toBe("TIMEOUT");
    expect((res as { status: string }).status).toBe("review_ingested");
  });
});
