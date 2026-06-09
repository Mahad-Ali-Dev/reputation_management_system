import { describe, expect, it } from "vitest";
import { evaluateInvite, type InviteCandidate } from "@/lib/account/invite-validation";

/**
 * Acceptance-rule tests for the /accept-invite flow (lib/account/invite-validation).
 *
 * These pin the security-critical reject paths the audit flagged:
 *   - a consumed (acceptedAt set) invite cannot be re-accepted ("used")
 *   - an expired invite is rejected ("expired")
 *   - an invite whose email != the signed-in user is rejected ("wrong_email")
 *   - a missing token / null row is "not_found"
 *   - the email match is case- and whitespace-insensitive
 *   - the happy path returns ok
 */

const NOW = new Date("2026-06-09T12:00:00.000Z");
const FUTURE = new Date("2026-06-20T12:00:00.000Z");
const PAST = new Date("2026-06-01T12:00:00.000Z");

function invite(over: Partial<InviteCandidate> = {}): InviteCandidate {
  return {
    email: "invitee@example.com",
    expiresAt: FUTURE,
    acceptedAt: null,
    ...over,
  };
}

describe("evaluateInvite", () => {
  it("accepts a valid, unexpired, unconsumed invite for the matching user", () => {
    expect(evaluateInvite(invite(), "invitee@example.com", NOW)).toEqual({ ok: true });
  });

  it("rejects a missing invite as not_found", () => {
    expect(evaluateInvite(null, "invitee@example.com", NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(evaluateInvite(undefined, "invitee@example.com", NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("rejects an already-consumed invite as used", () => {
    const consumed = invite({ acceptedAt: new Date("2026-06-08T00:00:00.000Z") });
    expect(evaluateInvite(consumed, "invitee@example.com", NOW)).toEqual({
      ok: false,
      reason: "used",
    });
  });

  it("rejects an expired invite as expired", () => {
    const expired = invite({ expiresAt: PAST });
    expect(evaluateInvite(expired, "invitee@example.com", NOW)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects when the signed-in email differs from the invited email", () => {
    expect(evaluateInvite(invite(), "someone-else@example.com", NOW)).toEqual({
      ok: false,
      reason: "wrong_email",
    });
  });

  it("rejects when there is no signed-in email", () => {
    expect(evaluateInvite(invite(), null, NOW).ok).toBe(false);
    expect(evaluateInvite(invite(), "", NOW)).toEqual({ ok: false, reason: "wrong_email" });
  });

  it("matches email case- and whitespace-insensitively", () => {
    expect(evaluateInvite(invite({ email: "Invitee@Example.com" }), "  invitee@example.com ", NOW)).toEqual({
      ok: true,
    });
  });

  it("checks single-use before expiry (a consumed-and-expired invite reads as used)", () => {
    const both = invite({ acceptedAt: PAST, expiresAt: PAST });
    expect(evaluateInvite(both, "invitee@example.com", NOW)).toEqual({
      ok: false,
      reason: "used",
    });
  });
});
