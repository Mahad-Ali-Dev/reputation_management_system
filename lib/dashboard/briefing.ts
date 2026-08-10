import { checkBudget } from "@/lib/ai/budget";
import { MODELS, anthropic } from "@/lib/ai/client";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { LIVE_ESTABLISHMENT } from "@/lib/reviews/scope";
import type { Prisma } from "@prisma/client";

/**
 * Daily-briefing generator for the dashboard's AI Intelligence Center.
 *
 * DESIGN — never a live paid AI call on render. The dashboard renders by reading
 * {@link getCachedBriefing}, which now reads the day's cached row from
 * `DashboardBriefing` (populated by the cron) and, only if absent, computes a
 * deterministic 1–2 sentence summary from the org's last-24h data (a
 * synchronous template — zero AI spend, zero latency). The cron
 * (`/api/cron/daily-briefing`) calls {@link buildBriefingForOrg}, which can
 * optionally upgrade that text with an AI-written version when
 * `ANTHROPIC_API_KEY` is set AND the org is entitled AND within budget
 * (otherwise it returns the same deterministic template — a graceful no-op),
 * then UPSERTS it into the cache keyed on (organizationId, day).
 *
 * PERSISTENCE: the `DashboardBriefing` cache table (migration
 * 20260608010000_dashboard_briefing) is upserted by the cron and read back on
 * render. FAIL-SOFT: if the table isn't migrated yet (Postgres 42P01) the read
 * silently recomputes the deterministic briefing and the write is skipped, so
 * the dashboard is identical to the pre-cache behavior on an un-migrated DB.
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

/**
 * Postgres 42P01 (undefined_table) / 42703 (undefined_column) → the
 * `dashboard_briefings` table isn't migrated yet. We degrade to a fresh compute
 * (read) or skip the write, rather than throwing to the page.
 */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** Truncate a Date to UTC midnight — the cache key matches the `@db.Date` column. */
function dayKey(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

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
          where: { ...LIVE_ESTABLISHMENT, postedAt: { gte: since24h } },
          select: { rating: true },
        }),
        tx.review.findMany({
          where: { ...LIVE_ESTABLISHMENT, postedAt: { gte: prev24hStart, lt: since24h } },
          select: { rating: true },
        }),
        tx.reviewReply.count({ where: { status: "pending_review" } }),
        tx.review.count({
          where: { ...LIVE_ESTABLISHMENT, rating: { lte: 3 }, reply: { is: null } },
        }),
        tx.review.count({ where: { ...LIVE_ESTABLISHMENT } }),
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
 * Persist a computed briefing into the per-day cache (upsert by org+day).
 * Tenant-scoped (RLS applies). FAIL-SOFT: a not-yet-migrated table (42P01) or
 * any transient error is logged and swallowed — persistence is best-effort and
 * never fatal to the cron.
 */
async function persistBriefing(orgId: string, day: Date, b: Briefing): Promise<void> {
  const d = dayKey(day);
  try {
    await withTenant(orgId, async (tx) => {
      await tx.dashboardBriefing.upsert({
        where: { organizationId_day: { organizationId: orgId, day: d } },
        create: {
          organizationId: orgId,
          day: d,
          body: b.body,
          model: b.model,
          signals: b.signals as unknown as Prisma.InputJsonValue,
        },
        update: {
          body: b.body,
          model: b.model,
          signals: b.signals as unknown as Prisma.InputJsonValue,
        },
      });
    });
  } catch (err) {
    if (isMissingRelation(err)) return; // table not migrated yet — silent no-op.
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "dashboard.briefing.persist_failed",
    });
  }
}

/**
 * Read today's cached briefing row, or null when absent / not-yet-migrated.
 * Tenant-scoped. FAIL-SOFT: 42P01 (table missing) and any error → null so the
 * caller recomputes the deterministic briefing.
 */
async function readCachedRow(
  orgId: string,
  day: Date,
): Promise<{ body: string; model: string | null; signals: BriefingSignals } | null> {
  const d = dayKey(day);
  try {
    return await withTenant(orgId, async (tx) => {
      const row = await tx.dashboardBriefing.findUnique({
        where: { organizationId_day: { organizationId: orgId, day: d } },
        select: { body: true, model: true, signals: true },
      });
      if (!row) return null;
      return {
        body: row.body,
        model: row.model ?? null,
        signals: (row.signals as unknown as BriefingSignals) ?? EMPTY_SIGNALS,
      };
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({
        orgId,
        error: err instanceof Error ? err.message : String(err),
        event: "dashboard.briefing.cache_read_failed",
      });
    }
    return null;
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
 * The computed briefing is UPSERTED into the per-day cache (keyed on org+`day`)
 * as a best-effort, fail-soft write — so the dashboard can read it back without
 * recomputing. Persistence never affects the returned value or throws.
 */
export async function buildBriefingForOrg(
  orgId: string,
  day: Date,
  firstName = "there",
): Promise<Briefing> {
  const briefing = await computeBriefingForOrg(orgId, firstName);
  await persistBriefing(orgId, day, briefing);
  return briefing;
}

/**
 * Pure compute path for {@link buildBriefingForOrg} (no persistence). Kept
 * separate so persistence is a single, fail-soft step around every branch's
 * result rather than scattered across each early return.
 */
async function computeBriefingForOrg(orgId: string, firstName: string): Promise<Briefing> {
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
 * The briefing the dashboard renders. Reads today's CACHED row first (the cron
 * precomputes it — possibly AI-written) and, only when there's no cached row,
 * computes the deterministic template (one tenant read, no AI call) so a page
 * load never incurs paid spend or AI latency. FAIL-SOFT: a not-yet-migrated
 * cache table (42P01) transparently falls through to the deterministic compute,
 * preserving the prior behavior. Always returns a friendly sentence (welcome
 * variant for empty orgs).
 */
export async function getCachedBriefing(orgId: string, firstName = "there"): Promise<Briefing> {
  // 1) Cached row (today, UTC). Present once the cron has run + table exists.
  const cached = await readCachedRow(orgId, new Date());
  if (cached) {
    return { body: cached.body, model: cached.model, signals: cached.signals };
  }

  // 2) No cache (first load of the day, or table not migrated) → deterministic.
  const signals = await readBriefingSignals(orgId);
  return { body: templateBriefing(firstName, signals), model: null, signals };
}

function dayPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
