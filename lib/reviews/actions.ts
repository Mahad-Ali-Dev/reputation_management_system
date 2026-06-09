"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { generateReply } from "@/lib/ai/generate-reply";
import { classifyReplySafety } from "@/lib/ai/safety-classify";
import { getAutoReply5StarState } from "@/lib/auto-reply/managed-rule";
import { nextScheduledPublishAt } from "@/lib/auto-reply/schedule";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { publishReplyToGoogle } from "./google-publish";

type BrandVoiceJson = {
  tone?: string[];
  banned_words?: string[];
  required_signature?: string;
  example_replies?: Array<{ rating: number; body: string }>;
  persona?: string;
  language?: string;
} | null;

/**
 * Server action: generate an AI reply draft for a review.
 * Runs:
 *   1. generateReply(...) — Anthropic call (Sonnet for ≤3⭐, Haiku otherwise)
 *   2. classifyReplySafety(...) — Haiku structured output verdict
 *   3. Persist `review_replies` row. Status:
 *        - 'pending_review' if any safety flag OR rating ≤ 3 OR establishment.regulated_domain set
 *        - 'draft' otherwise (auto-publish gate handled separately)
 */
export async function generateReplyForReview(reviewId: string): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  // Generating a reply spends AI budget — a paid feature. Gate here so a
  // lapsed plan gets a clean PlanInactiveError (surfaced as an upgrade prompt
  // by the feed draft box) instead of a silent paid call. Mirrors the
  // executor's `isOrgEntitled` check and the AiAssist pipeline.
  await assertEntitled(orgId);

  const review = await withTenant(orgId, async (tx) => {
    return tx.review.findFirst({
      where: { id: reviewId },
      include: {
        establishment: { select: { id: true, name: true, brandVoice: true } },
        reply: true,
      },
    });
  });
  if (!review) throw new Error("review_not_found");

  // Generate
  const gen = await generateReply({
    orgId,
    review: {
      id: review.id,
      rating: review.rating,
      body: review.body,
      reviewerName: review.reviewerName,
    },
    establishment: {
      id: review.establishment.id,
      name: review.establishment.name,
      brandVoice: (review.establishment.brandVoice as BrandVoiceJson) ?? null,
    },
  });

  // Safety classify (mandatory before any reply leaves our system)
  const { blocked } = await classifyReplySafety({
    orgId,
    aiMessageId: gen.aiMessageId,
    candidate: gen.body,
    sourceReview: {
      rating: review.rating,
      body: review.body,
      reviewerName: review.reviewerName,
    },
  });

  const initialStatus = blocked || review.rating <= 3 ? "pending_review" : "draft";

  // Compliance: auto-posting is ONLY ever offered for clean 5★ reviews. When
  // the org's managed 5★ toggle is on and this is a safe 5★ reply, stage it as
  // `pending_review` with a randomized 2–4h `scheduledPublishAt` so the
  // existing publish cron posts it on a human-looking delay. Everything ≤4★
  // (or blocked) stays human-in-the-loop with no schedule.
  let scheduledPublishAt: Date | null = null;
  if (review.rating === 5 && !blocked) {
    const { enabled } = await getAutoReply5StarState(orgId);
    if (enabled) scheduledPublishAt = nextScheduledPublishAt();
  }
  const statusToWrite = scheduledPublishAt ? "pending_review" : initialStatus;

  await withTenant(orgId, async (tx) => {
    if (review.reply) {
      await tx.reviewReply.update({
        where: { id: review.reply.id },
        data: {
          body: gen.body,
          status: statusToWrite,
          generatedBy: gen.model,
          scheduledPublishAt,
        },
      });
    } else {
      await tx.reviewReply.create({
        data: {
          reviewId: review.id,
          organizationId: orgId,
          body: gen.body,
          status: statusToWrite,
          generatedBy: gen.model,
          scheduledPublishAt,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "review.reply.generated",
        resourceType: "review",
        resourceId: review.id,
        afterData: {
          model: gen.model,
          status: statusToWrite,
          blocked,
          scheduledPublishAt: scheduledPublishAt?.toISOString() ?? null,
        },
      },
    });
  });

  logger.info(
    {
      orgId,
      reviewId,
      model: gen.model,
      status: statusToWrite,
      blocked,
      scheduled: scheduledPublishAt !== null,
      event: "review.reply.generated",
    },
    "review reply generated + classified",
  );

  revalidatePath(`/reviews/${reviewId}`);
  revalidatePath("/reviews");
}

