import { NextResponse } from "next/server";
import { assertQStashSignature } from "@/lib/jobs/queue";
import { extractLabels } from "@/lib/ai/topic-sentiment";
import { withTenant } from "@/lib/db/with-tenant";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job handler: extract topics + sentiment for a single review.
 *
 * Fan-out version of the batch worker. Enqueue one job per review when a
 * sync completes so backlog clearing scales out.
 */
export async function POST(req: Request) {
  try {
    const payload = await assertQStashSignature(req);
    const { reviewId } = payload as unknown as { reviewId: string };
    if (!reviewId) {
      return NextResponse.json({ error: "missing reviewId" }, { status: 400 });
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, organizationId: true, rating: true, body: true, reviewerName: true },
    });
    if (!review) {
      return NextResponse.json({ error: "review_not_found" }, { status: 404 });
    }
    if (!review.body) {
      // Nothing to classify; mark extracted to avoid re-enqueue
      await withTenant(review.organizationId, async (tx) => {
        await tx.review.update({
          where: { id: review.id },
          data: { topicsExtractedAt: new Date(), sentimentExtractedAt: new Date() },
        });
      });
      return NextResponse.json({ ok: true, skipped: "no_body" });
    }

    const result = await extractLabels({
      rating: review.rating,
      body: review.body,
      reviewerName: review.reviewerName,
    });

    await withTenant(review.organizationId, async (tx) => {
      await tx.review.update({
        where: { id: review.id },
        data: {
          topics: result.topics,
          sentiment: result.sentiment,
          topicsExtractedAt: new Date(),
          sentimentExtractedAt: new Date(),
        },
      });
    });

    logger.info(
      { event: "job.topic-extract.complete", reviewId, topics: result.topics.length, costMicros: result.costMicros },
      "topic-extract job complete",
    );

    return NextResponse.json({ ok: true, topics: result.topics, costMicros: result.costMicros });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "job.topic-extract.failed", error: msg });
    if (msg === "invalid_qstash_signature") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
