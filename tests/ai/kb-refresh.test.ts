import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * refreshOrgKb: no sourceUrl → skip; extracted == stored → changed:false, no
 * write/email; differing field → update + re-ingest + changed fields.
 * All network/AI/DB deps mocked.
 */

const state = {
  profile: null as Record<string, unknown> | null,
  extracted: {
    businessOverview: "",
    servicesProducts: "",
    pricingDetails: "",
    locations: "",
    operatingHours: {} as Record<string, unknown>,
    costMicros: 0,
  },
  crawlOk: true,
  profileUpdates: [] as Record<string, unknown>[],
  ingested: 0,
  audits: [] as string[],
};

// kb-refresh.ts imports auto-setup (→ next-auth/config) for mergeProfile — stub
// the framework deps so the unit test has no side effects.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("@/lib/auth/config", () => ({ auth: async () => null }));

vi.mock("@/lib/ai/crawl", () => ({
  crawlSite: async () =>
    state.crawlOk
      ? { result: { rootUrl: "https://x.com", pagesCrawled: 2, text: "corpus", fetchedAt: new Date() } }
      : { error: "fetch_failed" },
}));

vi.mock("@/lib/ai/extract-profile", () => ({
  extractBusinessProfile: async () => state.extracted,
}));

vi.mock("@/lib/ai/ingest", () => ({
  ingestDocument: async () => {
    state.ingested += 1;
    return { chunks: 1, reused: false };
  },
}));

vi.mock("@/lib/email/kb-update", () => ({
  sendKbUpdateEmail: async () => ({ sent: false, reason: "no_resend_key" }),
}));

vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      aiTrainingProfile: {
        findUnique: async () => state.profile,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          state.profileUpdates.push(data);
          return data;
        },
        create: async ({ data }: { data: Record<string, unknown> }) => data,
      },
      aiDocument: {
        findFirst: async () => null,
        create: async () => ({ id: "doc1" }),
        update: async () => ({ id: "doc1" }),
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          state.audits.push(data.action as string);
          return data;
        },
      },
    };
    return fn(tx);
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    organization: { findMany: async () => [] },
    membership: { findMany: async () => [] },
  },
}));

const ORG = "00000000-0000-4000-8000-00000000000a";

beforeEach(() => {
  state.profile = null;
  state.extracted = {
    businessOverview: "",
    servicesProducts: "",
    pricingDetails: "",
    locations: "",
    operatingHours: {},
    costMicros: 0,
  };
  state.crawlOk = true;
  state.profileUpdates = [];
  state.ingested = 0;
  state.audits = [];
});

describe("refreshOrgKb", () => {
  it("skips when there is no sourceUrl (no paid call)", async () => {
    state.profile = { sourceUrl: null };
    const { refreshOrgKb } = await import("@/lib/ai/kb-refresh");
    const r = await refreshOrgKb(ORG);
    expect(r).toEqual({ changed: false, fields: [], skipped: "no_source_url" });
    expect(state.ingested).toBe(0);
  });

  it("reports no change when extracted matches stored", async () => {
    state.profile = {
      sourceUrl: "https://x.com",
      businessOverview: "Same overview text here.",
      servicesProducts: "Same services.",
      pricingDetails: null,
      locations: null,
      operatingHours: null,
    };
    state.extracted = {
      businessOverview: "Same overview text here.",
      servicesProducts: "Same services.",
      pricingDetails: "",
      locations: "",
      operatingHours: {},
      costMicros: 0,
    };
    const { refreshOrgKb } = await import("@/lib/ai/kb-refresh");
    const r = await refreshOrgKb(ORG);
    expect(r.changed).toBe(false);
    expect(r.fields).toEqual([]);
    // No re-ingest + no audit row for a no-change run.
    expect(state.ingested).toBe(0);
    expect(state.audits).not.toContain("ai.kb.auto_updated");
  });

  it("updates + re-ingests + audits when a field changes", async () => {
    state.profile = {
      sourceUrl: "https://x.com",
      businessOverview: "Old overview.",
      servicesProducts: null,
      pricingDetails: null,
      locations: null,
      operatingHours: null,
    };
    state.extracted = {
      businessOverview: "Brand new overview after a rebrand.",
      servicesProducts: "",
      pricingDetails: "",
      locations: "",
      operatingHours: {},
      costMicros: 0,
    };
    const { refreshOrgKb } = await import("@/lib/ai/kb-refresh");
    const r = await refreshOrgKb(ORG);
    expect(r.changed).toBe(true);
    expect(r.fields).toContain("overview");
    expect(state.ingested).toBe(1);
    expect(state.audits).toContain("ai.kb.auto_updated");
  });
});
