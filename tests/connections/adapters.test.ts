import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Connection adapter tests (Module 14, Wave 3a) — Toast + Clover + registry.
 *
 * The guardrail under test: an env/credential-gated adapter reports
 * `{ available:false }` and `fetchRecentContacts` returns `[]` making ZERO
 * network calls when no creds + no live token are present. No paid/external API
 * is ever hit on a default code path.
 *
 * `loadProviderApp` (a DB read) is mocked to return null so "unconfigured" is
 * deterministic and offline; `global.fetch` is spied to PROVE no call escapes.
 */

const loadProviderApp = vi.fn(async (_provider: string) => null as unknown);
vi.mock("@/lib/connections/oauth-helpers", () => ({
  loadProviderApp: (...a: unknown[]) => loadProviderApp(...(a as [string])),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { cloverAdapter } from "@/lib/connections/adapters/clover";
import {
  getAdapter,
  hasRealAdapter,
  registeredAdapterIds,
} from "@/lib/connections/adapters";
import type { AdapterSyncCtx } from "@/lib/connections/adapters/types";
import { PROVIDERS } from "@/lib/providers/registry";
import { toastAdapter } from "@/lib/connections/adapters/toast";

const fetchSpy = vi.fn(async () => {
  throw new Error("network call attempted in a no-creds path");
});

// Env keys that gate the POS adapters — cleared so the default path is "no creds".
const POS_ENV_KEYS = [
  "TOAST_CLIENT_ID",
  "TOAST_CLIENT_SECRET",
  "CLOVER_APP_ID",
  "CLOVER_APP_SECRET",
  "CLOVER_ENV",
];
const savedEnv: Record<string, string | undefined> = {};

function ctx(overrides: Partial<AdapterSyncCtx> = {}): AdapterSyncCtx {
  return {
    orgId: "org-1",
    establishmentId: null,
    accessToken: "",
    sinceDays: 30,
    externalId: null,
    accountLabel: null,
    ...overrides,
  };
}

beforeEach(() => {
  loadProviderApp.mockReset();
  loadProviderApp.mockResolvedValue(null);
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  for (const k of POS_ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of POS_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("adapter availability — unconfigured reports {available:false}", () => {
  it("toast: no app + no env → available:false", async () => {
    expect(toastAdapter.isEnvEnabled()).toBe(false);
    const av = await toastAdapter.availability();
    expect(av.available).toBe(false);
    expect(av.reason).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clover: no app + no env → available:false", async () => {
    expect(cloverAdapter.isEnvEnabled()).toBe(false);
    const av = await cloverAdapter.availability();
    expect(av.available).toBe(false);
    expect(av.reason).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fetchRecentContacts — zero network calls without creds", () => {
  it("toast returns [] and never fetches when unconfigured", async () => {
    const out = await toastAdapter.fetchRecentContacts(
      ctx({ accessToken: "tok", externalId: "restaurant-guid" }),
    );
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clover returns [] and never fetches when unconfigured", async () => {
    const out = await cloverAdapter.fetchRecentContacts(
      ctx({ accessToken: "tok", externalId: "merchant-id" }),
    );
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("toast returns [] (no fetch) when configured but missing a restaurant GUID", async () => {
    process.env.TOAST_CLIENT_ID = "id";
    process.env.TOAST_CLIENT_SECRET = "secret";
    const out = await toastAdapter.fetchRecentContacts(ctx({ accessToken: "tok", externalId: null }));
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("clover returns [] (no fetch) when configured but missing a merchant id", async () => {
    process.env.CLOVER_APP_ID = "id";
    process.env.CLOVER_APP_SECRET = "secret";
    const out = await cloverAdapter.fetchRecentContacts(ctx({ accessToken: "tok", externalId: null }));
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("toast returns [] (no fetch) when env-configured but token is empty", async () => {
    process.env.TOAST_CLIENT_ID = "id";
    process.env.TOAST_CLIENT_SECRET = "secret";
    const out = await toastAdapter.fetchRecentContacts(
      ctx({ accessToken: "", externalId: "restaurant-guid" }),
    );
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("adapter registry — every provider resolves (no missing mapping)", () => {
  it("getAdapter resolves for every registry provider id and never returns null", () => {
    for (const id of Object.keys(PROVIDERS)) {
      const adapter = getAdapter(id);
      expect(adapter).toBeTruthy();
      expect(typeof adapter.fetchRecentContacts).toBe("function");
      expect(typeof adapter.availability).toBe("function");
    }
  });

  it("getAdapter falls back to a stable no-op for an unknown provider", () => {
    const a = getAdapter("totally_unknown_provider");
    const b = getAdapter("totally_unknown_provider");
    expect(a).toBe(b); // memoized identity
    expect(hasRealAdapter("totally_unknown_provider")).toBe(false);
    expect(a.syncs).toBeNull();
  });

  it("toast + clover are registered as real adapters", () => {
    expect(hasRealAdapter("toast")).toBe(true);
    expect(hasRealAdapter("toast_pos")).toBe(true);
    expect(hasRealAdapter("clover")).toBe(true);
    expect(hasRealAdapter("clover_pos")).toBe(true);
    expect(registeredAdapterIds()).toEqual(expect.arrayContaining(["toast", "clover"]));
  });

  it("the no-op adapter returns [] and makes no network call", async () => {
    const noop = getAdapter("totally_unknown_provider");
    const out = await noop.fetchRecentContacts(ctx({ accessToken: "tok" }));
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