/**
 * Server action: publish a draft/pending reply to Google.
 *
 * Schedule-respecting: if the reply carries a future `scheduledPublishAt` (a
 * 5★ auto-publish staged on the randomized 2–4h delay) and the caller did NOT
 * ask to post immediately, we keep it queued (`pending_review` + the existing
 * schedule) so the "posts after a 2–4 hour delay to appear natural" promise
 * stays honest — the publish cron drains it when due. Pass `postNow=true`
 * (the "Post now" affordance) to publish immediately and clear the schedule.
 * Replies with no `scheduledPublishAt` (the ≤4★ human-approved path) publish
 * immediately as before.
 */
export async function publishReply(
  reviewId: string,
  editedBody?: string,
  postNow = false,
): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  const review = await withTenant(orgId, async (tx) => {
    return tx.review.findFirst({
      where: { id: reviewId },
      include: {
        reply: true,
        establishment: { select: { id: true, googlePlaceId: true } },
      },
    });
  });
  if (!review) throw new Error("review_not_found");
  if (!review.reply) throw new Error("no_reply_drafted");

  const bodyToPublish = editedBody?.trim() || review.reply.body;
  if (!bodyToPublish) throw new Error("empty_reply");

  // Honor an active future schedule unless the user explicitly posts now.
  const scheduledAt = review.reply.scheduledPublishAt ?? null;
  if (!postNow && scheduledAt && scheduledAt.getTime() > Date.now()) {
    await withTenant(orgId, async (tx) => {
      await tx.reviewReply.update({
        where: { id: review.reply!.id },
        data: { body: bodyToPublish, status: "pending_review", approvedBy: userId },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "review.reply.scheduled",
          resourceType: "review",
          resourceId: review.id,
          afterData: { scheduledPublishAt: scheduledAt.toISOString() },
        },
      });
    });
    logger.info(
      { orgId, reviewId, scheduledPublishAt: scheduledAt.toISOString(), event: "review.reply.scheduled" },
      "reply approved + kept on its scheduled-publish window",
    );
    revalidatePath(`/reviews/${reviewId}`);
    revalidatePath("/reviews");
    return;
  }

  // Call Google. Mock-source reviews ('mock' source) just skip the external call.
  let publishedAt: Date | null = null;
  let publishError: string | null = null;
  if (review.source === "mock") {
    publishedAt = new Date();
  } else if (review.source === "google") {
    const result = await publishReplyToGoogle({
      orgId,
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
    publishError = `publish_unsupported_for_source: ${review.source}`;
  }

  await withTenant(orgId, async (tx) => {
    await tx.reviewReply.update({
      where: { id: review.reply!.id },
      data: {
        body: bodyToPublish,
        status: publishedAt ? "published" : "failed",
        approvedBy: userId,
        publishedAt,
        publishError,
        // Posting now (or never scheduled) — clear any pending window so the
        // cron can't double-handle this reply.
        scheduledPublishAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: publishedAt ? "review.reply.published" : "review.reply.publish_failed",
        resourceType: "review",
        resourceId: review.id,
        afterData: { source: review.source, publishedAt, publishError },
      },
    });
  });

  if (publishError) {
    logger.error({ orgId, reviewId, publishError, event: "review.reply.publish_failed" });
    throw new Error(publishError);
  }
  logger.info({ orgId, reviewId, event: "review.reply.published" }, "review reply published");

  revalidatePath(`/reviews/${reviewId}`);
  revalidatePath("/reviews");
}
