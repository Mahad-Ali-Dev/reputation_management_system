import { senderAsBusiness } from "@/lib/email/senders";
import {
  BRAND,
  ctaButton,
  emailAccentTint,
  emailFirstName,
  emailHero,
  emailHeroIcon,
  emailParagraph,
  emailShell,
  emailSmall,
  emailStarRow,
  emailTeamName,
  emailUnsubscribeLine,
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
  /** Business name shown as the sender's display name. */
  businessName?: string | null;
  /** Where a customer reply goes. See lib/email/reply-to.ts. */
  replyTo?: string | null;
}): Promise<EmailSendResult> {
  // NOTE: the fallback is a VERIFIED address, not the resend.dev sandbox. If
  // EMAIL_FROM is misconfigured (unset → fallback, or a *.resend.dev sandbox
  // address), assertSendableEmailConfig emits a loud, deduped warning so the
  // otherwise-silent sandbox delivery failure is visible in logs.
  // Shows the BUSINESS in the recipient's inbox over our verified address, e.g.
  // `Chaaye Khana <feedback@repulabs.com>`. The customer is theirs, not ours, so
  // the sender name should be the business they actually dealt with — while the
  // envelope address stays on repulabs.com, which is what's verified in Resend.
  const from = args.fromOverride ?? senderAsBusiness("outreach", args.businessName ?? null);
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

The ${args.businessName} team

To unsubscribe: ${args.unsubscribeUrl}`;

  // Rendered through the SHARED shell, branded as the BUSINESS. This email goes
  // to their customer, who has no relationship with Repulabs, so the masthead,
  // hero tint and button all carry the business's own brand.
  const biz = escapeHtml(args.businessName);
  const accent = args.accentColor ?? null;
  const first = args.reviewerName ? emailFirstName(args.reviewerName) : null;
  const html = emailShell({
    preheader: `Tap a star to tell ${args.businessName} how your visit went.`,
    title: `How was your visit to ${args.businessName}?`,
    brand: {
      name: args.businessName,
      logoUrl: args.logoUrl ?? null,
      accent,
    },
    hero: emailHero({
      visual: emailHeroIcon("hero-star.gif"),
      title: first ? `How was your visit, ${escapeHtml(first)}?` : "How was your visit?",
      sub: `Tap a star to leave ${biz} a review.`,
      tint: emailAccentTint(accent),
      extra: emailStarRow(args.reviewLink),
    }),
    body: `
      ${emailParagraph("Thanks for coming in. Your review helps other locals find us, and we read every single one.", "text-align:center;")}
      ${ctaButton({ url: args.reviewLink, label: "Leave a review", accent })}
      ${emailSmall(`Thanks,<br>${emailTeamName(args.businessName)}`, `text-align:center;color:${BRAND.ink2};`)}
    `,
    footerNote: `You're getting this because you visited ${biz}. ${emailUnsubscribeLine(args.unsubscribeUrl)}`,
  });

  return { html, text };
}
