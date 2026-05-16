"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { generateReply } from "@/lib/ai/generate-reply";
import { classifyReplySafety } from "@/lib/ai/safety-classify";
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

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

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
  const { orgId, userId } = await requireOrg();

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

  await withTenant(orgId, async (tx) => {
    if (review.reply) {
      await tx.reviewReply.update({
        where: { id: review.reply.id },
        data: {
          body: gen.body,
          status: initialStatus,
          generatedBy: gen.model,
        },
      });
    } else {
      await tx.reviewReply.create({
        data: {
          reviewId: review.id,
          organizationId: orgId,
          body: gen.body,
          status: initialStatus,
          generatedBy: gen.model,
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
        afterData: { model: gen.model, status: initialStatus, blocked },
      },
    });
  });

  logger.info(
    { orgId, reviewId, model: gen.model, status: initialStatus, blocked, event: "review.reply.generated" },
    "review reply generated + classified",
  );

  revalidatePath(`/reviews/${reviewId}`);
  revalidatePath("/reviews");
}

/**
 * Server action: publish a draft/pending reply to Google.
 */
export async function publishReply(reviewId: string, editedBody?: string): Promise<void> {
  const { orgId, userId } = await requireOrg();

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
