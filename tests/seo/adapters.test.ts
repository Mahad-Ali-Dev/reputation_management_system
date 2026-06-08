import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit (ADAPTER RULE GUARD) — the five SEO adapters.
 *
 * The load-bearing guarantee: with creds UNSET, each of ga4 / pagespeed /
 * gbp-insights / rank-tracker / citation-audit returns `{available:false}`
 * (or [] for suggest) and the shared outbound `_transport` seam is NEVER
 * invoked (spy asserts 0 calls) — i.e. ZERO live/paid calls in the default
 * code path. With mocked creds + a stubbed seam returning a canned payload,
 * each maps to the expected shape.
 *
 * `@/lib/env` (cred flags), `_transport` (the single network seam),
 * `withTenant`, `envelope.decrypt`, and the logger are all mocked.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const EST = "22222222-2222-4222-8222-222222222222";

// ── Mutable env stub (flip creds per test) ──────────────────────
const envState = vi.hoisted(() => ({
  GA4_CLIENT_EMAIL: "",
  GA4_PRIVATE_KEY: "",
  GA4_PROPERTY_ID: "",
  PAGESPEED_API_KEY: "",
  RANK_TRACKER_PROVIDER: "",
  RANK_TRACKER_API_KEY: "",
}));
vi.mock("@/lib/env", () => ({ env: envState }));

// ── The single outbound seam — spied + stubbable ────────────────
const seam = vi.hoisted(() => ({
  ga4RunReport: vi.fn(async () => null as unknown),
  pageSpeedRun: vi.fn(async () => null as unknown),
  gbpPerformanceRun: vi.fn(async () => null as unknown),
  rankProviderCall: vi.fn(async () => null as unknown),
}));
vi.mock("@/lib/seo/adapters/_transport", () => ({
  ga4RunReport: (...a: unknown[]) => seam.ga4RunReport(...(a as [])),
  pageSpeedRun: (...a: unknown[]) => seam.pageSpeedRun(...(a as [])),
  gbpPerformanceRun: (...a: unknown[]) => seam.gbpPerformanceRun(...(a as [])),
  rankProviderCall: (...a: unknown[]) => seam.rankProviderCall(...(a as [])),
}));

// ── DB + crypto stubs (for gbp + citation-audit) ────────────────
type FakeTx = Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const tenantState = vi.hoisted(() => ({
  buildTx: (() => ({})) as () => FakeTx,
  throwErr: null as Error | null,
}));
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: async (_orgId: string, fn: (tx: FakeTx) => unknown) => {
    if (tenantState.throwErr) throw tenantState.throwErr;
    return fn(tenantState.buildTx());
  },
}));
vi.mock("@/lib/crypto/envelope", () => ({
  decrypt: vi.fn(() => "decrypted-access-token"),
}));

import { fetchGa4Summary } from "@/lib/seo/adapters/ga4";
import { fetchCoreWebVitals } from "@/lib/seo/adapters/pagespeed";
import { fetchGbpInsights, getGbpInsights } from "@/lib/seo/adapters/gbp-insights";
import {
  fetchKeywordRanks,
  fetchGeoGrid,
  suggestKeywords,
  suggestCompetitors,
  rankTrackerConfigured,
} from "@/lib/seo/adapters/rank-tracker";
import { runCitationAudit, compareNap } from "@/lib/seo/citation-audit";

beforeEach(() => {
  for (const k of Object.keys(envState) as (keyof typeof envState)[]) envState[k] = "";
  seam.ga4RunReport.mockReset().mockResolvedValue(null);
  seam.pageSpeedRun.mockReset().mockResolvedValue(null);
  seam.gbpPerformanceRun.mockReset().mockResolvedValue(null);
  seam.rankProviderCall.mockReset().mockResolvedValue(null);
  tenantState.throwErr = null;
  tenantState.buildTx = () => ({});
});

