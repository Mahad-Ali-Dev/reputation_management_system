/**
 * Autopilot weekly digest (Module 15 — Differentiators).
 *
 * "repulabs runs the loop — then sends a weekly digest of everything it did and
 *  the few things that need a human." A sibling of `lib/digest/actions.ts` (the
 * daily review digest): it REUSES that file's proven machinery shape — Resend
 * send, one-click `List-Unsubscribe`, and a race-safe claim for idempotency —
 * but is its own builder, never a fork of the daily digest.
 *
 * Flow:
 *   buildAutopilotDigest(orgId, weekStart)
 *     → null when Autopilot is disabled OR nothing happened (nothing to send)
 *     → { whatIDid (from the action ledger), needsYou (the requiresHuman queue),
 *         roiHeadline (one-liner), intro (optional AI), recipients }
 *   sendAutopilotDigestForOrg(orgId, weekStart)
 *     → claims an AutopilotDigestRun row (skip if already claimed), renders +
 *       sends to owner/admin members (honoring unsubscribes), records the run.
 *
 * The optional natural-language intro goes through `runAiAssist({ purpose:
 * "ai_autopilot" })`. With no `ANTHROPIC_API_KEY` (or not entitled) we DO NOT
 * call it — a deterministic intro is used so the build + tests stay green and
 * no paid call fires in a default path.
 */

import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { SUPPORT_REPLY_TO } from "@/lib/email/reply-to";
import { senderFor } from "@/lib/email/senders";
import { ctaButton, emailHeading, emailParagraph, emailShell } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import { assertSendableEmailConfig } from "@/lib/outreach/email-guard";
import { type RoiHeadline, getRoiHeadline } from "@/lib/roi/summary";
import { getUnsubscribeSecret } from "@/lib/secrets";
import { Resend } from "resend";
import { listAutopilotActions, summarizeAutopilotActions } from "./ledger";
import { getAutopilotConfig } from "./queries";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
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

