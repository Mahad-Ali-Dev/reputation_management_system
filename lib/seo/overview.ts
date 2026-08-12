import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { getConnectedProviders } from "@/lib/connections/status";
import {
  computeReputationScore,
  type ReputationScoreInput,
  type ScoreFactor,
} from "./reputation-score";
import { getSeoSnapshotLatest, getGa4Summary } from "./queries";
import { ga4CredsConfigured } from "./adapters/ga4";
import { rankTrackerConfigured } from "./adapters/rank-tracker";

/**
 * Overview metrics assembler (Module 13).
 *
 * `buildOverviewMetrics(orgId, rangeDays)` is the single source for the Overview
 * tab's cross-functional cards AND the inputs the reputation score / exec
 * summary consume. The reputation aggregates here are the SAME Prisma calls
 * previously inlined in `app/analytics/page.tsx` — moved here so the page and
 * the score share one query (no duplicate math).
 *
 * Fail-soft: review tables exist today, but the read is still wrapped so a
 * transient error degrades to zeros rather than a 500.
 */

export type DailyCount = { day: string; count: number };
export type RatingBucket = { star: number; count: number };

export type ReputationMetrics = {
  reviewCount: number;
  avgRating: number;
  responseRate: number; // 0..100
  scanCount: number;
  npsScore: number | null;
  conversationCount: number;
  recentReviewVelocity: number; // reviews in the range window
  daysSinceLastReview: number | null;
  reviewsPerDay: DailyCount[];
  ratingBreakdown: RatingBucket[];
};

export type SeoOverviewMetrics = {
  reputationScore: number;
  scoreFactors: ScoreFactor[];
  localPackPosition: number | null;
  websiteSessions: number | null;
};

export type OverviewMetrics = {
  rangeDays: number;
  reputation: ReputationMetrics;
  seo: SeoOverviewMetrics;
  connected: {
    ga4: boolean;
    gbp: boolean;
    rankTracking: boolean;
  };
};

/**
 * Re-exported from lib/date-range so the topbar date pill, the on-page
 * RangeSelector, and this report all coerce `?range=` identically. Kept as a
 * named export here for the existing `@/lib/seo/overview` import sites.
 */
export { normalizeRangeDays as normalizeRange } from "@/lib/date-range";

