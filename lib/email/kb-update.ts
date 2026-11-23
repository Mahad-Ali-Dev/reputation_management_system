import { SUPPORT_REPLY_TO } from "@/lib/email/reply-to";
import {
  BRAND,
  ctaButton,
  emailFrog,
  emailHero,
  emailLabel,
  emailPill,
  emailShell,
  emailSmall,
  escapeHtml,
} from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { assertSendableEmailConfig } from "@/lib/outreach/email-guard";
import { Resend } from "resend";
import { senderFor } from "./senders";

/**
 * Auto-updater email (Module 05). Sent by the weekly cron when the AI re-scans
 * an org's tracked website and detects a change it auto-applied.
 *
 * Mirrors lib/digest/actions.ts Resend usage: lazy client, EMAIL_FROM with a
 * resend.dev fallback, and a graceful NO-OP + log when RESEND_API_KEY is absent
 * (so the cron runs cleanly in dev / without email creds).
 */

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (_resend) return _resend;
  _resend = new Resend(key);
  return _resend;
}

const FIELD_LABELS: Record<string, string> = {
  overview: "business overview",
  services: "services",
  pricing: "pricing",
  locations: "locations",
  hours: "opening hours",
};

function humanizeFields(fields: string[]): string {
  const labels = fields.map((f) => FIELD_LABELS[f] ?? f);
  if (labels.length === 0) return "details";
  if (labels.length === 1) return labels[0] as string;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export async function sendKbUpdateEmail(args: {
  orgId: string;
  to: string;
  businessName: string;
  changedFields: string[];
}): Promise<{ sent: boolean; reason?: string }> {
  const resend = getResend();
  if (!resend) {
    logger.info(
      { event: "kb.update_email.skipped", orgId: args.orgId, reason: "no_resend_key" },
      "RESEND_API_KEY unset — skipping KB auto-update email (no-op)",
    );
    return { sent: false, reason: "no_resend_key" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const from = senderFor("notify");
  assertSendableEmailConfig(from);
  const fieldsPhrase = humanizeFields(args.changedFields);
  const subject = `Your AI noticed your ${fieldsPhrase} changed and updated itself`;
  const trainingUrl = `${appUrl}/ai/training`;

  const text = [
    `${args.businessName}, your AI knowledge base updated itself`,
    "",
    `Your AI re-scanned your website and noticed your ${fieldsPhrase} changed. It updated its knowledge automatically, so replies, DMs and chats stay accurate.`,
    "",
    `Review the changes: ${trainingUrl}`,
    "",
    "If this wasn't expected, open AI Training to review and adjust.",
  ].join("\n");

  const labels = args.changedFields.map((f) => FIELD_LABELS[f] ?? f);
  const count = Math.max(1, labels.length);
  const bubble = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px;"><tr>
    <td bgcolor="#ffffff" style="background:#ffffff;border-radius:18px 18px 18px 6px;padding:9px 16px;box-shadow:0 1px 2px rgba(16,24,40,.05),0 10px 28px -14px rgba(16,24,40,.22);font-size:14px;font-weight:500;color:${BRAND.ink};">I spotted ${count} change${count === 1 ? "" : "s"} on your website</td>
  </tr></table>`;
  const rows = (labels.length > 0 ? labels : ["details"])
    .map(
      (label) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr>
        <td bgcolor="${BRAND.fill}" style="background:${BRAND.fill};border-radius:14px;padding:13px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="40" style="width:40px;"><div style="width:28px;height:28px;border-radius:999px;background:${BRAND.okBg};color:${BRAND.ok};font-size:14px;font-weight:700;line-height:28px;text-align:center;">&#10003;</div></td>
            <td style="font-size:15px;font-weight:500;color:${BRAND.ink};">${escapeHtml(label.charAt(0).toUpperCase() + label.slice(1))}</td>
            <td style="text-align:right;">${emailPill("Updated", "success")}</td>
          </tr></table>
        </td>
      </tr></table>`,
    )
    .join("");

  const html = emailShell({
    preheader: `Your AI noticed your ${fieldsPhrase} changed and is already using the new details.`,
    title: "Your AI learned something new",
    hero: emailHero({
      visual: `${bubble}<div style="margin:6px 0 14px;">${emailFrog(150)}</div>`,
      title: "Your AI learned something new",
      sub: `It re-scanned the ${escapeHtml(args.businessName)} website and updated itself, so your replies, DMs and chats stay accurate.`,
    }),
    body: `
      ${emailLabel("What changed")}
      ${rows}
      ${ctaButton({ url: trainingUrl, label: "Check what your AI knows" })}
      ${emailSmall("Something wrong? Edit it in AI Training and your AI will use your version. We re-scan weekly and only update when something changes.")}
    `,
  });

  try {
    const { error } = await resend.emails.send({
      from,
      replyTo: SUPPORT_REPLY_TO,
      to: args.to,
      subject,
      html,
      text,
    });
    if (error) {
      logger.warn({ event: "kb.update_email.error", orgId: args.orgId, error: error.message });
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    logger.warn({
      event: "kb.update_email.exception",
      orgId: args.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, reason: "exception" };
  }
}
