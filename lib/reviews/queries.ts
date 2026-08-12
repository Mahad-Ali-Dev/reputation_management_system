import { withTenant } from "@/lib/db/with-tenant";
import { LIVE_ESTABLISHMENT } from "@/lib/reviews/scope";

/** Review sources we know how to render in the inbox. Extend cautiously —
 *  every new source needs (a) a badge in the inbox and (b) a Reply CTA
 *  that knows how to deep-link back to the platform. */
export const REVIEW_SOURCES = [
  "google",
  "facebook",
  "yelp",
  "trustpilot",
  "airbnb",
  "booking_com",
  "internal",
  "mock",
] as const;
export type ReviewSource = (typeof REVIEW_SOURCES)[number];

/**
 * Reply-status discriminator for the feed's status filter pills.
 *   - needs_reply → no reply row at all (the red "Needs Reply" pill)
 *   - replied     → a published reply exists
 *   - draft_ready → a reply is staged (draft | pending_review) awaiting approval
 * `hasReply` is kept for back-compat with the `/reviews/[id]` detail callers.
 */
export type ReplyStatusFilter = "needs_reply" | "replied" | "draft_ready";

export type ReviewFilter = {
  establishmentId?: string;
  rating?: number;
  hasReply?: boolean;
  replyStatus?: ReplyStatusFilter;
  search?: string;
  source?: ReviewSource;
  limit?: number;
  /** Only reviews posted within the last N days (the topbar date pill). */
  sinceDays?: number;
};

/** Start of an N-day window ending now, or undefined for "no window". */
function windowStart(sinceDays?: number): Date | undefined {
  return sinceDays && sinceDays > 0
    ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
    : undefined;
}

/**
 * Translate the high-level filter knobs into the Prisma `where` on `reply`.
 * Shared by `listReviews` and `replyStatusCounts` so the list and its pill
 * badges always agree on what "Replied" / "Needs Reply" mean.
 */
function reviewWhere(filter: ReviewFilter) {
  const since = windowStart(filter.sinceDays);
  return {
    // Exclude reviews whose establishment was soft-deleted — they stay attached
    // for undo but must not appear in feeds or counts.
    ...LIVE_ESTABLISHMENT,
    ...(filter.establishmentId && { establishmentId: filter.establishmentId }),
    ...(filter.rating && { rating: filter.rating }),
    ...(filter.source && { source: filter.source }),
    ...(since && { postedAt: { gte: since } }),
    ...(filter.hasReply === true && { reply: { isNot: null } }),
    ...(filter.hasReply === false && { reply: null }),
    ...(filter.replyStatus === "needs_reply" && { reply: null }),
    ...(filter.replyStatus === "replied" && { reply: { status: "published" } }),
    ...(filter.replyStatus === "draft_ready" && {
      reply: { status: { in: ["draft", "pending_review"] } },
    }),
    ...(filter.search && {
      body: { contains: filter.search, mode: "insensitive" as const },
    }),
  };
}

export async function listReviews(orgId: string, filter: ReviewFilter = {}) {
  const limit = Math.min(filter.limit ?? 50, 100);
  return withTenant(orgId, async (tx) => {
    return tx.review.findMany({
      where: reviewWhere(filter),
      orderBy: { postedAt: "desc" },
      take: limit,
      include: {
        establishment: {
          select: {
            id: true,
            name: true,
            googlePlaceId: true,
            airbnbListingUrl: true,
            bookingcomListingId: true,
            kind: true,
          },
        },
        reply: {
          select: {
            id: true,
            body: true,
            status: true,
            generatedBy: true,
            publishedAt: true,
            scheduledPublishAt: true,
          },
        },
      },
    });
  });
}

export type ReplyStatusCounts = {
  all: number;
  needsReply: number;
  replied: number;
  draftReady: number;
};

/**
 * Counts that drive the status filter pills (esp. the red "Needs Reply"
 * badge). Each count honors the SAME active rating/source/search filters as
 * the list — pass the base filter (without `replyStatus`) so the pills reflect
 * "within what you're currently looking at". Runs the four counts in parallel.
 *
 * Fail-soft: a missing `scheduled_publish_at` column / un-migrated DB never
 * touches these counts (they only read `reply.status`), but we still guard the
 * whole thing so the page renders zeros rather than 500-ing.
 */
export async function replyStatusCounts(
  orgId: string,
  baseFilter: Omit<ReviewFilter, "replyStatus" | "hasReply" | "limit"> = {},
): Promise<ReplyStatusCounts> {
  try {
    return await withTenant(orgId, async (tx) => {
      const [all, needsReply, replied, draftReady] = await Promise.all([
        tx.review.count({ where: reviewWhere(baseFilter) }),
        tx.review.count({ where: reviewWhere({ ...baseFilter, replyStatus: "needs_reply" }) }),
        tx.review.count({ where: reviewWhere({ ...baseFilter, replyStatus: "replied" }) }),
        tx.review.count({ where: reviewWhere({ ...baseFilter, replyStatus: "draft_ready" }) }),
      ]);
      return { all, needsReply, replied, draftReady };
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01" || code === "42703") {
      return { all: 0, needsReply: 0, replied: 0, draftReady: 0 };
    }
    throw err;
  }
}

/**
 * Per-source counts for the selected window (default 30 days). Drives the
 * filter chip badges in the reviews inbox ("Airbnb 12", "Google 47").
 */
export async function reviewCountsBySource(orgId: string, sinceDays = 30) {
  return withTenant(orgId, async (tx) => {
    const since = windowStart(sinceDays);
    const rows = await tx.review.groupBy({
      by: ["source"],
      where: { ...LIVE_ESTABLISHMENT, ...(since && { postedAt: { gte: since } }) },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.source] = r._count._all;
    return counts;
  });
}

export async function getReview(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    return tx.review.findFirst({
      where: { id },
      include: {
        establishment: { select: { id: true, name: true, brandVoice: true, googlePlaceId: true } },
        reply: true,
      },
    });
  });
}

export async function reviewStats(orgId: string, establishmentId?: string, sinceDays = 30) {
  return withTenant(orgId, async (tx) => {
    const since = windowStart(sinceDays);
    const where = {
      ...LIVE_ESTABLISHMENT,
      ...(establishmentId && { establishmentId }),
      ...(since && { postedAt: { gte: since } }),
    };
    const [total, byRating, avgRating] = await Promise.all([
      tx.review.count({ where }),
      tx.review.groupBy({
        by: ["rating"],
        where,
        _count: true,
      }),
      tx.review.aggregate({
        where,
        _avg: { rating: true },
      }),
    ]);
    return { total, byRating, avgRating: avgRating._avg.rating ?? 0 };
  });
}
