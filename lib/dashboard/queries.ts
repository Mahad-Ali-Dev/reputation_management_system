import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Dashboard server queries.
 *
 * Consolidates every tenant aggregate the dashboard renders into ONE batched,
 * tenant-scoped transaction (`getDashboardData`) plus the onboarding checklist
 * facts (`getSetupState`). Hoisting these out of `page.tsx` keeps the page lean
 * and makes the data layer reusable + testable.
 *
 * FAIL-SOFT CONTRACT: new models/columns may not be migrated yet on a given
 * deploy. Every getter is wrapped so a Postgres `42P01` (undefined_table) /
 * `42703` (undefined_column) — or any transient error — degrades to an empty
 * shape rather than throwing a 500. The dashboard renders its empty/zero states
 * in that case instead of crashing.
 */

export type RecentActivityKind = "request" | "reply" | "call" | "scan";

export type RecentActivityItem = {
  id: string;
  at: Date;
  kind: RecentActivityKind;
  title: string;
  /** Outcome/status shown right-aligned, e.g. "delivered", "published". */
  status: string;
};

export type DashboardListing = {
  id: string;
  name: string;
  locality: string | null;
  reviewCount: number;
  avgRating: number;
};

export type ChannelSlice = { channel: string; count: number; pct: number };

export type FunnelStage = { label: string; count: number; pct: number };

export type DashboardData = {
  total: number;
  avgRating: number;
  ratingGroups: { rating: number; count: number }[];
  reviews7d: number;
  /** % change in reviews this 7d vs the prior 7d (rounded, can be negative). */
  reviews7dDeltaPct: number | null;
  repliedCount: number;
  pendingReplyCount: number;
  needsReplyCount: number;
  /** AI-drafted replies created in the last 24h (the artboard's "AI replies drafted"). */
  aiDrafted24h: number;
  liveReviews: Array<{
    id: string;
    rating: number;
    reviewerName: string | null;
    body: string | null;
    postedAt: Date | null;
    source: string;
    reply: { id: string } | null;
  }>;
  /** Best 2 reviews for the "Latest reviews" insight band. */
  latestReviews: Array<{
    id: string;
    rating: number;
    reviewerName: string | null;
    body: string | null;
  }>;
  listings: DashboardListing[];
  /** Total non-deleted establishments (NOT capped like `listings`). */
  establishmentCount: number;
  activeConnections: number;
  hasGoogle: boolean;
  requestsSent30d: number;
  /** 12-week weekly review counts (oldest → newest) for the bar chart. */
  weeklyReviews: number[];
  /** Sentiment split derived from rating (>=4 positive, ==3 neutral, <=2 negative). */
  sentiment: { positivePct: number; neutralPct: number; negativePct: number };
  channelMix: ChannelSlice[];
  funnel: FunnelStage[];
  recentActivity: RecentActivityItem[];
  /** All-time count of PUBLISHED review replies ("AI replies sent"). */
  aiRepliesSent: number;
  /** 12-week weekly 5-star review counts (oldest → newest). */
  weeklyFiveStar: number[];
  /** 12-week weekly published-reply counts (oldest → newest). */
  weeklyAiReplies: number[];
  /** Weekly average-rating points over the last 12 weeks (non-empty weeks only, oldest → newest). */
  ratingTrendPoints: number[];
  /** Mean hours from review.postedAt → reply publish over recent published replies; null when no replies. */
  avgResponseHours: number | null;
  /** Public Google reviews URL for the first listing with a place id, else null. */
  googlePlaceUrl: string | null;
  /** 30d-vs-prior-30d movements for the hero stat chips. null = prior window empty (no defined rate). */
  deltas30d: {
    reviewsPct: number | null;
    fiveStarPct: number | null;
    aiRepliesPct: number | null;
    /** Absolute rating movement (e.g. +0.3), needs BOTH windows non-empty. */
    ratingAbs: number | null;
  };
};

