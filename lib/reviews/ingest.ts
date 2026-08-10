import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { withTenant } from "@/lib/db/with-tenant";
import { dispatchWebhookInBackground } from "@/lib/notifications/webhook";
import type { Prisma } from "@prisma/client";

/**
 * Provider-agnostic review ingest.
 *
 * Normalizes the "write reviews into the tenant" half of a fetch so every
 * source (GBP OAuth, HasData, future providers) produces identical rows,
 * webhooks and contact captures. Upserts on
 * (establishment_id, source, external_id) so re-running a sync is safe.
 *
 * NOTE: lib/reviews/google-fetch.ts still carries its own inline copy of this
 * logic. That path is live and currently blocked on GBP API approval, so it's
 * deliberately left untouched here — converge it once GBP is actually flowing.
 */

export type NormalizedReview = {
  /** Stable per-source id. Becomes Review.externalId. */
  externalId: string;
  reviewerName: string | null;
  /** 1-5. Rows without a usable rating are skipped. */
  rating: number | null;
  body: string | null;
  postedAt: Date;
  /** Original provider payload, stored for debugging/backfill. */
  raw: unknown;
};

export type IngestResult = { fetched: number; inserted: number };

export async function ingestReviews(args: {
  orgId: string;
  establishmentId: string;
  /** Review.source discriminator — e.g. "google". */
  source: string;
  reviews: NormalizedReview[];
  /** Human label for the contact-activity row ("Left a Google review"). */
  activityTitle?: string;
}): Promise<IngestResult> {
  const { orgId, establishmentId, source, reviews } = args;
  const activityTitle = args.activityTitle ?? "Left a review";
  let inserted = 0;

  await withTenant(orgId, async (tx) => {
    for (const r of reviews) {
      if (!r.rating || r.rating < 1 || r.rating > 5) continue;

      const result = await tx.review.upsert({
        where: {
          establishmentId_source_externalId: {
            establishmentId,
            source,
            externalId: r.externalId,
          },
        },
        create: {
          organizationId: orgId,
          establishmentId,
          source,
          externalId: r.externalId,
          reviewerName: r.reviewerName,
          rating: r.rating,
          body: r.body,
          postedAt: r.postedAt,
          raw: r.raw as Prisma.InputJsonValue,
        },
        update: { body: r.body },
      });

      // `fetchedAt` defaults to now() on create, so a fresh timestamp means this
      // row is genuinely new rather than a re-sync of an existing review.
      if (result.fetchedAt.getTime() >= Date.now() - 2000) {
        inserted++;
        // Fire-and-forget + fail-soft: a customer webhook endpoint must never
        // slow or break ingest.
        dispatchWebhookInBackground(orgId, "review.created", {
          reviewId: result.id,
          establishmentId,
          source,
          rating: r.rating,
          reviewerName: r.reviewerName,
          body: r.body,
          postedAt: r.postedAt.toISOString(),
        });
      }

      // Public reviews carry no email/phone, so the contact dedupes on
      // (org, "review", externalId) and records the display name only.
      if (r.reviewerName) {
        captureContactInBackground({
          orgId,
          source: "review",
          externalId: r.externalId,
          name: r.reviewerName,
          establishmentId,
          occurredAt: r.postedAt,
          activity: { title: activityTitle, externalRef: `review:${r.externalId}` },
        });
      }
    }
  });

  return { fetched: reviews.length, inserted };
}
