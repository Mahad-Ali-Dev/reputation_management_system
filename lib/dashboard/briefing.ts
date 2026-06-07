import { MODELS, anthropic } from "@/lib/ai/client";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { checkBudget } from "@/lib/ai/budget";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Daily-briefing generator for the dashboard's AI Intelligence Center.
 *
 * DESIGN — never a live paid AI call on render. The dashboard renders by reading
 * {@link getCachedBriefing}, which computes a deterministic 1–2 sentence summary
 * from the org's last-24h data (a synchronous template — zero AI spend, zero
 * latency). The cron (`/api/cron/daily-briefing`) calls {@link buildBriefingForOrg}
 * which can optionally upgrade that text with an AI-written version when
 * `ANTHROPIC_API_KEY` is set AND the org is entitled AND within budget;
 * otherwise it returns the same deterministic template (graceful no-op).
 *
 * NOTE ON PERSISTENCE: the planned `DashboardBriefing` cache table is NOT part
 * of the frozen Wave-0 schema, so there is no Prisma model to write to in this
 * wave. The briefing is therefore recomputed deterministically per render
 * (cheap) and the cron computes + logs the (optionally AI-enhanced) text. When
 * the `DashboardBriefing` model is added in a later schema pass, persisting the
 * cron output and reading it here becomes a drop-in change — the public surface
 * of this module does not change. (See `issues` in the build report.)
 *
 * FAIL-SOFT: every path degrades to a friendly deterministic sentence; this
 * module never throws to the page.
 */

export type BriefingSignals = {
  newReviews24h: number;
  avgRating24h: number | null;
  pendingReplies: number;
  needsReply: number;
  /** Net sentiment delta vs the prior 24h (positive share, percentage points). */
  sentimentDeltaPts: number | null;
  isEmpty: boolean;
};

export type Briefing = {
  /** The 1–2 sentence briefing text. */
  body: string;
  /** Model id that produced it, or null when it's the deterministic template. */
  model: string | null;
  signals: BriefingSignals;
};

const DAY = 864e5;

const EMPTY_SIGNALS: BriefingSignals = {
  newReviews24h: 0,
  avgRating24h: null,
  pendingReplies: 0,
  needsReply: 0,
  sentimentDeltaPts: null,
  isEmpty: true,
};

/**
 * Read the org's last-24h activity for the briefing. Fail-soft to empty signals.
 */
async function readBriefingSignals(orgId: string): Promise<BriefingSignals> {
  const now = Date.now();
  const since24h = new Date(now - DAY);
  const prev24hStart = new Date(now - 2 * DAY);

  try {
    return await withTenant(orgId, async (tx) => {
      const [last24, prev24, pendingReplies, needsReply, totalReviews] = await Promise.all([
        tx.review.findMany({
          where: { postedAt: { gte: since24h } },
          select: { rating: true },
        }),
        tx.review.findMany({
          where: { postedAt: { gte: prev24hStart, lt: since24h } },
          select: { rating: true },
        }),
        tx.reviewReply.count({ where: { status: "pending_review" } }),
        tx.review.count({ where: { rating: { lte: 3 }, reply: { is: null } } }),
        tx.review.count(),
      ]);

      const newReviews24h = last24.length;
      const avgRating24h =
        newReviews24h > 0 ? last24.reduce((s, r) => s + r.rating, 0) / newReviews24h : null;

      const posShare = (rows: { rating: number }[]) =>
        rows.length === 0 ? null : rows.filter((r) => r.rating >= 4).length / rows.length;
      const curPos = posShare(last24);
      const prevPos = posShare(prev24);
      const sentimentDeltaPts =
        curPos !== null && prevPos !== null ? Math.round((curPos - prevPos) * 100) : null;

      return {
        newReviews24h,
        avgRating24h,
        pendingReplies,
        needsReply,
        sentimentDeltaPts,
        isEmpty: totalReviews === 0,
      } satisfies BriefingSignals;
    });
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "dashboard.briefing.signals_failed",
    });
    return EMPTY_SIGNALS;
  }
}

/**
 * The deterministic (no-AI) briefing. Always safe to show, used both as the
 * on-render briefing and as the fallback when AI is unavailable.
 */
