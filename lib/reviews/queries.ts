import { withTenant } from "@/lib/db/with-tenant";

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

export type ReviewFilter = {
  establishmentId?: string;
  rating?: number;
  hasReply?: boolean;
  search?: string;
  source?: ReviewSource;
  limit?: number;
};

export async function listReviews(orgId: string, filter: ReviewFilter = {}) {
  const limit = Math.min(filter.limit ?? 50, 100);
  return withTenant(orgId, async (tx) => {
    return tx.review.findMany({
      where: {
        ...(filter.establishmentId && { establishmentId: filter.establishmentId }),
        ...(filter.rating && { rating: filter.rating }),
        ...(filter.source && { source: filter.source }),
        ...(filter.hasReply === true && { reply: { isNot: null } }),
        ...(filter.hasReply === false && { reply: null }),
        ...(filter.search && {
          body: { contains: filter.search, mode: "insensitive" },
        }),
      },
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
          },
        },
      },
    });
  });
}

/**
 * Per-source counts for the past 30 days. Drives the filter chip badges
 * in the reviews inbox ("Airbnb 12", "Google 47").
 */
export async function reviewCountsBySource(orgId: string) {
  return withTenant(orgId, async (tx) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await tx.review.groupBy({
      by: ["source"],
      where: { postedAt: { gte: since } },
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

export async function reviewStats(orgId: string, establishmentId?: string) {
  return withTenant(orgId, async (tx) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where = {
      ...(establishmentId && { establishmentId }),
      postedAt: { gte: since },
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
