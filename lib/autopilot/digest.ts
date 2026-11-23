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
import {
  BRAND,
  ctaButton,
  emailActivityRows,
  emailBarRows,
  emailFrog,
  emailIconChip,
  emailLabel,
  emailParagraph,
  emailPill,
  emailShell,
} from "@/lib/email/templates";
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

/** Email icon (public/assets/repulabs/email) for each Autopilot loop. */
const LOOP_ICONS: Record<string, string> = {
  auto_reply: "icon-auto-reply.png",
  low_star_draft: "icon-draft-replies.png",
  review_request: "icon-send.png",
  voice_review: "icon-voice.png",
  dispute: "icon-dispute.png",
  geo_post: "icon-geo.png",
  inbox_reply: "icon-draft-replies.png",
  escalation: "icon-escalation.png",
};
const loopIcon = (loop: string) => LOOP_ICONS[loop] ?? "icon-auto-reply.png";

/** "£4,820"; falls back to "GBP 4,820" for an unknown currency code. */
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-GB")}`;
  }
}

/** "16 to 22 November" for the week starting `iso`. */
function weekRange(iso: string): string {
  const start = new Date(iso);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" });
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return month(start) === month(end)
    ? `${day(start)} to ${day(end)} ${month(end)}`
    : `${day(start)} ${month(start)} to ${day(end)} ${month(end)}`;
}

export type AutopilotDigest = {
  orgId: string;
  orgName: string;
  weekStart: string;
  /** Deterministic or AI-generated one-paragraph intro. */
  intro: string;
  /** "What I did" — label + count, biggest first. `loop` picks the email icon. */
  whatIDid: { loop: string; label: string; count: number }[];
  /** Total actions in the week. */
  totalActions: number;
  /** "What needs you" — short descriptions of the escalation/draft queue. */
  needsYou: { loop: string; label: string; detail: string | null }[];
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
    .map(([loop, count]) => ({ loop, label: LOOP_LABELS[loop] ?? loop, count }))
    .sort((a, b) => b.count - a.count);

  const needsYou = needsRows.map((r) => ({
    loop: r.loop,
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
  const total = digest.totalActions;
  const hero = `<tr><td style="padding:10px 10px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="rl-hero" bgcolor="${BRAND.primary50}" style="background:${BRAND.primary50};border-radius:20px;padding:28px 24px 28px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align:middle;">
            <div style="margin:0 0 14px;">${emailPill(escapeHtml(weekRange(digest.weekStart)), "white", BRAND.primary)}</div>
            <div style="font-size:15px;color:${BRAND.ink2};">This week Autopilot handled</div>
            <div class="rl-big" style="font-family:'Manrope','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:64px;line-height:1.05;font-weight:800;letter-spacing:-0.04em;color:${BRAND.ink};">${total}<span style="font-size:22px;letter-spacing:0;color:${BRAND.primary};"> task${total === 1 ? "" : "s"}</span></div>
            <div style="font-size:15px;line-height:1.55;color:${BRAND.ink2};margin-top:4px;">at ${escapeHtml(digest.orgName)}.</div>
          </td>
          <td class="rl-side" width="150" style="width:150px;vertical-align:middle;">${emailFrog(150)}</td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>`;

  const revenue =
    digest.roi.estimatedRevenue > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr>
          <td bgcolor="${BRAND.okBg}" style="background:${BRAND.okBg};border-radius:18px;padding:18px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td width="56" style="width:56px;">${emailIconChip("icon-revenue.png", 42)}</td>
              <td>
                <div style="font-family:'Manrope','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;line-height:1.1;font-weight:800;color:${BRAND.ink};">${escapeHtml(formatMoney(digest.roi.estimatedRevenue, digest.roi.currency))}</div>
                <div style="font-size:13.5px;color:${BRAND.ink2};margin-top:2px;">estimated revenue${digest.roi.topDriver !== "—" ? ` &middot; top driver: ${escapeHtml(digest.roi.topDriver)}` : ""}</div>
              </td>
            </tr></table>
          </td>
        </tr></table>`
      : "";

  const html = emailShell({
    preheader: digest.intro.slice(0, 120),
    title: `${digest.orgName}, Autopilot this week`,
    hero,
    body: `
      ${emailParagraph(escapeHtml(digest.intro))}
      ${revenue}
      ${
        digest.whatIDid.length > 0
          ? `${emailLabel("What Autopilot did", { top: revenue ? 22 : 6 })}
             ${emailBarRows(digest.whatIDid.map((w) => ({ icon: loopIcon(w.loop), label: w.label, value: w.count })))}`
          : ""
      }
      ${
        digest.needsYou.length > 0
          ? `${emailLabel("Waiting for your OK", { right: emailPill(`${digest.needsYouCount} waiting`, "warning"), top: 20 })}
             ${emailActivityRows(
               digest.needsYou.slice(0, 6).map((n) => ({
                 icon: loopIcon(n.loop),
                 label: n.detail ? `${n.label}: ${n.detail}` : n.label,
               })),
             )}
             ${digest.needsYou.length > 6 ? `<p style="margin:4px 0 0;font-size:13.5px;color:${BRAND.muted};">and ${digest.needsYou.length - 6} more in Autopilot.</p>` : ""}`
          : ""
      }
      ${ctaButton({ url: `${appUrl}/autopilot`, label: "Open Autopilot" })}
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
