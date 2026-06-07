import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { ACTIVE_STATUSES, RESOLVED_STATUSES } from "./dispute-meta";

export async function getReviewDispute(orgId: string, reviewId: string) {
  return withTenant(orgId, async (tx) =>
    tx.reviewDispute.findUnique({
      where: { reviewId },
    }),
  );
}

/**
 * The review fields the dispute surfaces need (snippet + details + ready-to-send).
 *
 * NOTE — manual join, not a Prisma `include`. The frozen Wave-0 schema gives
 * `ReviewDispute` a `review_id` FK at the table level but does NOT declare a
 * Prisma `review` *relation field* on the model (see CODE_RESULT issues), so the
 * generated client exposes no `include: { review }` for ReviewDispute. We instead
 * hydrate the related review in a second tenant-scoped query and attach it. The
 * returned shape is identical to what an `include` would have produced.
 */
const REVIEW_SELECT = {
  id: true,
  reviewerName: true,
  rating: true,
  body: true,
  source: true,
  postedAt: true,
  establishment: { select: { name: true } },
} as const satisfies Prisma.ReviewSelect;

export type DisputeReview = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

/** Fetch the reviews referenced by a set of disputes, keyed by review id. */
async function reviewsByIds(
  tx: Prisma.TransactionClient,
  reviewIds: string[],
): Promise<Map<string, DisputeReview>> {
  const ids = Array.from(new Set(reviewIds));
  if (ids.length === 0) return new Map();
  const reviews = await tx.review.findMany({
    where: { id: { in: ids } },
    select: REVIEW_SELECT,
  });
  return new Map(reviews.map((r) => [r.id, r]));
}

export async function listOpenDisputes(orgId: string, limit = 50) {
  return withTenant(orgId, async (tx) =>
    tx.reviewDispute.findMany({
      where: { status: { in: ["submitted", "submitted_to_google"] } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  );
}

/** A dispute row joined (manually) with its review (for the list tables + details). */
export type DisputeWithReview = Prisma.ReviewDisputeGetPayload<Record<string, never>> & {
  review: DisputeReview | null;
};

/**
 * Disputes for the Active or Resolved tab. The stored-status → tab partition
 * lives in dispute-meta (ACTIVE_STATUSES / RESOLVED_STATUSES) so the mapping is
 * auditable in one place.
 *
 * Fail-soft: on an un-migrated DB the new columns (`violation_type`, etc.) don't
 * exist yet → Postgres 42703. Treat as empty rather than 500-ing the page.
 */
export async function listDisputesByTab(
  orgId: string,
  tab: "active" | "resolved",
  limit = 100,
): Promise<DisputeWithReview[]> {
  try {
    return await withTenant(orgId, async (tx) => {
      const disputes = await tx.reviewDispute.findMany({
        where: { status: { in: tab === "active" ? ACTIVE_STATUSES : RESOLVED_STATUSES } },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      const reviews = await reviewsByIds(
        tx,
        disputes.map((d) => d.reviewId),
      );
      return disputes.map((d) => ({ ...d, review: reviews.get(d.reviewId) ?? null }));
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01" || code === "42703") return [];
    throw err;
  }
}

/** Parallel counts for the four stat cards on the Active tab. */
export async function disputeStatCards(orgId: string): Promise<{
  total: number;
  underReview: number;
  removed: number;
  rejected: number;
}> {
  try {
    return await withTenant(orgId, async (tx) => {
      const [total, underReview, removed, rejected] = await Promise.all([
        tx.reviewDispute.count(),
        tx.reviewDispute.count({ where: { status: "submitted_to_google" } }),
        // Removed counts the new `removed` value AND the legacy `accepted` synonym.
        tx.reviewDispute.count({ where: { status: { in: ["removed", "accepted"] } } }),
        tx.reviewDispute.count({ where: { status: "rejected" } }),
      ]);
      return { total, underReview, removed, rejected };
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01" || code === "42703") {
      return { total: 0, underReview: 0, removed: 0, rejected: 0 };
    }
    throw err;
  }
}

/** A single dispute by id, with its review + establishment name (details page). */
export async function getDisputeById(
  orgId: string,
  id: string,
): Promise<DisputeWithReview | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const dispute = await tx.reviewDispute.findFirst({ where: { id } });
      if (!dispute) return null;
      const review = await tx.review.findFirst({
        where: { id: dispute.reviewId },
        select: REVIEW_SELECT,
      });
      return { ...dispute, review: review ?? null };
    });
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01" || code === "42703") return null;
    throw err;
  }
}

/**
 * Reviews eligible to dispute (wizard Step 1): rating ≤ 3, excluding reviews
 * already in an OPEN dispute (submitted / submitted_to_google), newest first,
 * optionally text-filtered. Resolved/withdrawn reviews remain eligible (you can
 * re-file). Tenant-scoped.
 */
export async function listDisputableReviews(orgId: string, q?: string, limit = 50) {
  const query = (q ?? "").trim();
  return withTenant(orgId, async (tx) => {
    // Reviews currently occupying a dispute slot are excluded from the picker.
    let openReviewIds: string[] = [];
    try {
      const open = await tx.reviewDispute.findMany({
        where: { status: { in: ["submitted", "submitted_to_google"] } },
        select: { reviewId: true },
      });
      openReviewIds = open.map((d) => d.reviewId);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code !== "42P01" && code !== "42703") throw err;
    }

    return tx.review.findMany({
      where: {
        rating: { lte: 3 },
        ...(openReviewIds.length > 0 ? { id: { notIn: openReviewIds } } : {}),
        ...(query ? { body: { contains: query, mode: "insensitive" } } : {}),
      },
      orderBy: { postedAt: "desc" },
      take: limit,
      select: {
        id: true,
        reviewerName: true,
        rating: true,
        body: true,
        source: true,
        postedAt: true,
        establishmentId: true,
        establishment: { select: { name: true } },
      },
    });
  });
}
