import { withTenant } from "@/lib/db/with-tenant";

export type ReviewFilter = {
  establishmentId?: string;
  rating?: number;
  hasReply?: boolean;
  search?: string;
  limit?: number;
};

export async function listReviews(orgId: string, filter: ReviewFilter = {}) {
  const limit = Math.min(filter.limit ?? 50, 100);
  return withTenant(orgId, async (tx) => {
    return tx.review.findMany({
      where: {
        ...(filter.establishmentId && { establishmentId: filter.establishmentId }),
        ...(filter.rating && { rating: filter.rating }),
        ...(filter.hasReply === true && { reply: { isNot: null } }),
        ...(filter.hasReply === false && { reply: null }),
        ...(filter.search && {
          body: { contains: filter.search, mode: "insensitive" },
        }),
      },
      orderBy: { postedAt: "desc" },
      take: limit,
      include: {
        establishment: { select: { id: true, name: true, googlePlaceId: true } },
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
