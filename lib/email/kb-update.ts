import { Resend } from "resend";
import { logger } from "@/lib/logger";

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const fieldsPhrase = humanizeFields(args.changedFields);
  const subject = `Your AI noticed your ${fieldsPhrase} changed and updated itself`;
  const trainingUrl = `${appUrl}/ai/training`;

  const text = [
    `${args.businessName} — your AI knowledge base updated itself`,
    "",
    `Your AI re-scanned your website and noticed your ${fieldsPhrase} changed. It updated its knowledge automatically, so replies, DMs and chats stay accurate.`,
    "",
    `Review the changes: ${trainingUrl}`,
    "",
    "If this wasn't expected, open AI Training to review and adjust.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:24px;margin:0;">
<div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e2e8f0;">
  <h1 style="margin:0 0 4px;font-size:20px;color:#0f172a;">Your AI updated itself</h1>
  <p style="margin:0 0 20px;color:#94a3b8;font-size:13px;">${escapeHtml(args.businessName)}</p>
  <p style="margin:0 0 16px;color:#0f172a;font-size:14px;line-height:1.6;">
    Your AI re-scanned your website and noticed your <strong>${escapeHtml(fieldsPhrase)}</strong> changed.
    It refreshed its knowledge automatically, so your replies, DMs and chats stay accurate.
  </p>
  <p style="margin:24px 0 0;">
    <a href="${trainingUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Review the changes →</a>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="color:#94a3b8;font-size:12px;margin:0;">
    The AI re-scans your tracked site weekly and only updates when something changes.
  </p>
</div>
</body></html>`;

  try {
    const { error } = await resend.emails.send({ from, to: args.to, subject, html, text });
    if (error) {
      logger.warn(
        { event: "kb.update_email.error", orgId: args.orgId, error: error.message },
      );
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (err) {
    logger.warn(
      { event: "kb.update_email.exception", orgId: args.orgId, error: err instanceof Error ? err.message : String(err) },
    );
    return { sent: false, reason: "exception" };
  }
}