function oneClickUnsubscribeUrl(orgId: string, email: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const secret = getUnsubscribeSecret();
  const payload = `${orgId}|${email.toLowerCase()}|email`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${appUrl}/u?org=${encodeURIComponent(orgId)}&e=${encodeURIComponent(email)}&c=email&s=${sig}`;
}

/** Human label for each loop, used in the "what I did" list. */
const LOOP_LABELS: Record<string, string> = {
  auto_reply: "Replied to reviews",
  low_star_draft: "Drafted low-star replies",
  review_request: "Sent review requests",
  voice_review: "Turned calls into review requests",
  dispute: "Drafted review disputes",
  geo_post: "Published geo posts",
  inbox_reply: "Replied in the inbox",
  escalation: "Escalated to you",
};

export type AutopilotDigest = {
  orgId: string;
  orgName: string;
  weekStart: string;
  /** Deterministic or AI-generated one-paragraph intro. */
  intro: string;
  /** "What I did" — label + count, biggest first. */
  whatIDid: { label: string; count: number }[];
  /** Total actions in the week. */
  totalActions: number;
  /** "What needs you" — short descriptions of the escalation/draft queue. */
  needsYou: { label: string; detail: string | null }[];
  needsYouCount: number;
  roi: RoiHeadline;
  recipients: { email: string; name: string | null }[];
};

/**
 * Build the digest for one org + week. Returns null when there is nothing to
 * send (Autopilot disabled, or no actions AND nothing in the needs-you queue).
 */
export async function buildAutopilotDigest(
  orgId: string,
  weekStart: Date,
): Promise<AutopilotDigest | null> {
  const config = await getAutopilotConfig(orgId);
  // Only orgs that have Autopilot on AND the weekly digest enabled get one.
  if (!config.enabled || !config.weeklyDigestEnabled) return null;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) return null;

  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [summary, needsRows, roi, recipients] = await Promise.all([
    summarizeAutopilotActions(orgId, weekStart),
    listAutopilotActions(orgId, { since: weekStart, requiresHuman: true, limit: 25 }),
    getRoiHeadline(orgId, { start: weekStart, end: weekEnd }),
    loadRecipients(orgId),
  ]);

  // Nothing happened and nothing waiting → don't email.
  if (summary.total === 0 && needsRows.length === 0) return null;

  const whatIDid = Object.entries(summary.byLoop)
    .map(([loop, count]) => ({ label: LOOP_LABELS[loop] ?? loop, count }))
    .sort((a, b) => b.count - a.count);

  const needsYou = needsRows.map((r) => ({
    label: LOOP_LABELS[r.loop] ?? r.loop,
    detail: describeDetail(r.detail),
  }));

  const intro = await buildIntro(orgId, {
    orgName: org.name,
    totalActions: summary.total,
    needsYouCount: needsRows.length,
    estimatedRevenue: roi.estimatedRevenue,
    currency: roi.currency,
  });

  return {
    orgId: org.id,
    orgName: org.name,
    weekStart: weekStart.toISOString(),
    intro,
    whatIDid,
    totalActions: summary.total,
    needsYou,
    needsYouCount: needsRows.length,
    roi,
    recipients,
  };
}

/** Owner+admin members who haven't unsubscribed from email. */
async function loadRecipients(orgId: string): Promise<{ email: string; name: string | null }[]> {
  const members = await prisma.membership.findMany({
    where: { organizationId: orgId, role: { in: ["owner", "admin"] } },
    select: { user: { select: { email: true, name: true } } },
  });
  const emails = members.map((m) => m.user?.email).filter((e): e is string => !!e);
  if (emails.length === 0) return [];
  const unsubs = await prisma.unsubscribe.findMany({
    where: {
      organizationId: orgId,
      channel: "email",
      emailOrPhone: { in: emails.map((e) => e.toLowerCase()) },
    },
    select: { emailOrPhone: true },
  });
  const unsubSet = new Set(unsubs.map((u) => u.emailOrPhone));
  return members.flatMap((m) => {
    const email = m.user?.email;
    if (!email || unsubSet.has(email.toLowerCase())) return [];
    return [{ email, name: m.user?.name ?? null }];
  });
}

/** Compact one-line description of an action's JSON detail (best-effort). */
function describeDetail(detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  if (typeof d.summary === "string") return d.summary;
  if (typeof d.reviewId === "string") return "Review awaiting your reply";
  if (typeof d.callId === "string") return "From a phone call";
  return null;
}

/**
 * Optional AI intro via `runAiAssist`. Deterministic fallback when there's no
 * `ANTHROPIC_API_KEY` (or any failure) — so no paid call fires by default and
 * the digest always has copy.
 */
async function buildIntro(
  orgId: string,
  facts: {
    orgName: string;
    totalActions: number;
    needsYouCount: number;
    estimatedRevenue: number;
    currency: string;
  },
): Promise<string> {
  const deterministic = deterministicIntro(facts);
  if (!process.env.ANTHROPIC_API_KEY) return deterministic;

  try {
    const { runAiAssist } = await import("@/lib/ai/assist");
    const result = await runAiAssist({
      orgId,
      purpose: "ai_autopilot",
      skipKb: true,
      optionCount: 1,
      query:
        `Write a friendly one-sentence intro for a weekly "Reputation Autopilot" digest email for ${facts.orgName}. ` +
        `This week Autopilot took ${facts.totalActions} actions, ${facts.needsYouCount} items need a human, ` +
        `and it drove an estimated ${facts.currency} ${facts.estimatedRevenue} in booked revenue. ` +
        `Be concrete and warm; no emojis; one sentence.`,
    });
    const text = result.options.find((o) => !o.blocked)?.text?.trim();
    return text && text.length > 0 ? text : deterministic;
  } catch (err) {
    logger.warn(
      {
        orgId,
        event: "autopilot.digest.intro_fallback",
        error: err instanceof Error ? err.message : String(err),
      },
      "AI intro failed — using deterministic intro",
    );
    return deterministic;
  }
}

function deterministicIntro(facts: {
  orgName: string;
  totalActions: number;
  needsYouCount: number;
  estimatedRevenue: number;
  currency: string;
}): string {
  const actions = `${facts.totalActions} action${facts.totalActions === 1 ? "" : "s"}`;
  const needs =
    facts.needsYouCount > 0
      ? ` and flagged ${facts.needsYouCount} item${facts.needsYouCount === 1 ? "" : "s"} that need you`
      : "";
  return `This week, Reputation Autopilot ran ${actions} for ${facts.orgName}${needs}.`;
}

export function renderAutopilotDigestEmail(
  digest: AutopilotDigest,
  recipientEmail: string,
): { subject: string; html: string; text: string; unsubscribeUrl: string } {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const unsubscribeUrl = oneClickUnsubscribeUrl(digest.orgId, recipientEmail);

  const subject =
    digest.needsYouCount > 0
      ? `${digest.orgName}: Autopilot did ${digest.totalActions} things — ${digest.needsYouCount} need you`
      : `${digest.orgName}: Autopilot ran ${digest.totalActions} actions this week`;

  // Plain text
  const lines: string[] = [digest.intro, ""];
  if (digest.whatIDid.length > 0) {
    lines.push("What Autopilot did:");
    for (const w of digest.whatIDid) lines.push(`  • ${w.label}: ${w.count}`);
    lines.push("");
  }
  lines.push(
    `Estimated booked revenue: ${digest.roi.currency} ${digest.roi.estimatedRevenue}` +
      (digest.roi.topDriver !== "—" ? ` (top driver: ${digest.roi.topDriver})` : "") +
      " — estimated.",
  );
  lines.push("");
  if (digest.needsYou.length > 0) {
    lines.push("Needs you:");
    for (const n of digest.needsYou)
      lines.push(`  • ${n.label}${n.detail ? ` — ${n.detail}` : ""}`);
    lines.push("");
  }
  lines.push(`Open Autopilot: ${appUrl}/autopilot`);
  lines.push("");
  lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  const text = lines.join("\n");

  // HTML
  const didRows = digest.whatIDid
    .map(
      (w) =>
        `<tr><td style="padding:4px 8px;color:#475569;">${escapeHtml(w.label)}</td><td style="padding:4px 8px;color:#0f172a;font-weight:600;text-align:right;">${w.count}</td></tr>`,
    )
    .join("");
  const needsRows = digest.needsYou
    .map(
      (n) =>
        `<li style="margin:4px 0;color:#0f172a;font-size:13px;">${escapeHtml(n.label)}${n.detail ? ` — <span style="color:#64748b;">${escapeHtml(n.detail)}</span>` : ""}</li>`,
    )
    .join("");

  const html = emailShell({
    preheader: digest.intro.slice(0, 120),
    title: `${digest.orgName} — Autopilot this week`,
    body: `
      <div style="font-size:11px;color:#2563eb;text-transform:uppercase;letter-spacing:0.06em;font-weight:700;">Reputation Autopilot</div>
      ${emailHeading(`${digest.orgName} — this week`)}
      ${emailParagraph(escapeHtml(digest.intro))}
      ${
        didRows
          ? `<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">What Autopilot did</div>
             <table role="presentation" style="border-collapse:collapse;width:100%;margin:0 0 18px;">${didRows}</table>`
          : ""
      }
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px;background:#eff6ff;border-left:3px solid #2563eb;border-radius:6px;">
        <tr><td style="padding:12px 16px;">
          <div style="font-size:11px;color:#1d4ed8;text-transform:uppercase;font-weight:600;letter-spacing:0.04em;">Estimated booked revenue</div>
          <div style="font-size:24px;font-weight:700;color:#0b0d0e;margin-top:2px;">${escapeHtml(digest.roi.currency)} ${digest.roi.estimatedRevenue.toLocaleString()}</div>
          <div style="color:#64748b;font-size:12px;margin-top:2px;">${digest.roi.topDriver !== "—" ? `Top driver: ${escapeHtml(digest.roi.topDriver)} · ` : ""}Estimated, not booked.</div>
        </td></tr>
      </table>
      ${
        needsRows
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:6px;">
              <tr><td style="padding:12px 16px;">
                <div style="font-size:11px;color:#b45309;text-transform:uppercase;font-weight:600;letter-spacing:0.04em;margin-bottom:4px;">Needs you (${digest.needsYouCount})</div>
                <ul style="margin:0;padding-left:18px;color:#0b0d0e;font-size:14px;line-height:1.6;">${needsRows}</ul>
              </td></tr>
            </table>`
          : ""
      }
      <div style="margin:26px 0 0;">${ctaButton({ url: `${appUrl}/autopilot`, label: "Open Autopilot" })}</div>
    `,
    footerNote: `Don't want these? <a href="${unsubscribeUrl}" style="color:inherit;text-decoration:underline;">Unsubscribe with one click</a>.`,
  });

  return { subject, html, text, unsubscribeUrl };
}

