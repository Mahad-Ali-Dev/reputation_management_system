import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * dispute-actions wizard-action tests (Module 08). Auth, entitlement, the
 * tenant DB, and the AI service are mocked. Contracts:
 *   - prepareDispute dual-writes reason === legacyReasonFor(violationType)
 *   - re-opens a withdrawn/rejected row; rejects an active duplicate
 *   - requireRole("manager") gates the write; entitlement does NOT block prepare
 *   - the AI draft action gates on entitlement
 *   - pre-migration (42703) → legacy-only write, no throw
 *   - markDisputeFiled sets submitted_to_google + filedAt, idempotent
 */

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
// dispute-actions imports `auth` (legacy requireOrg helper) at module load —
// mock it so the suite doesn't drag the real next-auth into the test runtime.
vi.mock("@/lib/auth/config", () => ({ auth: async () => null }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

let role: "owner" | "admin" | "manager" | "member" | "viewer" = "manager";
const requireRole = vi.fn(async (min: string) => {
  const RANK: Record<string, number> = { owner: 4, admin: 3, manager: 2, member: 1, viewer: 0 };
  if ((RANK[role] ?? -1) < (RANK[min] ?? 0)) {
    const e = Object.assign(new Error("forbidden"), { code: "forbidden" });
    throw e;
  }
  return { orgId: "org-1", userId: "user-1", role };
});
vi.mock("@/lib/auth/rbac", () => ({ requireRole: (m: string) => requireRole(m) }));

let entitled = true;
const assertEntitled = vi.fn(async () => {
  if (!entitled) {
    throw Object.assign(new Error("plan_inactive"), { code: "plan_inactive" });
  }
});
vi.mock("@/lib/billing/entitlements", () => ({ assertEntitled: () => assertEntitled() }));

const draftDisputeArgument = vi.fn(async () => ({
  argument: "drafted",
  aiMessageId: "m1",
  costMicros: 1,
  model: "claude-sonnet-test",
  kbChunksUsed: 2,
}));
vi.mock("@/lib/reviews/dispute-argument", () => ({
  draftDisputeArgument: (...a: unknown[]) => draftDisputeArgument(...(a as [])),
}));

// Tenant DB stub. The state object lets each test control what's already stored.
const state: {
  review: Record<string, unknown> | null;
  existing: Record<string, unknown> | null;
  createThrowsCode?: string;
  updateThrowsCode?: string;
} = { review: null, existing: null };

const created: Array<Record<string, unknown>> = [];
const updated: Array<Record<string, unknown>> = [];
const audits: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      review: { findFirst: async () => state.review },
      reviewDispute: {
        findUnique: async () => state.existing,
        findFirst: async () => state.existing,
        create: async (a: { data: Record<string, unknown> }) => {
          if (state.createThrowsCode) {
            const code = state.createThrowsCode;
            state.createThrowsCode = undefined;
            throw Object.assign(new Error("db"), { code });
          }
          created.push(a.data);
          return { id: "new-dispute", ...a.data };
        },
        update: async (a: { where: { id: string }; data: Record<string, unknown> }) => {
          if (state.updateThrowsCode) {
            const code = state.updateThrowsCode;
            state.updateThrowsCode = undefined;
            throw Object.assign(new Error("db"), { code });
          }
          updated.push(a.data);
          return { id: a.where.id, ...a.data };
        },
      },
      auditLog: { create: async (a: { data: Record<string, unknown> }) => audits.push(a.data) },
    }),
}));

import {
  prepareDispute,
  markDisputeFiled,
  draftDisputeArgumentAction,
} from "@/lib/reviews/dispute-actions";

const REVIEW_ID = "11111111-1111-4111-8111-111111111111";
const DISPUTE_ID = "22222222-2222-4222-8222-222222222222";

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  role = "manager";
  entitled = true;
  state.review = { id: REVIEW_ID, source: "google", externalId: "ext-1", rating: 1 };
  state.existing = null;
  state.createThrowsCode = undefined;
  state.updateThrowsCode = undefined;
  created.length = 0;
  updated.length = 0;
  audits.length = 0;
  requireRole.mockClear();
  assertEntitled.mockClear();
  draftDisputeArgument.mockClear();
});