const EMPTY_DASHBOARD: DashboardData = {
  total: 0,
  avgRating: 0,
  ratingGroups: [],
  reviews7d: 0,
  reviews7dDeltaPct: null,
  repliedCount: 0,
  pendingReplyCount: 0,
  needsReplyCount: 0,
  aiDrafted24h: 0,
  liveReviews: [],
  latestReviews: [],
  listings: [],
  establishmentCount: 0,
  activeConnections: 0,
  hasGoogle: false,
  requestsSent30d: 0,
  weeklyReviews: new Array(12).fill(0),
  sentiment: { positivePct: 0, neutralPct: 0, negativePct: 0 },
  channelMix: [],
  funnel: [],
  recentActivity: [],
  aiRepliesSent: 0,
  weeklyFiveStar: new Array(12).fill(0),
  weeklyAiReplies: new Array(12).fill(0),
  ratingTrendPoints: [],
  avgResponseHours: null,
  googlePlaceUrl: null,
  deltas30d: { reviewsPct: null, fiveStarPct: null, aiRepliesPct: null, ratingAbs: null },
};

const DAY = 864e5;

function localityFromAddress(address: unknown): string | null {
  if (!address || typeof address !== "object") return null;
  const a = address as Record<string, unknown>;
  const city = typeof a.city === "string" ? a.city : null;
  const region = typeof a.region === "string" ? a.region : typeof a.state === "string" ? a.state : null;
  return city ?? region ?? null;
}

/**
 * One batched, tenant-scoped read of every dashboard aggregate. Fail-soft to
 * {@link EMPTY_DASHBOARD} on any error (incl. not-yet-migrated tables/columns).
 */