async function loadReputation(orgId: string, since: Date, now: Date): Promise<ReputationMetrics> {
  try {
    return await withTenant(orgId, async (tx) => {
      const [
        reviewAggregate,
        scanCount,
        replyCount,
        ratingBreakdown,
        reviewsPerDay,
        npsAggregate,
        conversationCount,
        lastReview,
      ] = await Promise.all([
        tx.review.aggregate({
          where: { postedAt: { gte: since } },
          _count: { _all: true },
          _avg: { rating: true },
        }),
        tx.deviceScan.count({ where: { scannedAt: { gte: since } } }),
        tx.reviewReply.count({ where: { status: "published", publishedAt: { gte: since } } }),
        tx.$queryRaw<{ rating: number; n: bigint }[]>`
          SELECT rating, COUNT(*)::bigint AS n
          FROM reviews
          WHERE posted_at >= ${since}
          GROUP BY rating
          ORDER BY rating ASC
        `,
        tx.$queryRaw<{ day: Date; n: bigint }[]>`
          SELECT d::date AS day, COUNT(r.id)::bigint AS n
          FROM generate_series(${since}::timestamp, ${now}::timestamp, '1 day'::interval) AS d
          LEFT JOIN reviews r
            ON DATE_TRUNC('day', r.posted_at) = DATE_TRUNC('day', d)
          GROUP BY d
          ORDER BY d ASC
        `,
        tx.$queryRaw<{ n: bigint; promoters: bigint; detractors: bigint }[]>`
          SELECT
            COUNT(*)::bigint AS n,
            COUNT(*) FILTER (WHERE (sa.value->>'score')::int >= 9)::bigint AS promoters,
            COUNT(*) FILTER (WHERE (sa.value->>'score')::int <= 6)::bigint AS detractors
          FROM survey_answers sa
          JOIN survey_questions sq ON sq.id = sa.question_id
          JOIN survey_responses sr ON sr.id = sa.response_id
          WHERE sq.type = 'nps'
            AND sr.completed_at IS NOT NULL
            AND sr.completed_at >= ${since}
        `,
        tx.aiConversation.count({ where: { createdAt: { gte: since } } }),
        tx.review.findFirst({ orderBy: { postedAt: "desc" }, select: { postedAt: true } }),
      ]);

      const reviewCount = reviewAggregate._count._all ?? 0;
      const avgRating = reviewAggregate._avg.rating ?? 0;
      const responseRate = reviewCount > 0 ? Math.round((replyCount / reviewCount) * 100) : 0;

      const nps = npsAggregate[0] ?? { n: 0n, promoters: 0n, detractors: 0n };
      const npsTotal = Number(nps.n);
      const npsScore =
        npsTotal > 0
          ? Math.round(
              (Number(nps.promoters) / npsTotal) * 100 -
                (Number(nps.detractors) / npsTotal) * 100,
            )
          : null;

      const ratingMap = new Map(ratingBreakdown.map((r) => [Number(r.rating), Number(r.n)]));
      const ratingBuckets: RatingBucket[] = [5, 4, 3, 2, 1].map((star) => ({
        star,
        count: ratingMap.get(star) ?? 0,
      }));

      const reviewsPerDayView: DailyCount[] = reviewsPerDay.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        count: Number(r.n),
      }));

      const daysSinceLastReview = lastReview?.postedAt
        ? Math.floor((now.getTime() - lastReview.postedAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      return {
        reviewCount,
        avgRating: Number(avgRating),
        responseRate,
        scanCount,
        npsScore,
        conversationCount,
        recentReviewVelocity: reviewCount,
        daysSinceLastReview,
        reviewsPerDay: reviewsPerDayView,
        ratingBreakdown: ratingBuckets,
      };
    });
  } catch (err) {
    logger.warn({
      orgId,
      event: "seo.overview.reputation_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      reviewCount: 0,
      avgRating: 0,
      responseRate: 0,
      scanCount: 0,
      npsScore: null,
      conversationCount: 0,
      recentReviewVelocity: 0,
      daysSinceLastReview: null,
      reviewsPerDay: [],
      ratingBreakdown: [5, 4, 3, 2, 1].map((star) => ({ star, count: 0 })),
    };
  }
}

export async function buildOverviewMetrics(
  orgId: string,
  rangeDays: number,
  establishmentId?: string | null,
): Promise<OverviewMetrics> {
  const now = new Date();
  const since = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);

  const [reputation, snapshot, ga4, providers] = await Promise.all([
    loadReputation(orgId, since, now),
    getSeoSnapshotLatest(orgId, establishmentId),
    getGa4Summary(orgId, establishmentId),
    getConnectedProviders(orgId),
  ]);

  // Reputation score: combine the live aggregates with the latest SEO signal
  // (citation consistency + local-pack) from the most recent snapshot factors.
  const scoreInput: ReputationScoreInput = {
    avgRating: reputation.avgRating,
    reviewCount: reputation.reviewCount,
    recentReviewCount: reputation.recentReviewVelocity,
    repliesCount: Math.round((reputation.responseRate / 100) * reputation.reviewCount),
    daysSinceLastReview: reputation.daysSinceLastReview,
    localPackPosition: snapshot?.localPackPosition ?? null,
    citationConsistency: extractCitationConsistency(snapshot?.scoreFactors),
  };
  const { score, factors } = computeReputationScore(scoreInput);

  return {
    rangeDays,
    reputation,
    seo: {
      reputationScore: score,
      scoreFactors: factors,
      localPackPosition: snapshot?.localPackPosition ?? null,
      websiteSessions: snapshot?.websiteSessions ?? null,
    },
    connected: {
      ga4: ga4.connected && ga4CredsConfigured(),
      gbp: providers.has("google_business"),
      rankTracking: rankTrackerConfigured(),
    },
  };
}

/** Pull the citation_consistency fraction out of a stored scoreFactors blob. */
function extractCitationConsistency(scoreFactors: unknown): number | null {
  if (!Array.isArray(scoreFactors)) return null;
  const factor = scoreFactors.find(
    (f): f is ScoreFactor =>
      typeof f === "object" && f != null && (f as ScoreFactor).key === "citation_consistency",
  );
  if (!factor || !factor.available || factor.weight === 0) return null;
  return factor.points / factor.weight;
}
