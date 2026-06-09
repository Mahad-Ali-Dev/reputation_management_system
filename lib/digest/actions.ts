import { createHmac } from "node:crypto";
import { Resend } from "resend";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { notificationEnabled } from "@/lib/notifications/prefs";
import { assertSendableEmailConfig } from "@/lib/outreach/email-guard";
import { getUnsubscribeSecret } from "@/lib/secrets";

/**
 * Daily digest builder.
 *
 * For each org that received reviews yesterday (UTC), build a summary email:
 *   - Total reviews + avg rating
 *   - Star breakdown
 *   - Top 3 reviews (best + worst)
 *   - Pending-approval count (for the "still needs your attention" CTA)
 *
 * Sent to each owner+admin membership of the org. Honors per-recipient
 * unsubscribes via the unsubscribes table.
 *
 * Run by /api/cron/daily-digest at ~08:00 in the org's primary establishment timezone.
 * For simplicity v1 we run once at 13:00 UTC (08:00 ET) for everyone — Day 11+ we
 * can shard by timezone.
 */

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
  // Fail-closed in production via lib/secrets.ts.
  const secret = getUnsubscribeSecret();
  const payload = `${orgId}|${email.toLowerCase()}|email`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${appUrl}/u?org=${encodeURIComponent(orgId)}&e=${encodeURIComponent(email)}&c=email&s=${sig}`;
}

type DigestStats = {
  orgId: string;
  orgName: string;
  reviewCount: number;
  avgRating: number;
  starBreakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  pendingReplyCount: number;
  bestReview: { rating: number; reviewerName: string | null; body: string | null } | null;
  worstReview: { rating: number; reviewerName: string | null; body: string | null } | null;
  recipients: { email: string; name: string | null }[];
};

/**
 * Build digest stats for one org. Returns null if there's nothing to report.
 */
export async function buildDigestForOrg(orgId: string, day: Date): Promise<DigestStats | null> {
  // Day window in UTC.
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  });
  if (!org) return null;

  const data = await withTenant(orgId, async (tx) => {
    const [reviews, pendingReplyCount, recipients] = await Promise.all([
      tx.review.findMany({
        where: { postedAt: { gte: start, lt: end } },
        select: { id: true, rating: true, body: true, reviewerName: true },
        orderBy: { postedAt: "desc" },
      }),
      tx.reviewReply.count({ where: { status: "pending_review" } }),
      // Pull org members who haven't unsubscribed from digests
      prisma.membership.findMany({
        where: { organizationId: orgId, role: { in: ["owner", "admin"] } },
        select: { user: { select: { email: true, name: true } } },
      }),
    ]);
    return { reviews, pendingReplyCount, recipients };
  });

  if (data.reviews.length === 0 && data.pendingReplyCount === 0) {
    // Nothing to report
    return null;
  }

  const reviewCount = data.reviews.length;
  const avgRating =
    reviewCount === 0 ? 0 : data.reviews.reduce((s, r) => s + r.rating, 0) / reviewCount;
  const starBreakdown: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of data.reviews) {
    if (r.rating >= 1 && r.rating <= 5) {
      starBreakdown[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
    }
  }

  const sortedByRating = [...data.reviews].sort((a, b) => b.rating - a.rating);
  const bestReview = sortedByRating[0] ?? null;
  const worstReview = sortedByRating[sortedByRating.length - 1] ?? null;

  // Filter recipients against unsubscribes (single query, scoped to this org)
  const recipientEmails = data.recipients
    .map((m) => m.user?.email)
    .filter((e): e is string => !!e);
  const unsubs = recipientEmails.length === 0
    ? []
    : await prisma.unsubscribe.findMany({
        where: {
          organizationId: orgId,
          channel: "email",
          emailOrPhone: { in: recipientEmails.map((e) => e.toLowerCase()) },
        },
        select: { emailOrPhone: true },
      });
  const unsubSet = new Set(unsubs.map((u) => u.emailOrPhone));
  const allowedRecipients = data.recipients
    .flatMap((m) => {
      const email = m.user?.email;
      if (!email || unsubSet.has(email.toLowerCase())) return [];
      return [{ email, name: m.user?.name ?? null }];
    });

  return {
    orgId: org.id,
    orgName: org.name,
    reviewCount,
    avgRating,
    starBreakdown,
    pendingReplyCount: data.pendingReplyCount,
    bestReview: bestReview && bestReview.rating === sortedByRating[0]?.rating ? bestReview : null,
    worstReview:
      worstReview && worstReview.rating !== bestReview?.rating ? worstReview : null,
    recipients: allowedRecipients,
  };
}

export function renderDigestEmail(stats: DigestStats, recipientEmail: string): {
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
} {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const unsubscribeUrl = oneClickUnsubscribeUrl(stats.orgId, recipientEmail);

  const subject =
    stats.reviewCount > 0
      ? `${stats.orgName}: ${stats.reviewCount} new review${stats.reviewCount === 1 ? "" : "s"} yesterday`
      : `${stats.orgName}: ${stats.pendingReplyCount} replies still need your approval`;

  // Plain-text version
  const lines: string[] = [
    `${stats.orgName} — yesterday's review digest`,
    "",
  ];
  if (stats.reviewCount > 0) {
    lines.push(
      `${stats.reviewCount} new review${stats.reviewCount === 1 ? "" : "s"} · avg rating ${stats.avgRating.toFixed(2)}`,
    );
    lines.push("");
    lines.push("Stars:");
    for (const s of [5, 4, 3, 2, 1] as const) {
      const n = stats.starBreakdown[s];
      if (n > 0) lines.push(`  ${s}★ — ${n}`);
    }
    if (stats.bestReview) {
      lines.push("");
      lines.push(`Best: "${(stats.bestReview.body ?? "").slice(0, 200)}" — ${stats.bestReview.reviewerName ?? "Anonymous"}`);
    }
    if (stats.worstReview) {
      lines.push("");
      lines.push(`Lowest: "${(stats.worstReview.body ?? "").slice(0, 200)}" — ${stats.worstReview.reviewerName ?? "Anonymous"}`);
    }
  }
  if (stats.pendingReplyCount > 0) {
    lines.push("");
    lines.push(
      `${stats.pendingReplyCount} reply${stats.pendingReplyCount === 1 ? "" : "ies"} pending your approval.`,
    );
  }
  lines.push("");
  lines.push(`Open the dashboard: ${appUrl}/dashboard`);
  lines.push("");
  lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  const text = lines.join("\n");

  // HTML version
  const starsRows = ([5, 4, 3, 2, 1] as const)
    .filter((s) => stats.starBreakdown[s] > 0)
    .map(
      (s) =>
        `<tr><td style="padding:4px 8px;color:#475569;">${s}★</td><td style="padding:4px 8px;color:#0f172a;font-weight:600;">${stats.starBreakdown[s]}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,sans-serif;background:#f8fafc;padding:24px;margin:0;">
<div style="max-width:560px;margin:0 auto;background:#fff;padding:32px;border-radius:12px;border:1px solid #e2e8f0;">
  <h1 style="margin:0 0 4px;font-size:22px;color:#0f172a;">${escapeHtml(stats.orgName)}</h1>
  <p style="margin:0 0 20px;color:#94a3b8;font-size:13px;">Yesterday's review digest</p>

  ${
    stats.reviewCount > 0
      ? `
  <div style="display:flex;gap:24px;margin-bottom:20px;">
    <div>
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">New reviews</div>
      <div style="font-size:28px;font-weight:700;color:#0f172a;">${stats.reviewCount}</div>
    </div>
    <div>
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Avg rating</div>
      <div style="font-size:28px;font-weight:700;color:#0f172a;">${stats.avgRating.toFixed(2)}</div>
    </div>
  </div>
  ${starsRows ? `<table style="border-collapse:collapse;margin:0 0 20px;">${starsRows}</table>` : ""}
  ${
    stats.bestReview
      ? `<div style="background:#ecfdf5;border-left:3px solid #10b981;padding:12px 16px;margin:12px 0;border-radius:4px;">
          <div style="font-size:11px;color:#059669;text-transform:uppercase;font-weight:600;">Best review</div>
          <p style="margin:6px 0 0;color:#0f172a;font-size:14px;">"${escapeHtml((stats.bestReview.body ?? "").slice(0, 240))}"</p>
          <div style="margin-top:6px;color:#94a3b8;font-size:12px;">— ${escapeHtml(stats.bestReview.reviewerName ?? "Anonymous")} · ${stats.bestReview.rating}★</div>
        </div>`
      : ""
  }
  ${
    stats.worstReview
      ? `<div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;margin:12px 0;border-radius:4px;">
          <div style="font-size:11px;color:#dc2626;text-transform:uppercase;font-weight:600;">Lowest review</div>
          <p style="margin:6px 0 0;color:#0f172a;font-size:14px;">"${escapeHtml((stats.worstReview.body ?? "").slice(0, 240))}"</p>
          <div style="margin-top:6px;color:#94a3b8;font-size:12px;">— ${escapeHtml(stats.worstReview.reviewerName ?? "Anonymous")} · ${stats.worstReview.rating}★</div>
        </div>`
      : ""
  }
  `
      : ""
  }

  ${
    stats.pendingReplyCount > 0
      ? `<div style="background:#fffbeb;border-left:3px solid #f59e0b;padding:12px 16px;margin:12px 0;border-radius:4px;">
          <p style="margin:0;color:#92400e;font-size:14px;font-weight:600;">${stats.pendingReplyCount} repl${stats.pendingReplyCount === 1 ? "y" : "ies"} pending your approval</p>
        </div>`
      : ""
  }

  <p style="margin:24px 0 0;">
    <a href="${appUrl}/reviews" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open dashboard →</a>
  </p>

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  <p style="color:#94a3b8;font-size:12px;margin:0;">
    Don't want these digests? <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe with one click</a>.
  </p>
</div>
</body></html>`;

  return { subject, html, text, unsubscribeUrl };
}

