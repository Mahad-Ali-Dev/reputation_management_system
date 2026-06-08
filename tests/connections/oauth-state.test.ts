import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OAuth state-JWT round-trip tests (Module 14 — the CSRF/tenant-fixation guard
 * every Connections callback relies on). The single-use nonce table
 * (`oAuthStateConsumed.create`) is the only DB touch — it is mocked so the JWT
 * crypto runs for real, fully offline.
 *
 * Contracts:
 *   - sign → verify round-trips the orgId/userId/provider claims
 *   - a tampered state (wrong cookie binding OR mutated token) is rejected
 *   - an expired state (past `exp`) is rejected
 *   - provider / session-user / session-org mismatches are rejected
 *   - replay (nonce already consumed → unique violation) is rejected
 */

const consumedCreate = vi.fn(async (_args?: unknown) => ({}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    oAuthStateConsumed: { create: (...a: unknown[]) => consumedCreate(...a) },
  },
}));

import { signOAuthState, verifyAndConsumeOAuthState } from "@/lib/oauth/state";

const ORG = "00000000-0000-4000-8000-0000000000a1";
const USER = "00000000-0000-4000-8000-0000000000b2";

beforeAll(() => {
  if (!process.env.OAUTH_STATE_SECRET) {
    // jose HS256 needs a >=32 char secret.
    process.env.OAUTH_STATE_SECRET = "x".repeat(48);
  }
});

beforeEach(() => {
  consumedCreate.mockReset();
  consumedCreate.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("oauth state — round-trip", () => {
  it("sign → verify returns the original claims", async () => {
    const { state, cookieHash } = await signOAuthState({
      orgId: ORG,
      userId: USER,
      provider: "clover",
    });
    const verified = await verifyAndConsumeOAuthState({
      state,
      cookieHash,
      expectedProvider: "clover",
      sessionUserId: USER,
      sessionOrgId: ORG,
    });
    expect(verified.orgId).toBe(ORG);
    expect(verified.userId).toBe(USER);
    expect(verified.provider).toBe("clover");
    expect(typeof verified.pkceVerifier).toBe("string");
    expect(consumedCreate).toHaveBeenCalledTimes(1);
  });

  it("carries a distinct nonce each sign (single-use material)", async () => {
    const a = await signOAuthState({ orgId: ORG, userId: USER, provider: "toast" });
    const b = await signOAuthState({ orgId: ORG, userId: USER, provider: "toast" });
    expect(a.state).not.toBe(b.state);
    expect(a.cookieHash).not.toBe(b.cookieHash);
  });
});

describe("oauth state — rejects tampering", () => {
  it("rejects a cookie that doesn't bind to the state", async () => {
    const { state } = await signOAuthState({ orgId: ORG, userId: USER, provider: "clover" });
    await expect(
      verifyAndConsumeOAuthState({
        state,
        cookieHash: "not-the-bound-hash",
        expectedProvider: "clover",
        sessionUserId: USER,
        sessionOrgId: ORG,
      }),
    ).rejects.toThrow(/cookie binding/);
    expect(consumedCreate).not.toHaveBeenCalled();
  });

  it("rejects a mutated state token (signature/binding break)", async () => {
    const { state, cookieHash } = await signOAuthState({
      orgId: ORG,
      userId: USER,
      provider: "clover",
    });
    // Flip a character in the JWT payload segment.
    const parts = state.split(".");
    const body = parts[1]!;
    const flipped = `${body.slice(0, -1)}${body.slice(-1) === "A" ? "B" : "A"}`;
    const tampered = `${parts[0]}.${flipped}.${parts[2]}`;
    await expect(
      verifyAndConsumeOAuthState({
        state: tampered,
        cookieHash,
        expectedProvider: "clover",
        sessionUserId: USER,
        sessionOrgId: ORG,
      }),
    ).rejects.toThrow();
    expect(consumedCreate).not.toHaveBeenCalled();
  });
});

describe("oauth state — rejects expired", () => {
  it("rejects a state past its expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { state, cookieHash } = await signOAuthState({
      orgId: ORG,
      userId: USER,
      provider: "clover",
    });
    // TTL is 600s; jump 11 minutes ahead so `exp` is in the past.
    vi.setSystemTime(new Date("2026-01-01T00:11:00Z"));
    await expect(
      verifyAndConsumeOAuthState({
        state,
        cookieHash,
        expectedProvider: "clover",
        sessionUserId: USER,
        sessionOrgId: ORG,
      }),
    ).rejects.toThrow();
    expect(consumedCreate).not.toHaveBeenCalled();
  });
});

describe("oauth state — rejects mismatches", () => {
  it("rejects a provider mismatch", async () => {
    const { state, cookieHash } = await signOAuthState({
      orgId: ORG,
      userId: USER,
      provider: "clover",
    });
    await expect(
      verifyAndConsumeOAuthState({
        state,
        cookieHash,
        expectedProvider: "toast",
        sessionUserId: USER,
        sessionOrgId: ORG,
      }),
    ).rejects.toThrow(/provider mismatch/);
    expect(consumedCreate).not.toHaveBeenCalled();
  });

  it("rejects a session-user mismatch (tenant fixation defense)", async () => {
    const { state, cookieHash } = await signOAuthState({
      orgId: ORG,
      userId: USER,
      provider: "toast",
    });
    await expect(
      verifyAndConsumeOAuthState({
        state,
        cookieHash,
        expectedProvider: "toast",
        sessionUserId: "00000000-0000-4000-8000-0000000000ff",
        sessionOrgId: ORG,
      }),
    ).rejects.toThrow(/session user mismatch/);
    expect(consumedCreate).not.toHaveBeenCalled();
  });

  it("rejects a session-org mismatch (token would land on the wrong tenant)", async () => {
    const { state, cookieHash } = await signOAuthState({
      orgId: ORG,
      userId: USER,
      provider: "toast",
    });
    await expect(
      verifyAndConsumeOAuthState({
        state,
        cookieHash,
        expectedProvider: "toast",
        sessionUserId: USER,
        sessionOrgId: "00000000-0000-4000-8000-0000000000ee",
      }),
    ).rejects.toThrow(/session org mismatch/);
    expect(consumedCreate).not.toHaveBeenCalled();
  });
});

describe("oauth state — rejects replay", () => {
  it("rejects when the nonce was already consumed (unique violation)", async () => {
    const { state, cookieHash } = await signOAuthState({
      orgId: ORG,
      userId: USER,
      provider: "clover",
    });
    // Simulate the DB unique-violation on the second consume.
    consumedCreate.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), { code: "P2002" }),
    );
    await expect(
      verifyAndConsumeOAuthState({
        state,
        cookieHash,
        expectedProvider: "clover",
        sessionUserId: USER,
        sessionOrgId: ORG,
      }),
    ).rejects.toThrow(/replay|nonce/);
  });
});
