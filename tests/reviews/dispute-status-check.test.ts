import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * dispute-status-check tests (Module 08). Prisma, withTenant, notifications,
 * and the crypto envelope are mocked; the Google probe is INJECTED so there is
 * never a real network call. Contracts:
 *   - GBP_DISPUTE_CHECK_ENABLED unset → zero probe calls, everything skipped
 *   - enabled + probe "gone"    → status removed + decisionAt + notification
 *   - enabled + probe "flagged" → status rejected + notification
 *   - org with no active Google connection is skipped
 *   - every mutation routes through withTenant with a system audit actor
 */

const reviewDisputeFindMany = vi.fn();
const connectionFindFirst = vi.fn();
vi.mock("@/lib/db/client", () => ({
  prisma: {
    reviewDispute: { findMany: (...a: unknown[]) => reviewDisputeFindMany(...a) },
    connection: { findFirst: (...a: unknown[]) => connectionFindFirst(...a) },
  },
}));

const disputeUpdate = vi.fn(async (_args?: unknown) => ({}));
const auditCreate = vi.fn(async (_args?: unknown) => ({}));
const reviewFindFirst = vi.fn(async (_args?: unknown) => ({
  externalId: "accounts/-/locations/1/reviews/r1",
  source: "google",
}));
const withTenantCalls: string[] = [];
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (orgId: string, fn: (tx: unknown) => Promise<unknown>) => {
    withTenantCalls.push(orgId);
    return fn({
      reviewDispute: { update: (a: unknown) => disputeUpdate(a) },
      auditLog: { create: (a: unknown) => auditCreate(a) },
      review: { findFirst: (a: unknown) => reviewFindFirst(a) },
    });
  },
}));

const createNotification = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@/lib/notifications/actions", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
}));

vi.mock("@/lib/crypto/envelope", () => ({ decrypt: vi.fn(() => "token") }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { checkDisputeStatuses } from "@/lib/reviews/dispute-status-check";

const CONN = { id: "c1", organizationId: "org-1", establishment: { googlePlaceId: "p1" } };

beforeEach(() => {
  reviewDisputeFindMany.mockReset();
  connectionFindFirst.mockReset();
  disputeUpdate.mockClear();
  auditCreate.mockClear();
  createNotification.mockClear();
  reviewFindFirst.mockClear();
  withTenantCalls.length = 0;
  reviewDisputeFindMany.mockResolvedValue([{ id: "d1", organizationId: "org-1", reviewId: "rev-1" }]);
  connectionFindFirst.mockResolvedValue(CONN);
  reviewFindFirst.mockResolvedValue({ externalId: "accounts/-/locations/1/reviews/r1", source: "google" });
});

afterEach(() => {
  delete process.env.GBP_DISPUTE_CHECK_ENABLED;
});

describe("checkDisputeStatuses — env gate", () => {
  it("makes zero probe calls and skips all when disabled", async () => {
    delete process.env.GBP_DISPUTE_CHECK_ENABLED;
    const probe = vi.fn();
    const summary = await checkDisputeStatuses(probe);
    expect(probe).not.toHaveBeenCalled();
    expect(summary).toEqual({ checked: 1, removed: 0, rejected: 0, skipped: 1 });
    expect(disputeUpdate).not.toHaveBeenCalled();
  });
});

describe("checkDisputeStatuses — outcomes (enabled)", () => {
  beforeEach(() => {
    process.env.GBP_DISPUTE_CHECK_ENABLED = "true";
  });

  it("probe 'gone' → status removed + decisionAt + notification, via withTenant + system actor", async () => {
    const probe = vi.fn(async () => "gone" as const);
    const summary = await checkDisputeStatuses(probe);

    expect(summary.removed).toBe(1);
    expect(summary.rejected).toBe(0);
    expect(disputeUpdate).toHaveBeenCalledTimes(1);
    const updateArg = disputeUpdate.mock.calls[0]![0] as { data: { status: string; decisionAt: Date } };
    expect(updateArg.data.status).toBe("removed");
    expect(updateArg.data.decisionAt).toBeInstanceOf(Date);

    const auditArg = auditCreate.mock.calls[0]![0] as { data: { actorType: string; action: string } };
    expect(auditArg.data.actorType).toBe("system");
    expect(auditArg.data.action).toBe("review.dispute.removed");

    expect(createNotification).toHaveBeenCalledTimes(1);
    const notif = createNotification.mock.calls[0]![1] as { type: string; href: string };
    expect(notif.type).toBe("dispute.removed");
    expect(notif.href).toBe("/reviews/dispute/d1");

    expect(withTenantCalls).toContain("org-1");
  });

  it("probe 'flagged' → status rejected + rejected notification", async () => {
    const probe = vi.fn(async () => "flagged" as const);
    const summary = await checkDisputeStatuses(probe);
    expect(summary.rejected).toBe(1);
    const updateArg = disputeUpdate.mock.calls[0]![0] as { data: { status: string } };
    expect(updateArg.data.status).toBe("rejected");
    const notif = createNotification.mock.calls[0]![1] as { type: string };
    expect(notif.type).toBe("dispute.rejected");
  });

  it("probe 'present' → skipped, no mutation", async () => {
    const probe = vi.fn(async () => "present" as const);
    const summary = await checkDisputeStatuses(probe);
    expect(summary).toEqual({ checked: 1, removed: 0, rejected: 0, skipped: 1 });
    expect(disputeUpdate).not.toHaveBeenCalled();
  });

  it("skips an org with no active Google connection (no probe)", async () => {
    connectionFindFirst.mockResolvedValue(null);
    const probe = vi.fn(async () => "gone" as const);
    const summary = await checkDisputeStatuses(probe);
    expect(probe).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
    expect(disputeUpdate).not.toHaveBeenCalled();
  });
});

describe("checkDisputeStatuses — fail-soft", () => {
  it("returns an empty summary when review_disputes is missing (42P01)", async () => {
    process.env.GBP_DISPUTE_CHECK_ENABLED = "true";
    reviewDisputeFindMany.mockRejectedValue(Object.assign(new Error("no table"), { code: "42P01" }));
    const probe = vi.fn();
    const summary = await checkDisputeStatuses(probe);
    expect(summary).toEqual({ checked: 0, removed: 0, rejected: 0, skipped: 0 });
    expect(probe).not.toHaveBeenCalled();
  });

  it("pre-migration: a 23514 on update skips the transition instead of throwing", async () => {
    process.env.GBP_DISPUTE_CHECK_ENABLED = "true";
    disputeUpdate.mockRejectedValueOnce(Object.assign(new Error("check"), { code: "23514" }));
    const probe = vi.fn(async () => "gone" as const);
    const summary = await checkDisputeStatuses(probe);
    expect(summary.skipped).toBe(1);
    expect(summary.removed).toBe(0);
    expect(createNotification).not.toHaveBeenCalled();
  });
});
