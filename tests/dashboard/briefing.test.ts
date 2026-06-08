import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Briefing tests — the AI client, tenant DB, entitlement, and budget are all
 * mocked so we assert behavior without a live DB or paid call.
 */

// --- mocks ------------------------------------------------------------------
const messagesCreate = vi.fn();

vi.mock("@/lib/ai/client", () => ({
  MODELS: { HAIKU: "claude-haiku-test", SONNET: "s", OPUS: "o" },
  anthropic: {
    messages: {
      create: (...args: unknown[]) => messagesCreate(...args),
    },
  },
}));

// withTenant just invokes the callback with a stub tx whose review/reviewReply
// methods return controllable values.
const tenantState = {
  last24: [] as { rating: number }[],
  prev24: [] as { rating: number }[],
  pending: 0,
  needsReply: 0,
  totalReviews: 0,
};

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) => {
    let reviewFindCall = 0;
    const tx = {
      review: {
        findMany: async () => {
          // First findMany = last24, second = prev24 (order in readBriefingSignals).
          reviewFindCall += 1;
          return reviewFindCall === 1 ? tenantState.last24 : tenantState.prev24;
        },
        count: async () => tenantState.needsReply, // needsReply uses where rating<=3
      },
      reviewReply: {
        count: async () => tenantState.pending,
      },
    };
    // The real code calls review.count twice (needsReply + total) — disambiguate
    // by returning needsReply first then total.
    let countCall = 0;
    tx.review.count = async () => {
      countCall += 1;
      return countCall === 1 ? tenantState.needsReply : tenantState.totalReviews;
    };
    return fn(tx);
  },
}));

const isOrgEntitled = vi.fn(async (_orgId: string) => true);
vi.mock("@/lib/billing/entitlements", () => ({
  isOrgEntitled: (orgId: string) => isOrgEntitled(orgId),
}));

const checkBudget = vi.fn(async (_orgId: string) => ({ ok: true, spentMicros: 0, capMicros: 1_000_000 }));
vi.mock("@/lib/ai/budget", () => ({
  checkBudget: (orgId: string) => checkBudget(orgId),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// import AFTER mocks
import {
  buildBriefingForOrg,
  getCachedBriefing,
  templateBriefing,
  type BriefingSignals,
} from "@/lib/dashboard/briefing";

const ORG = "11111111-1111-1111-1111-111111111111";

function resetTenant(overrides: Partial<typeof tenantState> = {}) {
  tenantState.last24 = overrides.last24 ?? [];
  tenantState.prev24 = overrides.prev24 ?? [];
  tenantState.pending = overrides.pending ?? 0;
  tenantState.needsReply = overrides.needsReply ?? 0;
  tenantState.totalReviews = overrides.totalReviews ?? 0;
}

describe("templateBriefing", () => {
  const empty: BriefingSignals = {
    newReviews24h: 0,
    avgRating24h: null,
    pendingReplies: 0,
    needsReply: 0,
    sentimentDeltaPts: null,
    isEmpty: true,
  };

  it("renders a welcome variant for empty orgs", () => {
    const text = templateBriefing("Dana", empty);
    expect(text).toMatch(/Dana/);
    expect(text).toMatch(/Connect your Google Business Profile/i);
  });

  it("summarizes new reviews and pending replies", () => {
    const text = templateBriefing("Sam", {
      newReviews24h: 3,
      avgRating24h: 4.6,
      pendingReplies: 2,
      needsReply: 0,
      sentimentDeltaPts: null,
      isEmpty: false,
    });
    expect(text).toMatch(/3 new reviews/);
    expect(text).toMatch(/4.6/);
    expect(text).toMatch(/2 AI replies are waiting/);
  });

  it("falls back to a calm message when nothing happened", () => {
    const text = templateBriefing("Lee", {
      newReviews24h: 0,
      avgRating24h: null,
      pendingReplies: 0,
      needsReply: 0,
      sentimentDeltaPts: null,
      isEmpty: false,
    });
    expect(text).toMatch(/No new reviews/i);
  });
});

describe("getCachedBriefing", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    resetTenant();
  });

  it("never calls the AI client (deterministic, no paid call on render)", async () => {
    resetTenant({ last24: [{ rating: 5 }, { rating: 4 }], totalReviews: 10, pending: 1 });
    const b = await getCachedBriefing(ORG, "Pat");
    expect(b.model).toBeNull();
    expect(b.body).toMatch(/Pat/);
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});

describe("buildBriefingForOrg", () => {
  const realKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    messagesCreate.mockReset();
    isOrgEntitled.mockClear();
    checkBudget.mockClear();
    resetTenant({ last24: [{ rating: 5 }], totalReviews: 5 });
  });

  afterEach(() => {
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  });

  it("returns the deterministic template and makes NO AI call when no API key is set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const b = await buildBriefingForOrg(ORG, new Date(), "Jordan");
    expect(b.model).toBeNull();
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(b.body).toMatch(/Jordan/);
  });

  it("uses the mocked AI text when creds + entitlement + budget allow", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-real-key";
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "You're trending up — 1 new five-star review today." }],
    });
    const b = await buildBriefingForOrg(ORG, new Date(), "Riley");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
    expect(b.model).toBe("claude-haiku-test");
    expect(b.body).toMatch(/trending up/);
  });

  it("degrades to template (no AI call) when the org is not entitled", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-real-key";
    isOrgEntitled.mockResolvedValueOnce(false);
    const b = await buildBriefingForOrg(ORG, new Date(), "Quinn");
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(b.model).toBeNull();
  });

  it("degrades to template (no AI call) when over budget", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-real-key";
    checkBudget.mockResolvedValueOnce({ ok: false, spentMicros: 1, capMicros: 1 });
    const b = await buildBriefingForOrg(ORG, new Date(), "Avery");
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(b.model).toBeNull();
  });

  it("does not call AI for empty orgs even with creds", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-real-key";
    resetTenant({ totalReviews: 0 });
    const b = await buildBriefingForOrg(ORG, new Date(), "Morgan");
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(b.model).toBeNull();
    expect(b.body).toMatch(/Connect your Google Business Profile/i);
  });
});
