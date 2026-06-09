/**
 * Pure invitation-acceptance decision logic, extracted so it can be unit-tested
 * without a database or an auth session. Both the read-only `lookupInvite` and
 * the consuming `acceptInvite` server action (lib/account/actions.ts) funnel
 * their validation through `evaluateInvite`, so the accept/reject rules are
 * defined in exactly one place.
 */

export type InviteRejectReason = "not_found" | "expired" | "used" | "wrong_email";

export type InviteEvaluation =
  | { ok: true }
  | { ok: false; reason: InviteRejectReason };

/** Minimal shape of an invitation row needed to decide acceptance. */
export interface InviteCandidate {
  email: string;
  expiresAt: Date;
  acceptedAt: Date | null;
}

/**
 * Decide whether `invite` can be accepted by the signed-in user.
 *
 * Order matters: a missing invite is reported before anything else, then
 * single-use (already accepted), then expiry, then the email-match gate. The
 * email comparison is case-insensitive so it's independent of DB collation.
 *
 * @param invite        the looked-up invitation row, or null if none matched the token
 * @param sessionEmail  the authenticated user's email (or null/undefined if unauthenticated)
 * @param now           current time (injectable for tests)
 */
export function evaluateInvite(
  invite: InviteCandidate | null | undefined,
  sessionEmail: string | null | undefined,
  now: Date = new Date(),
): InviteEvaluation {
  if (!invite) return { ok: false, reason: "not_found" };
  if (invite.acceptedAt) return { ok: false, reason: "used" };
  if (invite.expiresAt.getTime() < now.getTime()) return { ok: false, reason: "expired" };

  const inviteEmail = invite.email.trim().toLowerCase();
  const userEmail = (sessionEmail ?? "").trim().toLowerCase();
  if (!userEmail || inviteEmail !== userEmail) {
    return { ok: false, reason: "wrong_email" };
  }
  return { ok: true };
}
