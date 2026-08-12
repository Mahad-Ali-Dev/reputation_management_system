import { SUPPORT_REPLY_TO } from "@/lib/email/reply-to";
import { logger } from "@/lib/logger";
import { assertSendableEmailConfig } from "@/lib/outreach/email-guard";
import { Resend } from "resend";
import { teamInviteEmail } from "./templates";

/**
 * Sends the team-invitation email.
 *
 * `inviteTeammate` used to create the invitation row and only LOG the accept
 * URL ("share it with the invitee manually") — so from the owner's side the
 * invite button appeared to do nothing and the invitee never heard anything.
 * The `teamInviteEmail` template already existed; it was simply never wired to
 * a sender. This is that seam.
 *
 * Mirrors lib/email/kb-update.ts: lazy client, EMAIL_FROM with a fallback,
 * deliverability guard, and a graceful no-op + loud log when RESEND_API_KEY is
 * absent. NEVER throws — a mail failure must not roll back an invitation that
 * was already created (the accept URL still works if shared manually).
 */

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

export async function sendTeamInviteEmail(args: {
  to: string;
  inviterName: string;
  orgName: string;
  acceptUrl: string;
  orgId: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const from = process.env.EMAIL_FROM ?? "notifications@repulabs.com";
  // Loudly surfaces a missing key or a *.resend.dev sandbox `from` (which Resend
  // accepts but only delivers to the account owner — the classic "no error, no
  // email" case).
  assertSendableEmailConfig(from);

  const resend = getResend();
  if (!resend) {
    logger.warn(
      { event: "team.invite_email.skipped", orgId: args.orgId, acceptUrl: args.acceptUrl },
      "RESEND_API_KEY unset — invitation email NOT sent. Share the accept URL manually.",
    );
    return { sent: false, reason: "no_api_key" };
  }

  const { html, text } = teamInviteEmail({
    inviterName: args.inviterName,
    orgName: args.orgName,
    acceptUrl: args.acceptUrl,
  });

  try {
    const { error } = await resend.emails.send({
      from,
      replyTo: SUPPORT_REPLY_TO,
      to: args.to,
      subject: `${args.inviterName} invited you to ${args.orgName} on Repulabs`,
      html,
      text,
    });
    if (error) {
      logger.error(
        { event: "team.invite_email.error", orgId: args.orgId, error: error.message },
        "invitation email rejected by Resend",
      );
      return { sent: false, reason: error.message };
    }
    logger.info({ event: "team.invite_email.sent", orgId: args.orgId }, "invitation email sent");
    return { sent: true };
  } catch (err) {
    logger.error(
      {
        event: "team.invite_email.exception",
        orgId: args.orgId,
        error: err instanceof Error ? err.message : String(err),
      },
      "invitation email threw",
    );
    return { sent: false, reason: "exception" };
  }
}
