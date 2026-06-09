/**
 * Cron-context review actions.
 *
 * `lib/reviews/actions.ts` is the user-facing server-actions surface — every
 * function there calls `requireOrg()` which redirects to /login on missing
 * session. That dies in a cron context (no session to redirect from).
 *
 * This module mirrors the publish flow but takes the orgId explicitly and
 * uses an `actor_type='system'` audit trail. We're not just dropping the
 * auth check — we're being explicit that the cron is acting on behalf of
 * the system, not impersonating a user.
 *
 * Intended caller: `publishDueAutoReplies` in lib/auto-reply/executor.ts.
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { dispatchWebhookInBackground } from "@/lib/notifications/webhook";
import { publishReplyToGoogle } from "./google-publish";

/**
 * Publish a previously-drafted reply from a cron context. Returns true
 * on success, false on any failure (including "no reply exists" or
 * "google publish errored"). The caller logs counts; we log per-row
 * errors here.
 *
 * Idempotent: if the reply is already `published`, returns true without
 * re-calling Google.
 */
export async function publishReplyFromCron(
  organizationId: string,
  reviewId: string,
): Promise<boolean> {
  const review = await withTenant(organizationId, async (tx) => {
    return tx.review.findFirst({
      where: { id: reviewId },
      include: {
        reply: true,
        establishment: { select: { id: true, googlePlaceId: true } },
      },
    });
  });

  if (!review) {
    logger.warn(
      { organizationId, reviewId, event: "cron_publish.review_missing" },
      "review missing during cron publish",
    );
    return false;
  }
  if (!review.reply) {
    logger.warn(
      { organizationId, reviewId, event: "cron_publish.no_reply" },
      "no reply row to publish in cron",
    );
    return false;
  }
  if (review.reply.status === "published") {
    return true;
  }
  if (review.reply.status !== "pending_review" && review.reply.status !== "draft") {
    // Reply was failed, manually approved-then-stuck, or some other state.
    // Don't autopublish anything that isn't sitting in a clean draft state.
    return false;
  }

  const bodyToPublish = review.reply.body.trim();
  if (!bodyToPublish) {
    logger.warn(
      { organizationId, reviewId, event: "cron_publish.empty_body" },
      "empty body in cron publish; skipping",
    );
    return false;
  }

  let publishedAt: Date | null = null;
  let publishError: string | null = null;

  if (review.source === "mock") {
    // The mock source is for tests/dev seeding. Treat as success without
    // any external call.
    publishedAt = new Date();
  } else if (review.source === "google") {
    const result = await publishReplyToGoogle({
      orgId: organizationId,
      establishmentId: review.establishment.id,
      externalReviewId: review.externalId,
      body: bodyToPublish,
    });
    if (result.ok) {
      publishedAt = new Date();
    } else {
      publishError = result.error;
    }
  } else {
    // Airbnb / Booking / etc. — we don't have programmatic publish APIs.
    // The host has to copy/paste in the platform UI. Skip cleanly so the
    // cron doesn't keep retrying.
    publishError = `cron_publish_unsupported_for_source:${review.source}`;
  }

  // Hoist the now-narrowed reply id so the closure below doesn't have to
  // re-prove non-nullness — review.reply was guarded with an early return
  // above, but TS narrowing doesn't carry through async function calls.
  const replyId = review.reply.id;

  await withTenant(organizationId, async (tx) => {
    await tx.reviewReply.update({
      where: { id: replyId },
      data: {
        status: publishedAt ? "published" : "failed",
        publishedAt,
        publishError,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorType: "system",
        // Convention: system events use orgId for actorId. The actorType
        // disambiguates this from a real user action.
        actorId: organizationId,
        action: publishedAt ? "review.reply.auto_published" : "review.reply.auto_publish_failed",
        resourceType: "review",
        resourceId: review.id,
        afterData: {
          source: review.source,
          publishedAt: publishedAt?.toISOString() ?? null,
          publishError,
        },
      },
    });
  });

  if (publishError) {
    logger.error(
      {
        organizationId,
        reviewId,
        publishError,
        event: "cron_publish.failed",
      },
      "auto-publish cron failed to publish",
    );
    return false;
  }
  dispatchWebhookInBackground(organizationId, "review.reply_posted", {
    reviewId: review.id,
    replyId,
    source: review.source,
    publishedAt: publishedAt?.toISOString() ?? null,
  });
  logger.info(
    { organizationId, reviewId, event: "cron_publish.ok" },
    "auto-publish cron published reply",
  );
  return true;
}
