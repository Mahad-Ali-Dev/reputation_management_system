import {
  ctaButton,
  emailHeading,
  emailParagraph,
  emailShell,
  escapeHtml,
} from "@/lib/email/templates";
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
  /** Org's brand primary color (Settings → Brand), CTA button background.
   *  Falls back to the platform blue when the org hasn't set one. */
  accentColor?: string;
  /** Org logo, shown in the masthead in place of a lettermark. */
  logoUrl?: string | null;
}): { html: string; text: string } {
  const name = args.reviewerName ?? "there";
  const text = `Hi ${name},

Thanks for choosing ${args.businessName}! If you have a moment, we'd love your honest feedback on Google:

${args.reviewLink}

Your review helps us improve and helps other locals find us. Thank you!

— The ${args.businessName} team

To unsubscribe: ${args.unsubscribeUrl}`;

  // Rendered through the SHARED shell, branded as the BUSINESS. This email goes
  // to their customer, who has no relationship with Repulabs — our masthead on
  // it reads as a third party asking for a review, which is both confusing and a
  // worse conversion story. The old hand-rolled markup also skipped the
  // preheader and the Outlook-safe button the shell provides.
  const html = emailShell({
    preheader: `Share your experience with ${args.businessName}`,
    title: `How was your experience at ${args.businessName}?`,
    brand: {
      name: args.businessName,
      logoUrl: args.logoUrl ?? null,
      accent: args.accentColor ?? null,
    },
    body: `
      ${emailHeading(`Hi ${name},`)}
      ${emailParagraph(`Thanks for choosing <strong>${escapeHtml(args.businessName)}</strong>! If you have a moment, we'd love your honest feedback on Google.`)}
      <div style="margin:26px 0;">${ctaButton({ url: args.reviewLink, label: "Leave a review", accent: args.accentColor ?? null })}</div>
      ${emailParagraph("Your review helps us improve — and helps other locals find us. Thank you!")}
    `,
    footerNote: `Don't want these emails? <a href="${args.unsubscribeUrl}" style="color:inherit;text-decoration:underline;">Unsubscribe</a>`,
  });

  return { html, text };
}
