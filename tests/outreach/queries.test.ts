import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * reviewRequestStats returns a `clicked` count; listReviewRequests honours the
 * status / triggerSource / paging filters and stays back-compatible with the
 * old `(orgId, limit:number)` signature.
 */

type RR = {
  status: string;
  triggerSource: string | null;
  sentAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  convertedAt: Date | null;
  deliveredAt: Date | null;
};

const store: { requests: RR[] } = { requests: [] };

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const matches = (r: RR, where: Record<string, unknown> | undefined) => {
      if (!where) return true;
      if (typeof where.status === "string" && r.status !== where.status) return false;
      if (typeof where.triggerSource === "string" && r.triggerSource !== where.triggerSource)
        return false;
      for (const [field, cond] of Object.entries(where)) {
        if (cond && typeof cond === "object" && "gte" in (cond as object)) {
          const v = (r as Record<string, unknown>)[field] as Date | null;
          if (!v || v < (cond as { gte: Date }).gte) return false;
        }
      }
      return true;
    };
    const tx = {
      reviewRequest: {
        count: async ({ where }: { where?: Record<string, unknown> }) =>
          store.requests.filter((r) => matches(r, where)).length,
        findMany: async ({
          where,
          skip = 0,
          take = 50,
        }: {
          where?: Record<string, unknown>;
          skip?: number;
          take?: number;
        }) => store.requests.filter((r) => matches(r, where)).slice(skip, skip + take),
      },
    };
    return fn(tx);
  },
}));

import { listReviewRequests, reviewRequestStats } from "@/lib/outreach/queries";

const ORG = "org-1";

function mk(over: Partial<RR>): RR {
  const now = new Date();
  return {
    status: "sent",
    triggerSource: "manual",
    sentAt: now,
    openedAt: null,
    clickedAt: null,
    convertedAt: null,
    deliveredAt: now,
    ...over,
  };
}

beforeEach(() => {
  store.requests = [];
});

describe("reviewRequestStats", () => {
  it("counts sent / opened / clicked / converted in the last 30 days", async () => {
    store.requests = [
      mk({ openedAt: new Date(), clickedAt: new Date() }),
      mk({ openedAt: new Date() }),
      mk({ convertedAt: new Date() }),
    ];
    const s = await reviewRequestStats(ORG);
    expect(s.sent).toBe(3);
    expect(s.opened).toBe(2);
    expect(s.clicked).toBe(1);
    expect(s.converted).toBe(1);
  });
});

describe("listReviewRequests", () => {
  beforeEach(() => {
    store.requests = [
      mk({ status: "sent", triggerSource: "manual" }),
      mk({ status: "failed", triggerSource: "automation" }),
      mk({ status: "sent", triggerSource: "automation" }),
    ];
  });

  it("filters by status", async () => {
    const rows = await listReviewRequests(ORG, { status: "failed" });
    expect(rows.length).toBe(1);
  });

  it("filters by triggerSource", async () => {
    const rows = await listReviewRequests(ORG, { triggerSource: "automation" });
    expect(rows.length).toBe(2);
  });

  it("honours paging", async () => {
    const rows = await listReviewRequests(ORG, { take: 1, skip: 1 });
    expect(rows.length).toBe(1);
  });

  it("stays back-compatible with a bare number limit", async () => {
    const rows = await listReviewRequests(ORG, 2);
    expect(rows.length).toBe(2);
  });
});