describe("prepareDispute", () => {
  it("dual-writes reason = legacyReasonFor(violationType) and status submitted", async () => {
    await prepareDispute(fd({ reviewId: REVIEW_ID, violationType: "spam_fake", argument: "Please remove" }));
    expect(created).toHaveLength(1);
    expect(created[0]!.status).toBe("submitted");
    expect(created[0]!.violationType).toBe("spam_fake");
    expect(created[0]!.reason).toBe("fake"); // dual-write
    expect(created[0]!.details).toBe("Please remove");
    expect(audits.some((a) => a.action === "review.dispute.prepared")).toBe(true);
  });

  it("re-opens a withdrawn dispute instead of throwing", async () => {
    state.existing = { id: DISPUTE_ID, status: "withdrawn" };
    await prepareDispute(fd({ reviewId: REVIEW_ID, violationType: "off_topic", argument: "arg" }));
    expect(updated).toHaveLength(1);
    expect(updated[0]!.status).toBe("submitted");
    expect(updated[0]!.reason).toBe("wrong_business");
  });

  it("re-opens a rejected dispute (re-submit path)", async () => {
    state.existing = { id: DISPUTE_ID, status: "rejected" };
    await prepareDispute(fd({ reviewId: REVIEW_ID, violationType: "profanity_harassment", argument: "arg" }));
    expect(updated).toHaveLength(1);
    expect(updated[0]!.reason).toBe("offensive");
  });

  it("throws when an active dispute already exists", async () => {
    state.existing = { id: DISPUTE_ID, status: "submitted_to_google" };
    await expect(
      prepareDispute(fd({ reviewId: REVIEW_ID, violationType: "spam_fake", argument: "arg" })),
    ).rejects.toThrow(/already open/i);
  });

  it("rejects a review from another org (review not found)", async () => {
    state.review = null;
    await expect(
      prepareDispute(fd({ reviewId: REVIEW_ID, violationType: "spam_fake", argument: "arg" })),
    ).rejects.toThrow(/Review not found/i);
  });

  it("requires the manager role", async () => {
    role = "member";
    await expect(
      prepareDispute(fd({ reviewId: REVIEW_ID, violationType: "spam_fake", argument: "arg" })),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("does NOT gate on entitlement (a lapsed plan can still prepare)", async () => {
    entitled = false;
    await prepareDispute(fd({ reviewId: REVIEW_ID, violationType: "spam_fake", argument: "arg" }));
    expect(created).toHaveLength(1);
    expect(assertEntitled).not.toHaveBeenCalled();
  });

  it("pre-migration (42703 on create) degrades to a legacy-only write", async () => {
    state.createThrowsCode = "42703";
    await prepareDispute(fd({ reviewId: REVIEW_ID, violationType: "illegal_content", argument: "arg" }));
    expect(created).toHaveLength(1);
    expect(created[0]!.reason).toBe("other");
    expect(created[0]!.violationType).toBeUndefined(); // legacy shape omits the new column
  });
});

describe("markDisputeFiled", () => {
  it("sets submitted_to_google + filedAt and writes an audit row", async () => {
    state.existing = { id: DISPUTE_ID, status: "submitted" };
    await markDisputeFiled(fd({ disputeId: DISPUTE_ID }));
    expect(updated).toHaveLength(1);
    expect(updated[0]!.status).toBe("submitted_to_google");
    expect(updated[0]!.filedAt).toBeInstanceOf(Date);
    expect(audits.some((a) => a.action === "review.dispute.filed_external")).toBe(true);
  });

  it("is idempotent if already filed", async () => {
    state.existing = { id: DISPUTE_ID, status: "submitted_to_google" };
    await markDisputeFiled(fd({ disputeId: DISPUTE_ID }));
    expect(updated).toHaveLength(0);
  });

  it("pre-migration (42703 on update) falls back to status-only update", async () => {
    state.existing = { id: DISPUTE_ID, status: "submitted" };
    state.updateThrowsCode = "42703";
    await markDisputeFiled(fd({ disputeId: DISPUTE_ID }));
    expect(updated).toHaveLength(1);
    expect(updated[0]!.status).toBe("submitted_to_google");
    expect(updated[0]!.filedAt).toBeUndefined();
  });
});

describe("draftDisputeArgumentAction", () => {
  it("gates on entitlement and calls the AI service", async () => {
    state.review = { id: REVIEW_ID, rating: 1, body: "x", reviewerName: null, establishmentId: "est-1" };
    const res = await draftDisputeArgumentAction({ reviewId: REVIEW_ID, violationType: "spam_fake" });
    expect(res.argument).toBe("drafted");
    expect(res.kbChunksUsed).toBe(2);
    expect(assertEntitled).toHaveBeenCalledTimes(1);
    expect(draftDisputeArgument).toHaveBeenCalledTimes(1);
  });

  it("rejects when the plan is inactive (without calling the AI service)", async () => {
    entitled = false;
    state.review = { id: REVIEW_ID, rating: 1, body: "x", reviewerName: null, establishmentId: "est-1" };
    await expect(
      draftDisputeArgumentAction({ reviewId: REVIEW_ID, violationType: "spam_fake" }),
    ).rejects.toMatchObject({ code: "plan_inactive" });
    expect(draftDisputeArgument).not.toHaveBeenCalled();
  });
});