export function templateBriefing(firstName: string, s: BriefingSignals): string {
  const greet = `Good ${dayPart()}, ${firstName}.`;

  if (s.isEmpty) {
    return `${greet} Connect your Google Business Profile and we'll start tracking your reputation here — new reviews, sentiment shifts, and reply gaps, all in one place.`;
  }

  const parts: string[] = [];
  if (s.newReviews24h > 0) {
    const avg = s.avgRating24h !== null ? ` averaging ${s.avgRating24h.toFixed(1)}★` : "";
    parts.push(
      `you received ${s.newReviews24h} new review${s.newReviews24h === 1 ? "" : "s"}${avg} in the last 24 hours`,
    );
  }
  if (s.sentimentDeltaPts !== null && Math.abs(s.sentimentDeltaPts) >= 5) {
    parts.push(
      s.sentimentDeltaPts > 0
        ? `sentiment is up ${s.sentimentDeltaPts} points`
        : `sentiment dipped ${Math.abs(s.sentimentDeltaPts)} points`,
    );
  }
  if (s.pendingReplies > 0) {
    parts.push(
      `${s.pendingReplies} AI repl${s.pendingReplies === 1 ? "y is" : "ies are"} waiting for your approval`,
    );
  } else if (s.needsReply > 0) {
    parts.push(
      `${s.needsReply} review${s.needsReply === 1 ? "" : "s"} still need${s.needsReply === 1 ? "s" : ""} a reply`,
    );
  }

  if (parts.length === 0) {
    return `${greet} No new reviews in the last 24 hours, and your queue is clear — a great moment to send a few review requests.`;
  }

  // Join nicely: "A, B, and C."
  const joined =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return `${greet} Here's your briefing — ${joined}.`;
}

/**
 * Build the briefing for one org. Used by the cron. Optionally upgrades the
 * deterministic template to an AI-written sentence when creds + entitlement +
 * budget allow; otherwise returns the template (graceful no-op, NO paid call).
 *
 * `day` is accepted for forward-compatibility (per-day idempotency once the
 * cache table exists) but the current implementation summarizes the rolling
 * last-24h window.
 */
export async function buildBriefingForOrg(
  orgId: string,
  _day: Date,
  firstName = "there",
): Promise<Briefing> {
  const signals = await readBriefingSignals(orgId);
  const fallback = templateBriefing(firstName, signals);

  // No creds → deterministic, zero spend.
  const hasKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "sk-ant-...";
  if (!hasKey) {
    return { body: fallback, model: null, signals };
  }

  // Entitlement + budget gates (mirror AiAssist) — degrade to template if not allowed.
  try {
    if (!(await isOrgEntitled(orgId))) {
      return { body: fallback, model: null, signals };
    }
    const budget = await checkBudget(orgId);
    if (!budget.ok) {
      return { body: fallback, model: null, signals };
    }
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "dashboard.briefing.gate_failed",
    });
    return { body: fallback, model: null, signals };
  }

  // Empty orgs don't need a paid call — the welcome template is perfect.
  if (signals.isEmpty) {
    return { body: fallback, model: null, signals };
  }

  try {
    const result = await anthropic.messages.create({
      model: MODELS.HAIKU,
      max_tokens: 160,
      system:
        "You write a single warm, concrete 1–2 sentence morning briefing for a local-business owner about their online reputation. Use ONLY the numbers provided. No greeting prefix, no markdown, no emojis, under 45 words.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            newReviews24h: signals.newReviews24h,
            avgRating24h: signals.avgRating24h,
            pendingReplies: signals.pendingReplies,
            needsReply: signals.needsReply,
            sentimentDeltaPts: signals.sentimentDeltaPts,
          }),
        },
      ],
    });
    const text = result.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join(" ")
      .trim();
    if (!text) return { body: fallback, model: null, signals };
    return { body: `Good ${dayPart()}, ${firstName}. ${text}`, model: MODELS.HAIKU, signals };
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "dashboard.briefing.ai_failed",
    });
    return { body: fallback, model: null, signals };
  }
}

/**
 * The briefing the dashboard renders. Deterministic + synchronous-cost only
 * (one tenant read, no AI call) so a page load never incurs paid spend or AI
 * latency. Always returns a friendly sentence (welcome variant for empty orgs).
 */
export async function getCachedBriefing(orgId: string, firstName = "there"): Promise<Briefing> {
  const signals = await readBriefingSignals(orgId);
  return { body: templateBriefing(firstName, signals), model: null, signals };
}

function dayPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