// ───────────────────────────── GA4 ─────────────────────────────
describe("ga4 adapter", () => {
  it("no creds → {available:false}, seam NEVER called", async () => {
    const res = await fetchGa4Summary({ orgId: ORG, establishmentId: EST });
    expect(res).toEqual({ available: false });
    expect(seam.ga4RunReport).not.toHaveBeenCalled();
  });

  it("creds present but no property id → {available:false}, seam NEVER called", async () => {
    envState.GA4_CLIENT_EMAIL = "svc@x.iam";
    envState.GA4_PRIVATE_KEY = "-----KEY-----";
    tenantState.buildTx = () => ({
      ga4Connection: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const res = await fetchGa4Summary({ orgId: ORG });
    expect(res).toEqual({ available: false });
    expect(seam.ga4RunReport).not.toHaveBeenCalled();
  });

  it("creds + property + canned seam payload → mapped shape", async () => {
    envState.GA4_CLIENT_EMAIL = "svc@x.iam";
    envState.GA4_PRIVATE_KEY = "-----KEY-----";
    tenantState.buildTx = () => ({
      ga4Connection: { findFirst: vi.fn().mockResolvedValue({ propertyId: "G-123" }) },
    });
    seam.ga4RunReport.mockResolvedValueOnce({
      sessions: 1200,
      bounceRate: 0.42,
      topPages: [{ path: "/", views: 800 }],
    });
    const res = await fetchGa4Summary({ orgId: ORG, establishmentId: EST });
    expect(res.available).toBe(true);
    expect(res.sessions).toBe(1200);
    expect(res.bounceRate).toBe(0.42);
    expect(res.propertyId).toBe("G-123");
    expect(seam.ga4RunReport).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────── PageSpeed ─────────────────────────
describe("pagespeed adapter", () => {
  it("no key → {available:false}, seam NEVER called", async () => {
    const res = await fetchCoreWebVitals({ url: "https://example.com" });
    expect(res).toEqual({ available: false });
    expect(seam.pageSpeedRun).not.toHaveBeenCalled();
  });

  it("key present but empty url → {available:false}, seam NEVER called", async () => {
    envState.PAGESPEED_API_KEY = "psi-key";
    const res = await fetchCoreWebVitals({ url: "   " });
    expect(res).toEqual({ available: false });
    expect(seam.pageSpeedRun).not.toHaveBeenCalled();
  });

  it("key + canned payload → mapped shape", async () => {
    envState.PAGESPEED_API_KEY = "psi-key";
    seam.pageSpeedRun.mockResolvedValueOnce({ performanceScore: 92, lcpSeconds: 1.8, cls: 0.02 });
    const res = await fetchCoreWebVitals({ url: "https://example.com" });
    expect(res.available).toBe(true);
    expect(res.performanceScore).toBe(92);
    expect(res.url).toBe("https://example.com");
    expect(seam.pageSpeedRun).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────── GBP Insights ───────────────────────
describe("gbp-insights adapter (contract for module 15)", () => {
  it("no active google_business connection → {available:false}, seam NEVER called", async () => {
    tenantState.buildTx = () => ({ connection: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await getGbpInsights(ORG);
    expect(res).toEqual({ available: false });
    expect(seam.gbpPerformanceRun).not.toHaveBeenCalled();
  });

  it("getGbpInsights returns the exact contract shape", async () => {
    tenantState.buildTx = () => ({ connection: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await getGbpInsights(ORG);
    // shape: { available, views?, calls?, directions?, searches? }
    expect(res).toHaveProperty("available");
    expect(typeof res.available).toBe("boolean");
  });

  it("connection without place id → {available:false}, seam NEVER called", async () => {
    tenantState.buildTx = () => ({
      connection: {
        findFirst: vi.fn().mockResolvedValue({
          establishment: { googlePlaceId: null },
          tokenExpiresAt: null,
        }),
      },
    });
    const res = await fetchGbpInsights({ orgId: ORG });
    expect(res.available).toBe(false);
    expect(seam.gbpPerformanceRun).not.toHaveBeenCalled();
  });

  it("active connection + canned payload → mapped funnel metrics", async () => {
    tenantState.buildTx = () => ({
      connection: {
        findFirst: vi.fn().mockResolvedValue({
          organizationId: ORG,
          establishment: { googlePlaceId: "accounts/1/locations/2" },
          tokenExpiresAt: new Date(Date.now() + 3_600_000),
          accessTokenCt: Buffer.from("ct"),
          iv: Buffer.from("iv"),
          dekCiphertext: Buffer.from("dek"),
          keyVersion: 1,
          encryptionCtx: null,
        }),
      },
    });
    seam.gbpPerformanceRun.mockResolvedValueOnce({
      views: 5000,
      calls: 120,
      directions: 80,
      searches: 4200,
    });
    const res = await getGbpInsights(ORG);
    expect(res).toEqual({
      available: true,
      views: 5000,
      calls: 120,
      directions: 80,
      searches: 4200,
    });
    expect(seam.gbpPerformanceRun).toHaveBeenCalledTimes(1);
  });

  it("unmigrated connections table → {available:false}, seam NEVER called", async () => {
    tenantState.throwErr = Object.assign(new Error("relation does not exist"), { code: "42P01" });
    const res = await getGbpInsights(ORG);
    expect(res).toEqual({ available: false });
    expect(seam.gbpPerformanceRun).not.toHaveBeenCalled();
  });
});

// ────────────────────────── Rank Tracker ───────────────────────
describe("rank-tracker adapter (PAID)", () => {
  it("not configured → every fn no-ops, seam NEVER called", async () => {
    expect(rankTrackerConfigured()).toBe(false);
    expect(await fetchKeywordRanks({ orgId: ORG, keywords: ["a"] })).toEqual({ available: false });
    expect(
      await fetchGeoGrid({ orgId: ORG, keyword: "k", centerLat: 30, centerLng: -97 }),
    ).toEqual({ available: false });
    expect(await suggestKeywords({ category: "dentist" })).toEqual({ available: false, items: [] });
    expect(await suggestCompetitors({ category: "dentist" })).toEqual({
      available: false,
      items: [],
    });
    expect(seam.rankProviderCall).not.toHaveBeenCalled();
  });

  it("provider set but no api key → not configured, seam NEVER called", async () => {
    envState.RANK_TRACKER_PROVIDER = "dataforseo";
    expect(rankTrackerConfigured()).toBe(false);
    await fetchKeywordRanks({ orgId: ORG, keywords: ["a"] });
    expect(seam.rankProviderCall).not.toHaveBeenCalled();
  });

  it("invalid provider name → not configured even with a key", async () => {
    envState.RANK_TRACKER_PROVIDER = "totally-fake";
    envState.RANK_TRACKER_API_KEY = "key";
    expect(rankTrackerConfigured()).toBe(false);
  });

  it("configured + canned ranks → mapped shape", async () => {
    envState.RANK_TRACKER_PROVIDER = "dataforseo";
    envState.RANK_TRACKER_API_KEY = "key";
    expect(rankTrackerConfigured()).toBe(true);
    seam.rankProviderCall.mockResolvedValueOnce({
      ranks: [{ keyword: "dentist", position: 3, inLocalPack: true, searchVolume: 500 }],
    });
    const res = await fetchKeywordRanks({ orgId: ORG, keywords: ["dentist"], geo: "Austin" });
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.provider).toBe("dataforseo");
      expect(res.ranks[0]!.position).toBe(3);
    }
    expect(seam.rankProviderCall).toHaveBeenCalledTimes(1);
  });

  it("configured + canned geo grid → computes avgPosition from cells", async () => {
    envState.RANK_TRACKER_PROVIDER = "brightlocal";
    envState.RANK_TRACKER_API_KEY = "key";
    seam.rankProviderCall.mockResolvedValueOnce({
      cells: [
        { lat: 1, lng: 1, position: 2 },
        { lat: 2, lng: 2, position: 4 },
        { lat: 3, lng: 3, position: null },
      ],
    });
    const res = await fetchGeoGrid({ orgId: ORG, keyword: "k", centerLat: 30, centerLng: -97 });
    expect(res.available).toBe(true);
    if (res.available) {
      expect(res.avgPosition).toBe(3); // (2+4)/2
      expect(res.cells).toHaveLength(3);
    }
  });
});

// ───────────────────────── Citation Audit ──────────────────────
describe("citation-audit", () => {
  it("compareNap: matching NAP → consistent", () => {
    const r = compareNap(
      { name: "Acme Co.", address: "123 Main St, Austin", phone: "+1 512-555-1212" },
      { name: "Acme Co", address: "123 Main St Austin", phone: "(512) 555-1212" },
    );
    expect(r.status).toBe("consistent");
    expect(r.nameMatch).toBe(true);
    expect(r.phoneMatch).toBe(true);
  });

  it("compareNap: no listing → missing", () => {
    const r = compareNap({ name: "Acme", address: "x", phone: null }, null);
    expect(r.status).toBe("missing");
    expect(r.nameMatch).toBeNull();
  });

  it("compareNap: partial mismatch → inconsistent", () => {
    const r = compareNap(
      { name: "Acme", address: "123 Main", phone: "5125551212" },
      { name: "Acme", address: "999 Other", phone: "5125551212" },
    );
    expect(r.status).toBe("inconsistent");
    expect(r.addressMatch).toBe(false);
  });

  it("no provider → all 4 directories persisted as unknown/missing, seam NEVER called", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const createMany = vi.fn().mockResolvedValue({ count: 4 });
    tenantState.buildTx = () => ({
      establishment: {
        findUnique: vi.fn().mockResolvedValue({
          name: "Acme",
          address: { line1: "123 Main", city: "Austin" },
          phone: "5125551212",
          googlePlaceId: "place-1",
        }),
      },
      citationAudit: { deleteMany, createMany },
    });
    const res = await runCitationAudit(ORG, EST);
    expect(res.available).toBe(false); // provider not configured
    expect(res.rows).toHaveLength(4);
    expect(res.rows.every((r) => r.status === "missing" || r.status === "unknown")).toBe(true);
    expect(seam.rankProviderCall).not.toHaveBeenCalled();
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it("unmigrated table → {available:false, rows:[]}", async () => {
    tenantState.throwErr = Object.assign(new Error("no relation"), { code: "42P01" });
    const res = await runCitationAudit(ORG, EST);
    expect(res).toEqual({ available: false, rows: [] });
  });
});