/**
 * Send the weekly digest for one org. Idempotent via an AutopilotDigestRun claim
 * on (organizationId, weekStart): the unique constraint makes a second concurrent
 * run (QStash retry) skip cleanly. Returns counts the cron aggregates.
 */
export async function sendAutopilotDigestForOrg(
  orgId: string,
  weekStart: Date,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const weekStartDate = startOfUtcDay(weekStart);

  // Claim the run (idempotency). Fail-soft on a missing table — without the run
  // table we just skip (the founder hasn't applied the migration yet).
  let runId: string;
  try {
    const run = await prisma.autopilotDigestRun.create({
      data: { organizationId: orgId, weekStart: weekStartDate },
      select: { id: true },
    });
    runId = run.id;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") {
      logger.info(
        {
          orgId,
          weekStart: weekStartDate.toISOString(),
          event: "autopilot.digest.skip.already_sent",
        },
        "autopilot digest already sent for this org/week",
      );
      return { sent: 0, skipped: 1, errors: [] };
    }
    if (isMissingRelation(err)) {
      logger.warn(
        { orgId, event: "autopilot.digest.table_not_ready" },
        "autopilot_digest_runs not migrated — skipping",
      );
      return { sent: 0, skipped: 1, errors: [] };
    }
    throw err;
  }

  const digest = await buildAutopilotDigest(orgId, weekStartDate);
  if (!digest || digest.recipients.length === 0) {
    await prisma.autopilotDigestRun.update({
      where: { id: runId },
      data: { completedAt: new Date(), recipientsSent: 0, recipientsFailed: 0 },
    });
    return { sent: 0, skipped: 1, errors: [] };
  }

  const from = senderFor("notify");
  assertSendableEmailConfig(from);
  let sent = 0;
  const errors: string[] = [];

  for (const r of digest.recipients) {
    const { subject, html, text, unsubscribeUrl } = renderAutopilotDigestEmail(digest, r.email);
    try {
      const { error } = await getResend().emails.send({
        from,
        replyTo: SUPPORT_REPLY_TO,
        to: r.email,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      if (error) errors.push(`${r.email}: ${error.message}`);
      else sent++;
    } catch (err) {
      errors.push(`${r.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await prisma.autopilotDigestRun.update({
    where: { id: runId },
    data: {
      completedAt: new Date(),
      recipientsSent: sent,
      recipientsFailed: errors.length,
      errorSummary: errors.length > 0 ? errors.slice(0, 5).join("; ").slice(0, 1000) : null,
    },
  });

  logger.info(
    { orgId, sent, errors: errors.length, runId, event: "autopilot.digest.sent" },
    "Autopilot weekly digest dispatched",
  );
  return { sent, skipped: digest.recipients.length - sent, errors };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}
