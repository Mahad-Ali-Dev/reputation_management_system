import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provider-CHECK fail-soft tests (Module 14). The Toast/Clover/Square callbacks
 * write `Connection.provider` values that the stale `connections_provider_chk`
 * CHECK rejects until the founder runs the widening migration. `saveConnectionSoft`
 * MUST turn those known "not migrated" errors into a graceful
 * `{ ok:false, notConfigured:true }` (the callback redirects to
 * `?error=<provider>_not_configured`) instead of 500-ing — while genuine bugs
 * still re-throw.
 *
 * The known soft codes: 23514 (check_violation), 42703 (undefined_column),
 * 42P01 (undefined_table).
 */

const saveConnection = vi.fn(async (_args?: unknown) => ({ id: "conn-1" }));
vi.mock("@/lib/connections/oauth-helpers", () => ({
  saveConnection: (...a: unknown[]) => saveConnection(...a),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import {
  isProviderConstraintError,
  saveConnectionSoft,
} from "@/lib/connections/adapters/route-helpers";

const ARGS = {
  orgId: "org-1",
  provider: "clover",
  accountLabel: "Clover merchant",
  externalId: "merchant-1",
  accessToken: "tok",
  refreshToken: "ref",
  scopes: ["read:customers"],
};

function pgError(code: string): Error {
  return Object.assign(new Error(`pg error ${code}`), { code });
}

beforeEach(() => {
  saveConnection.mockReset();
  saveConnection.mockResolvedValue({ id: "conn-1" });
});

describe("isProviderConstraintError", () => {
  it("recognizes the stale-CHECK + unmigrated codes", () => {
    expect(isProviderConstraintError(pgError("23514"))).toBe(true);
    expect(isProviderConstraintError(pgError("42703"))).toBe(true);
    expect(isProviderConstraintError(pgError("42P01"))).toBe(true);
  });

  it("does not treat other errors as a provider constraint", () => {
    expect(isProviderConstraintError(pgError("23505"))).toBe(false); // unique violation
    expect(isProviderConstraintError(new Error("boom"))).toBe(false);
    expect(isProviderConstraintError(null)).toBe(false);
    expect(isProviderConstraintError(undefined)).toBe(false);
  });
});

describe("saveConnectionSoft — success", () => {
  it("returns ok with the new id when the save succeeds", async () => {
    const res = await saveConnectionSoft(ARGS);
    expect(res).toEqual({ ok: true, id: "conn-1" });
    expect(saveConnection).toHaveBeenCalledTimes(1);
  });
});

describe("saveConnectionSoft — fail-soft on the stale provider CHECK", () => {
  it("returns notConfigured (no throw) on 23514 check_violation", async () => {
    saveConnection.mockRejectedValue(pgError("23514"));
    const res = await saveConnectionSoft(ARGS);
    expect(res).toEqual({ ok: false, notConfigured: true });
  });

  it("returns notConfigured on 42703 undefined_column", async () => {
    saveConnection.mockRejectedValue(pgError("42703"));
    const res = await saveConnectionSoft(ARGS);
    expect(res).toEqual({ ok: false, notConfigured: true });
  });

  it("returns notConfigured on 42P01 undefined_table", async () => {
    saveConnection.mockRejectedValue(pgError("42P01"));
    const res = await saveConnectionSoft(ARGS);
    expect(res).toEqual({ ok: false, notConfigured: true });
  });
});

describe("saveConnectionSoft — re-throws genuine errors", () => {
  it("re-throws a non-constraint error (real bug surfaces)", async () => {
    saveConnection.mockRejectedValue(pgError("23505"));
    await expect(saveConnectionSoft(ARGS)).rejects.toThrow(/23505/);
  });

  it("re-throws an error with no pg code", async () => {
    saveConnection.mockRejectedValue(new Error("unexpected"));
    await expect(saveConnectionSoft(ARGS)).rejects.toThrow(/unexpected/);
  });
});