export async function getDashboardData(orgId: string): Promise<DashboardData> {
  const now = Date.now();
  const since30d = new Date(now - 30 * DAY);
  const prev30dStart = new Date(now - 60 * DAY);
  const since7d = new Date(now - 7 * DAY);
  const prev7dStart = new Date(now - 14 * DAY);
  const since24h = new Date(now - DAY);
  const since12w = new Date(now - 12 * 7 * DAY);

  try {
    const d = await withTenant(orgId, async (tx) => {
      const [
        ratingAgg,
        ratingGroups,
        reviews7d,
        reviewsPrev7d,
        repliedCount,
        pendingReplyCount,
        needsReplyCount,
        aiDrafted24h,
        liveReviews,
        topReviews,
        establishments,
        establishmentCount,
        activeConnections,
        requestsSent30d,
        chartReviews,
        recentReplies,
        recentRequests,
        recentCalls,
        recentScans,
        funnelSent,
        funnelDelivered,
        funnelOpened,
        funnelConverted,
        publishedReplyCount,
        publishedReplies,
        reviews30d,
        reviewsPrev30d,
        fiveStar30d,
        fiveStarPrev30d,
        replies30d,
        repliesPrev30d,
        ratingAgg30d,
        ratingAggPrev30d,
      ] = await Promise.all([
        tx.review.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
        tx.review.groupBy({ by: ["rating"], _count: { _all: true } }),
        tx.review.count({ where: { postedAt: { gte: since7d } } }),
        tx.review.count({ where: { postedAt: { gte: prev7dStart, lt: since7d } } }),
        tx.reviewReply.count({ where: { status: { in: ["published", "pending_review"] } } }),
        tx.reviewReply.count({ where: { status: "pending_review" } }),
        tx.review.count({ where: { rating: { lte: 3 }, reply: { is: null } } }),
        tx.reviewReply.count({ where: { createdAt: { gte: since24h } } }),
        tx.review.findMany({
          orderBy: { postedAt: "desc" },
          take: 4,
          select: {
            id: true, rating: true, reviewerName: true, body: true, postedAt: true,
            source: true, reply: { select: { id: true } },
          },
        }),
        tx.review.findMany({
          where: { body: { not: null } },
          orderBy: [{ rating: "desc" }, { postedAt: "desc" }],
          take: 2,
          select: { id: true, rating: true, reviewerName: true, body: true },
        }),
        tx.establishment.findMany({
          where: { deletedAt: null },
          take: 6,
          orderBy: { createdAt: "asc" },
          select: {
            id: true, name: true, address: true, googlePlaceId: true,
            _count: {
              select: {
                connections: { where: { status: "active" } },
                reviews: true,
              },
            },
            reviews: { select: { rating: true } },
          },
        }),
        tx.establishment.count({ where: { deletedAt: null } }),
        tx.connection.count({ where: { status: "active" } }),
        tx.reviewRequest.count({ where: { sentAt: { gte: since30d } } }),
        tx.review.findMany({
          where: { postedAt: { gte: since12w } },
          select: { postedAt: true, rating: true },
        }),
        tx.reviewReply.findMany({
          where: { createdAt: { gte: since24h } }, orderBy: { createdAt: "desc" }, take: 8,
          select: { id: true, createdAt: true, status: true, review: { select: { reviewerName: true } } },
        }),
        tx.reviewRequest.findMany({
          where: { createdAt: { gte: since24h } }, orderBy: { createdAt: "desc" }, take: 8,
          select: {
            id: true, createdAt: true, status: true, channel: true, recipient: true,
            convertedAt: true, deliveredAt: true, openedAt: true,
          },
        }),
        tx.phoneCall.findMany({
          where: { startedAt: { gte: since24h } }, orderBy: { startedAt: "desc" }, take: 4,
          select: { id: true, startedAt: true, fromE164: true },
        }),
        tx.deviceScan.findMany({
          where: { scannedAt: { gte: since24h } }, orderBy: { scannedAt: "desc" }, take: 4,
          select: { id: true, scannedAt: true, country: true },
        }),
        // Funnel counts — explicit counts (per-field _count avoided to keep
        // typecheck robust across Prisma client variants).
        tx.reviewRequest.count({ where: { createdAt: { gte: since30d }, sentAt: { not: null } } }),
        tx.reviewRequest.count({ where: { createdAt: { gte: since30d }, deliveredAt: { not: null } } }),
        tx.reviewRequest.count({ where: { createdAt: { gte: since30d }, openedAt: { not: null } } }),
        tx.reviewRequest.count({ where: { createdAt: { gte: since30d }, convertedAt: { not: null } } }),
        // ── Kit stat-chip + key-insight sources ──────────────────────────
        tx.reviewReply.count({ where: { status: "published" } }),
        // Recent published replies → weekly reply sparkline + avg response time
        // (publishedAt ?? createdAt minus review.postedAt).
        tx.reviewReply.findMany({
          where: { status: "published" },
          orderBy: { createdAt: "desc" },
          take: 200,
          select: {
            createdAt: true,
            publishedAt: true,
            review: { select: { postedAt: true } },
          },
        }),
        tx.review.count({ where: { postedAt: { gte: since30d } } }),
        tx.review.count({ where: { postedAt: { gte: prev30dStart, lt: since30d } } }),
        tx.review.count({ where: { rating: 5, postedAt: { gte: since30d } } }),
        tx.review.count({ where: { rating: 5, postedAt: { gte: prev30dStart, lt: since30d } } }),
        tx.reviewReply.count({ where: { status: "published", createdAt: { gte: since30d } } }),
        tx.reviewReply.count({
          where: { status: "published", createdAt: { gte: prev30dStart, lt: since30d } },
        }),
        tx.review.aggregate({
          where: { postedAt: { gte: since30d } },
          _avg: { rating: true },
          _count: { _all: true },
        }),
        tx.review.aggregate({
          where: { postedAt: { gte: prev30dStart, lt: since30d } },
          _avg: { rating: true },
          _count: { _all: true },
        }),
      ]);
      return {
        ratingAgg, ratingGroups, reviews7d, reviewsPrev7d, repliedCount, pendingReplyCount,
        needsReplyCount, aiDrafted24h, liveReviews, topReviews, establishments,
        establishmentCount, activeConnections, requestsSent30d, chartReviews, recentReplies, recentRequests,
        recentCalls, recentScans,
        funnelSent, funnelDelivered, funnelOpened, funnelConverted,
        publishedReplyCount, publishedReplies, reviews30d, reviewsPrev30d,
        fiveStar30d, fiveStarPrev30d, replies30d, repliesPrev30d, ratingAgg30d, ratingAggPrev30d,
      };
    });

    const total = d.ratingAgg._count._all;
    const avgRating = d.ratingAgg._avg.rating ?? 0;
    const ratingGroups = d.ratingGroups.map((g) => ({ rating: g.rating, count: g._count._all }));
    const hasGoogle =
      d.establishments.some((e) => e._count.connections > 0) || d.activeConnections > 0;

    // null (not a fabricated "+100%") when the prior window is empty — a 0->N
    // week has no defined growth rate; consumers (KPI chip, visibility banner's
    // "and improving" headline + velocity sentence) all degrade gracefully on null.
    const reviews7dDeltaPct =
      d.reviewsPrev7d > 0
        ? Math.round(((d.reviews7d - d.reviewsPrev7d) / d.reviewsPrev7d) * 100)
        : null;

    // 12-week weekly histograms (bucket 0 = oldest week): total reviews,
    // 5-star reviews, and per-week rating sums for the avg-rating trend.
    const weeklyReviews = new Array(12).fill(0);
    const weeklyFiveStar = new Array(12).fill(0);
    const weeklyRatingSum = new Array(12).fill(0);
    for (const r of d.chartReviews) {
      if (!r.postedAt) continue;
      const weeksAgo = Math.floor((now - r.postedAt.getTime()) / (7 * DAY));
      const bucket = 11 - Math.min(11, Math.max(0, weeksAgo));
      weeklyReviews[bucket] += 1;
      weeklyRatingSum[bucket] += r.rating;
      if (r.rating === 5) weeklyFiveStar[bucket] += 1;
    }
    // Avg-rating trend: only weeks that actually had reviews produce a point
    // (no fabricated flat segments). <2 points = no sparkline downstream.
    const ratingTrendPoints: number[] = [];
    for (let i = 0; i < 12; i++) {
      if (weeklyReviews[i] > 0) {
        ratingTrendPoints.push(Math.round((weeklyRatingSum[i] / weeklyReviews[i]) * 100) / 100);
      }
    }

    // Weekly published-reply sparkline + avg response time, both from the same
    // recent-published-replies read. Response time = review posted → reply
    // published (fall back to reply createdAt); negative gaps (imported data)
    // are skipped.
    const weeklyAiReplies = new Array(12).fill(0);
    let respSumMs = 0;
    let respN = 0;
    for (const rep of d.publishedReplies) {
      const sentAt = rep.publishedAt ?? rep.createdAt;
      if (rep.createdAt.getTime() >= now - 12 * 7 * DAY) {
        const weeksAgo = Math.floor((now - rep.createdAt.getTime()) / (7 * DAY));
        const bucket = 11 - Math.min(11, Math.max(0, weeksAgo));
        weeklyAiReplies[bucket] += 1;
      }
      if (rep.review?.postedAt) {
        const gap = sentAt.getTime() - rep.review.postedAt.getTime();
        if (gap >= 0) {
          respSumMs += gap;
          respN += 1;
        }
      }
    }
    const avgResponseHours = respN > 0 ? Math.round((respSumMs / respN / 36e5) * 10) / 10 : null;

    // 30d-vs-prior-30d chip deltas. null when the prior window is empty — a
    // 0→N month has no defined growth rate (same contract as reviews7dDeltaPct).
    const pctDelta = (cur: number, prev: number): number | null =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
    const avg30 = d.ratingAgg30d._avg.rating;
    const avgPrev30 = d.ratingAggPrev30d._avg.rating;
    const deltas30d = {
      reviewsPct: pctDelta(d.reviews30d, d.reviewsPrev30d),
      fiveStarPct: pctDelta(d.fiveStar30d, d.fiveStarPrev30d),
      aiRepliesPct: pctDelta(d.replies30d, d.repliesPrev30d),
      ratingAbs:
        d.ratingAgg30d._count._all > 0 && d.ratingAggPrev30d._count._all > 0 && avg30 !== null && avgPrev30 !== null
          ? Math.round((avg30 - avgPrev30) * 10) / 10
          : null,
    };

    // Public "View on Google" reviews link — first listing with a place id.
    const placeId = d.establishments.find((e) => e.googlePlaceId)?.googlePlaceId ?? null;
    const googlePlaceUrl = placeId
      ? `https://search.google.com/local/reviews?placeid=${encodeURIComponent(placeId)}`
      : null;

    // Sentiment from rating distribution.
    let pos = 0;
    let neu = 0;
    let neg = 0;
    for (const g of ratingGroups) {
      if (g.rating >= 4) pos += g.count;
      else if (g.rating === 3) neu += g.count;
      else neg += g.count;
    }
    const sentTotal = pos + neu + neg;
    const sentiment = sentTotal > 0
      ? {
          positivePct: Math.round((pos / sentTotal) * 100),
          neutralPct: Math.round((neu / sentTotal) * 100),
          negativePct: Math.round((neg / sentTotal) * 100),
        }
      : { positivePct: 0, neutralPct: 0, negativePct: 0 };

    // Channel mix from the 30d request channels (proxy for acquisition mix).
    const channelCounts = new Map<string, number>();
    for (const r of d.recentRequests) {
      channelCounts.set(r.channel, (channelCounts.get(r.channel) ?? 0) + 1);
    }
    // Fall back to source distribution of reviews if no requests in window.
    const channelTotal = [...channelCounts.values()].reduce((a, b) => a + b, 0);
    const channelMix: ChannelSlice[] = channelTotal > 0
      ? [...channelCounts.entries()]
          .map(([channel, count]) => ({
            channel,
            count,
            pct: Math.round((count / channelTotal) * 100),
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4)
      : [];

    // Funnel from the explicit counts.
    const sent = d.funnelSent;
    const funnel: FunnelStage[] = sent > 0
      ? [
          { label: "Sent", count: sent, pct: 100 },
          { label: "Delivered", count: d.funnelDelivered, pct: Math.round((d.funnelDelivered / sent) * 100) },
          { label: "Opened", count: d.funnelOpened, pct: Math.round((d.funnelOpened / sent) * 100) },
          { label: "Converted", count: d.funnelConverted, pct: Math.round((d.funnelConverted / sent) * 100) },
        ]
      : [];

    const listings: DashboardListing[] = d.establishments.map((e) => {
      const ratings = e.reviews.map((r) => r.rating);
      const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      return {
        id: e.id,
        name: e.name,
        locality: localityFromAddress(e.address),
        reviewCount: e._count.reviews,
        avgRating: avg,
      };
    });

    // Merge recent events into one audit feed, newest first.
    const recentActivity: RecentActivityItem[] = [
      ...d.recentRequests.map((r): RecentActivityItem => ({
        id: `req-${r.id}`,
        at: r.createdAt,
        kind: "request",
        title: `Review request sent via ${channelLabel(r.channel)} to ${r.recipient}`,
        status: requestStatus(r),
      })),
      ...d.recentReplies.map((r): RecentActivityItem => ({
        id: `rep-${r.id}`,
        at: r.createdAt,
        kind: "reply",
        title: `AI drafted a review reply${r.review?.reviewerName ? ` for ${r.review.reviewerName}` : ""}`,
        status: r.status,
      })),
      ...d.recentCalls.map((c): RecentActivityItem => ({
        id: `call-${c.id}`,
        at: c.startedAt,
        kind: "call",
        title: `Phone call answered from ${c.fromE164 ?? "unknown caller"}`,
        status: "answered",
      })),
      ...d.recentScans.map((s): RecentActivityItem => ({
        id: `scan-${s.id}`,
        at: s.scannedAt,
        kind: "scan",
        title: `Review stand scanned${s.country ? ` in ${s.country}` : ""}`,
        status: "scan",
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 8);

    return {
      total,
      avgRating,
      ratingGroups,
      reviews7d: d.reviews7d,
      reviews7dDeltaPct,
      repliedCount: d.repliedCount,
      pendingReplyCount: d.pendingReplyCount,
      needsReplyCount: d.needsReplyCount,
      aiDrafted24h: d.aiDrafted24h,
      liveReviews: d.liveReviews,
      latestReviews: d.topReviews,
      listings,
      establishmentCount: d.establishmentCount,
      activeConnections: d.activeConnections,
      hasGoogle,
      requestsSent30d: d.requestsSent30d,
      weeklyReviews,
      sentiment,
      channelMix,
      funnel,
      recentActivity,
      aiRepliesSent: d.publishedReplyCount,
      weeklyFiveStar,
      weeklyAiReplies,
      ratingTrendPoints,
      avgResponseHours,
      googlePlaceUrl,
      deltas30d,
    };
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "dashboard.data.failed",
    });
    return EMPTY_DASHBOARD;
  }
}

function channelLabel(channel: string): string {
  switch (channel) {
    case "sms":
      return "SMS";
    case "email":
      return "email";
    case "whatsapp":
      return "WhatsApp";
    default:
      return channel;
  }
}

function requestStatus(r: {
  status: string;
  convertedAt: Date | null;
  deliveredAt: Date | null;
  openedAt: Date | null;
}): string {
  if (r.convertedAt) return "converted";
  if (r.openedAt) return "opened";
  if (r.deliveredAt) return "delivered";
  return r.status;
}

// ============================================================
// Setup / onboarding state
// ============================================================

export type SetupStep = { key: string; label: string; done: boolean; href: string };

export type SetupState = {
  steps: SetupStep[];
  completed: number;
  total: number;
  pct: number;
  /** True when the operator dismissed the wizard (onboardingStep sentinel 99). */
  dismissed: boolean;
};

/**
 * Derive the onboarding checklist for the dashboard right rail from REAL rows
 * (never stored booleans). Respects the `organization.onboardingStep === 99`
 * dismissal sentinel so a dismissed wizard doesn't resurrect.
 *
 * Fail-soft: returns the all-incomplete checklist on any error.
 */
export async function getSetupState(orgId: string): Promise<SetupState> {
  let dismissed = false;
  let hasGoogle = false;
  let requestsSent = 0;
  let repliedCount = 0;
  let activeConnections = 0;
  let hasTeam = false;

  try {
    const data = await withTenant(orgId, async (tx) => {
      const [
        org,
        googleConn,
        otherConn,
        requests,
        replies,
        memberships,
      ] = await Promise.all([
        tx.organization.findUnique({ where: { id: orgId }, select: { onboardingStep: true } }),
        tx.connection.count({ where: { provider: "google_business", status: "active" } }),
        tx.connection.count({ where: { status: "active" } }),
        tx.reviewRequest.count(),
        tx.reviewReply.count({
          where: { OR: [{ status: "published" }, { approvedBy: { not: null } }] },
        }),
        tx.membership.count(),
      ]);
      return { org, googleConn, otherConn, requests, replies, memberships };
    });
    dismissed = data.org?.onboardingStep === 99;
    hasGoogle = data.googleConn > 0;
    activeConnections = data.otherConn;
    requestsSent = data.requests;
    repliedCount = data.replies;
    hasTeam = data.memberships > 1;
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "dashboard.setup.failed",
    });
  }

  const steps: SetupStep[] = [
    { key: "google", label: "Connect Google Business Profile", done: hasGoogle, href: "/connections" },
    { key: "requests", label: "Send your first review request", done: requestsSent > 0, href: "/outreach/send" },
    { key: "ai-reply", label: "Approve an AI-drafted reply", done: repliedCount > 0, href: "/reviews" },
    { key: "social", label: "Add a social account", done: activeConnections > 1, href: "/connections" },
    { key: "team", label: "Invite a team member", done: hasTeam, href: "/settings/team" },
  ];
  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  return { steps, completed, total, pct, dismissed };
}
