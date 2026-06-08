import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Token-refresh fail-soft tests (Module 14, risk C10). `refreshConnectionToken`
 * touches ENCRYPTED material, so the hard rule is: on ANY failure it marks the
 * connection `status:"error"` and returns `{ ok:false }` — it NEVER throws up to
 * the cron and NEVER overwrites the stored token with garbage.
 *
 * Everything external is mocked (Prisma, envelope crypto, provider app load,
 * saveConnection, fetch) so this is fully offline.
 */

const connectionFindUnique = vi.fn();
const connectionUpdate = vi.fn(async (_args?: unknown) => ({}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    connection: {
      findUnique: (...a: unknown[]) => connectionFindUnique(...a),
      update: (...a: unknown[]) => connectionUpdate(...a),
    },
  },
}));

const decrypt = vi.fn((_record?: unknown) => "decrypted-token");
vi.mock("@/lib/crypto/envelope", () => ({
  decrypt: (...a: unknown[]) => decrypt(...(a as [unknown])),
}));

const loadProviderApp = vi.fn(async (_p: string) => null as unknown);
const saveConnection = vi.fn(async (_args?: unknown) => ({ id: "conn-1" }));
vi.mock("@/lib/connections/oauth-helpers", () => ({
  loadProviderApp: (...a: unknown[]) => loadProviderApp(...(a as [string])),
  saveConnection: (...a: unknown[]) => saveConnection(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { refreshConnectionToken } from "@/lib/connections/adapters/refresh";

const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 3_600_000);

function bytes(): Uint8Array {
  return new Uint8Array([1, 2, 3, 4]);
}

function connRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    organizationId: "org-1",
    provider: "clover",
    externalId: "merchant-1",
    accountLabel: "Clover merchant",
    establishmentId: null,
    accessTokenCt: bytes(),
    refreshTokenCt: bytes(),
    iv: bytes(),
    keyVersion: 1,
    dekCiphertext: bytes(),
    encryptionCtx: { orgId: "org-1", provider: "clover", purpose: "oauth" },
    tokenExpiresAt: PAST,
    scopes: ["read:customers"],
    ...overrides,
  };
}

const fetchSpy = vi.fn();

beforeEach(() => {
  connectionFindUnique.mockReset();
  connectionUpdate.mockReset();
  connectionUpdate.mockResolvedValue({});
  decrypt.mockReset();
  decrypt.mockReturnValue("decrypted-token");
  loadProviderApp.mockReset();
  loadProviderApp.mockResolvedValue(null);
  saveConnection.mockReset();
  saveConnection.mockResolvedValue({ id: "conn-1" });
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refreshConnectionToken — happy path (not expired)", () => {
  it("returns the decrypted token without refreshing when not expired", async () => {
    connectionFindUnique.mockResolvedValue(connRow({ tokenExpiresAt: FUTURE }));
    const res = await refreshConnectionToken("conn-1");
    expect(res).toEqual({
      ok: true,
      accessToken: "decrypted-token",
      expiresAt: FUTURE,
      refreshed: false,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(connectionUpdate).not.toHaveBeenCalled();
  });
});

describe("refreshConnectionToken — fail-soft → status:error, never throws", () => {
  it("marks error when the provider token endpoint returns non-2xx", async () => {
    connectionFindUnique.mockResolvedValue(connRow());
    loadProviderApp.mockResolvedValue({
      provider: "clover",
      clientId: "id",
      clientSecret: "secret",
      scopes: ["read:customers"],
      oauthUrl: null,
      tokenUrl: "https://api.clover.com/oauth/token",
      redirectPath: "/api/connections/clover/callback",
    });
    fetchSpy.mockResolvedValue({ ok: false, status: 400, text: async () => "bad" });

    const res = await refreshConnectionToken("conn-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("refresh_http_400");

    // Connection flipped to error, token ciphertext left untouched.
    expect(connectionUpdate).toHaveBeenCalled();
    const arg = connectionUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.status).toBe("error");
    expect(arg.data).not.toHaveProperty("accessTokenCt");
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it("marks error when an expired token has no refresh token", async () => {
    connectionFindUnique.mockResolvedValue(connRow({ refreshTokenCt: null }));
    const res = await refreshConnectionToken("conn-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("no_refresh_token");
    expect(fetchSpy).not.toHaveBeenCalled();
    const arg = connectionUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.status).toBe("error");
  });

  it("marks error when no provider app / token endpoint is configured", async () => {
    connectionFindUnique.mockResolvedValue(connRow());
    loadProviderApp.mockResolvedValue(null);
    const res = await refreshConnectionToken("conn-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("provider_not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(connectionUpdate).toHaveBeenCalled();
  });

  it("marks error when the refresh request throws (network failure)", async () => {
    connectionFindUnique.mockResolvedValue(connRow());
    loadProviderApp.mockResolvedValue({
      provider: "clover",
      clientId: "id",
      clientSecret: "secret",
      scopes: [],
      oauthUrl: null,
      tokenUrl: "https://api.clover.com/oauth/token",
      redirectPath: "/x",
    });
    fetchSpy.mockRejectedValue(new Error("ECONNRESET"));
    const res = await refreshConnectionToken("conn-1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("refresh_request_failed");
    const arg = connectionUpdate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data.status).toBe("error");
  });

  it("never throws even if the connection load itself fails", async () => {
    connectionFindUnique.mockRejectedValue(new Error("db down"));
    const res = await refreshConnectionToken("conn-1");
    expect(res).toEqual({ ok: false, reason: "connection_load_failed" });
  });

  it("returns not-found (no error mark) when the connection is missing", async () => {
    connectionFindUnique.mockResolvedValue(null);
    const res = await refreshConnectionToken("missing");
    expect(res).toEqual({ ok: false, reason: "connection_not_found" });
    expect(connectionUpdate).not.toHaveBeenCalled();
  });
});

describe("refreshConnectionToken — markError fail-soft on unmigrated sync_* columns", () => {
  it("falls back to the base status column when sync_* update raises 42703", async () => {
    connectionFindUnique.mockResolvedValue(connRow({ refreshTokenCt: null }));
    // First update (with sync_* fields) fails as undefined_column; the fallback
    // (status-only) succeeds. Refresh must still return ok:false without throwing.
    connectionUpdate
      .mockRejectedValueOnce(Object.assign(new Error("no column"), { code: "42703" }))
      .mockResolvedValueOnce({});
    const res = await refreshConnectionToken("conn-1");
    expect(res.ok).toBe(false);
    expect(connectionUpdate).toHaveBeenCalledTimes(2);
    const fallback = connectionUpdate.mock.calls[1]![0] as { data: Record<string, unknown> };
    expect(fallback.data).toEqual({ status: "error" });
  });
});

describe("refreshConnectionToken — successful rotation persists via saveConnection", () => {
  it("exchanges the refresh token and re-saves without marking error", async () => {
    connectionFindUnique.mockResolvedValue(connRow());
    loadProviderApp.mockResolvedValue({
      provider: "clover",
      clientId: "id",
      clientSecret: "secret",
      scopes: ["read:customers"],
      oauthUrl: null,
      tokenUrl: "https://api.clover.com/oauth/token",
      redirectPath: "/x",
    });
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "new-token", expires_in: 3600, refresh_token: "new-refresh" }),
    });

    const res = await refreshConnectionToken("conn-1");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.accessToken).toBe("new-token");
      expect(res.refreshed).toBe(true);
    }
    expect(saveConnection).toHaveBeenCalledTimes(1);
    expect(connectionUpdate).not.toHaveBeenCalled(); // no error mark on success
  });
});
