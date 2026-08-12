import { Resend } from "resend";
import { assertSendableEmailConfig } from "./email-guard";

/**
 * Resend email sender for review requests.
 *
 * Mandatory: every transactional email includes a `List-Unsubscribe` header (RFC 8058)
 * + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` for Gmail's one-click unsubscribe.
 *
 * Inbound webhooks → /api/webhooks/resend (events: bounced, complained, delivered, opened, clicked).
 */

let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // LOUD warning so the silent failure shows up in logs, then throw as before.
    assertSendableEmailConfig(process.env.EMAIL_FROM);
    throw new Error("RESEND_API_KEY not set");
  }
  _resend = new Resend(key);
  return _resend;
}

export type EmailSendResult = { ok: true; messageId: string } | { ok: false; error: string };

export async function sendReviewRequestEmail(args: {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  unsubscribeUrl: string;
  fromOverride?: string;
  /** Where a customer reply goes. See lib/email/reply-to.ts. */
  replyTo?: string | null;
}): Promise<EmailSendResult> {
  // NOTE: the fallback is a VERIFIED address, not the resend.dev sandbox. If
  // EMAIL_FROM is misconfigured (unset → fallback, or a *.resend.dev sandbox
  // address), assertSendableEmailConfig emits a loud, deduped warning so the
  // otherwise-silent sandbox delivery failure is visible in logs.
  const from = args.fromOverride ?? process.env.EMAIL_FROM ?? "notifications@repulabs.com";
  assertSendableEmailConfig(from);

  try {
    const { data, error } = await getResend().emails.send({
      from,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      to: args.to,
      subject: args.subject,
      text: args.bodyText,
      html: args.bodyHtml,
      headers: {
        "List-Unsubscribe": `<${args.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.id) return { ok: false, error: "resend_no_id" };
    return { ok: true, messageId: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Build the standard review-request email HTML. Tenant can override the template
 * later via `review_request_templates`.
 */
export function defaultReviewRequestHtml(args: {
  reviewerName: string | null;
  businessName: string;
  reviewLink: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const name = args.reviewerName ?? "there";
  const text = `Hi ${name},

Thanks for choosing ${args.businessName}! If you have a moment, we'd love your honest feedback on Google:

${args.reviewLink}

Your review helps us improve and helps other locals find us. Thank you!

— The ${args.businessName} team

To unsubscribe: ${args.unsubscribeUrl}`;

  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:24px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e2e8f0;">
      <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Hi ${escapeHtml(name)},</h1>
      <p style="color:#475569;">Thanks for choosing <strong>${escapeHtml(args.businessName)}</strong>! If you have a moment, we'd love your honest feedback on Google.</p>
      <p style="margin:24px 0;">
        <a href="${args.reviewLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Leave a review →</a>
      </p>
      <p style="color:#94a3b8;font-size:13px;">Your review helps us improve and helps other locals find us. Thank you!</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <p style="color:#94a3b8;font-size:12px;">
        Don't want these emails?
        <a href="${args.unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a>
      </p>
    </div>
  </body>
</html>`;

  return { html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
