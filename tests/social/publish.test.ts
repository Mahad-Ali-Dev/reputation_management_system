import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Publish adapter (Module 10, Wave 3d) — the guardrail under test: the DEFAULT
 * path makes ZERO outbound (paid) network calls.
 *
 *  - No connection → `{ skipped:"not_configured" }`, fetch never called.
 *  - `META_GRAPH_ENABLED` unset → skipped EVEN WITH a connection (proves the env
 *    gate, not just the connection check, blocks paid calls in the default path).
 *  - Non-Meta platforms (twitter/linkedin) → always `not_configured` (no adapter).
 *
 * `withTenant` + token decryption are mocked; `global.fetch` is spied to PROVE no
 * call escapes.
 */

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

type FakeTx = { connection: { findFirst: ReturnType<typeof vi.fn> } };
let tx: FakeTx;
let withTenantImpl: (orgId: string, fn: (tx: FakeTx) => unknown) => Promise<unknown>;
vi.mock("@/lib/db/with-tenant", () => ({
  withTenant: (orgId: string, fn: (tx: FakeTx) => unknown) => withTenantImpl(orgId, fn),
}));

// Token decryption — return a fake token so the ONLY thing standing between us
// and a paid call is the env gate (which must hold).
vi.mock("@/lib/connections/adapters/refresh", () => ({
  decryptAccessToken: vi.fn(() => "fake-token"),
}));

import { isMetaPublishEnabled, publishSocialPost } from "@/lib/social/publish";

const ORG = "11111111-1111-4111-8111-111111111111";

const fetchSpy = vi.fn(async () => {
  throw new Error("network call attempted in a no-creds/disabled path");
});

const ENV_KEYS = ["META_GRAPH_ENABLED", "META_GRAPH_TOKEN", "META_APP_ID", "META_APP_SECRET"];
const saved: Record<string, string | undefined> = {};

function post(overrides: Partial<Parameters<typeof publishSocialPost>[0]> = {}) {
  return {
    id: "post-1",
    platforms: ["facebook", "instagram"],
    caption: "Hello from the test",
    mediaUrl: null,
    approvedCreativeUrls: [],
    establishmentId: null,
    ...overrides,
  };
}

beforeEach(() => {
  tx = { connection: { findFirst: vi.fn().mockResolvedValue(null) } };
  withTenantImpl = async (_orgId, fn) => fn(tx);
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isMetaPublishEnabled", () => {
  it("false when unset (default)", () => {
    expect(isMetaPublishEnabled()).toBe(false);
  });
  it("false when flag on but no token", () => {
    process.env.META_GRAPH_ENABLED = "true";
    expect(isMetaPublishEnabled()).toBe(false);
  });
  it("true only when flag on AND a token/app exists", () => {
    process.env.META_GRAPH_ENABLED = "true";
    process.env.META_GRAPH_TOKEN = "tok";
    expect(isMetaPublishEnabled()).toBe(true);
  });
});

describe("publishSocialPost — no paid call in the default path", () => {
  it("no connection → all platforms skipped, fetch NEVER called", async () => {
    const results = await publishSocialPost(post(), ORG);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.ok).toBe(false);
      expect("skipped" in r && r.skipped).toBe("not_configured");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("META disabled but a connection EXISTS → still skipped, fetch NEVER called", async () => {
    // A live connection is present...
    tx.connection.findFirst.mockResolvedValue({
      id: "c1",
      organizationId: ORG,
      provider: "meta",
      externalId: "page-123",
      accessTokenCt: new Uint8Array([1]),
      refreshTokenCt: null,
      iv: new Uint8Array([2]),
      keyVersion: 1,
      dekCiphertext: new Uint8Array([3]),
      encryptionCtx: { orgId: ORG, provider: "meta", purpose: "oauth" },
    });
    // ...but META_GRAPH_ENABLED is unset → the env gate must block the call.
    const results = await publishSocialPost(post(), ORG);
    for (const r of results) {
      expect("skipped" in r && r.skipped).toBe("not_configured");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    // The connection lookup is never even reached because the env gate is first.
    expect(tx.connection.findFirst).not.toHaveBeenCalled();
  });

  it("twitter + linkedin are always not_configured (no live adapter), no fetch", async () => {
    const results = await publishSocialPost(post({ platforms: ["twitter", "linkedin"] }), ORG);
    for (const r of results) {
      expect("skipped" in r && r.skipped).toBe("not_configured");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores unknown platform strings entirely", async () => {
    const results = await publishSocialPost(post({ platforms: ["myspace", "facebook"] }), ORG);
    // Only facebook is a recognized platform.
    expect(results).toHaveLength(1);
    expect(results[0]!.platform).toBe("facebook");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