export async function sendDigestForOrg(orgId: string, day: Date): Promise<{
  sent: number;
  skipped: number;
  errors: string[];
}> {
  // Honor the Account → Notifications "Weekly summary" toggle (opt-out model).
  if (!(await notificationEnabled(orgId, "weekly_report", "email"))) {
    logger.info(
      { event: "digest.skip.disabled_pref", orgId },
      "weekly summary disabled in notification settings, skipping",
    );
    return { sent: 0, skipped: 1, errors: [] };
  }

  // IDEMPOTENCY: try to claim this (org, day) in digest_runs. If a previous run
  // already claimed it, bail out with skipped=1 — we never re-send a digest.
  // The unique (organization_id, day) constraint makes this race-safe across
  // concurrent QStash retries.
  const dayDate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  let runId: string;
  try {
    const run = await prisma.digestRun.create({
      data: { organizationId: orgId, day: dayDate },
      select: { id: true },
    });
    runId = run.id;
  } catch (err) {
    // Likely the unique-constraint conflict (P2002). Treat as "already done".
    if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
      logger.info(
        { event: "digest.skip.already_sent", orgId, day: dayDate.toISOString() },
        "digest already sent for this org/day, skipping",
      );
      return { sent: 0, skipped: 1, errors: [] };
    }
    throw err;
  }

  const stats = await buildDigestForOrg(orgId, day);
  if (!stats || stats.recipients.length === 0) {
    await prisma.digestRun.update({
      where: { id: runId },
      data: { completedAt: new Date(), recipientsSent: 0, recipientsFailed: 0 },
    });
    return { sent: 0, skipped: stats ? 1 : 0, errors: [] };
  }

  const from = process.env.EMAIL_FROM ?? "notifications@repulabs.com";
  assertSendableEmailConfig(from);
  let sent = 0;
  const errors: string[] = [];

  for (const r of stats.recipients) {
    const { subject, html, text, unsubscribeUrl } = renderDigestEmail(stats, r.email);
    try {
      const { error } = await getResend().emails.send({
        from,
        to: r.email,
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      if (error) {
        errors.push(`${r.email}: ${error.message}`);
      } else {
        sent++;
      }
    } catch (err) {
      errors.push(`${r.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await prisma.digestRun.update({
    where: { id: runId },
    data: {
      completedAt: new Date(),
      recipientsSent: sent,
      recipientsFailed: errors.length,
      errorSummary: errors.length > 0 ? errors.slice(0, 5).join("; ").slice(0, 1000) : null,
    },
  });

  logger.info(
    { event: "digest.sent", orgId, sent, errors: errors.length, runId },
    "Daily digest dispatched",
  );

  return { sent, skipped: stats.recipients.length - sent, errors };
}
