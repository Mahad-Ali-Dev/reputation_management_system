"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

const DisputeSchema = z.object({
  reviewId: z.string().uuid(),
  reason: z.enum(["fake", "offensive", "conflict_of_interest", "wrong_business", "other"]),
  details: z.string().max(2000).optional(),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

/**
 * File a dispute on a review.
 *
 * v1: dispute is stored locally and surfaced in the admin queue. Real submission
 * to Google's review-flag endpoint happens in a follow-up worker (admin-triggered)
 * because the GBP API call requires the connection token + place_id, which we
 * already have stored — we just don't auto-submit on user click to avoid spam.
 */
export async function fileReviewDispute(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();

  const parsed = DisputeSchema.safeParse({
    reviewId: form.get("reviewId"),
    reason: form.get("reason"),
    details: form.get("details") || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { reviewId, reason, details } = parsed.data;

  await withTenant(orgId, async (tx) => {
    // Verify review belongs to this org (RLS enforces this, defense-in-depth)
    const review = await tx.review.findFirst({
      where: { id: reviewId },
      select: { id: true, source: true, externalId: true, rating: true },
    });
    if (!review) throw new Error("Review not found");

    // Unique constraint on review_id — if a dispute exists, update it
    const existing = await tx.reviewDispute.findUnique({
      where: { reviewId },
    });

    if (existing) {
      if (existing.status === "withdrawn") {
        // Re-open a withdrawn dispute
        await tx.reviewDispute.update({
          where: { id: existing.id },
          data: {
            reason,
            details: details ?? null,
            status: "submitted",
            submittedBy: userId,
            resolvedAt: null,
          },
        });
      } else {
        throw new Error(
          `A dispute is already open for this review (status: ${existing.status}). Withdraw it first if you want to file a new one.`,
        );
      }
    } else {
      await tx.reviewDispute.create({
        data: {
          reviewId,
          organizationId: orgId,
          reason,
          details: details ?? null,
          status: "submitted",
          submittedBy: userId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "review.dispute.filed",
        resourceType: "review",
        resourceId: reviewId,
        afterData: { reason, source: review.source, externalId: review.externalId, rating: review.rating },
      },
    });
  });

  logger.info(
    { event: "review.dispute.filed", orgId, reviewId, reason },
    "review dispute filed",
  );

  revalidatePath(`/reviews/${reviewId}`);
  revalidatePath("/reviews");
}

export async function withdrawReviewDispute(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const reviewId = z.string().uuid().parse(form.get("reviewId"));

  await withTenant(orgId, async (tx) => {
    const dispute = await tx.reviewDispute.findUnique({
      where: { reviewId },
    });
    if (!dispute) throw new Error("No dispute on this review.");
    if (dispute.status === "accepted" || dispute.status === "rejected") {
      throw new Error("This dispute is already resolved by the provider — cannot withdraw.");
    }

    await tx.reviewDispute.update({
      where: { id: dispute.id },
      data: { status: "withdrawn", resolvedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "review.dispute.withdrawn",
        resourceType: "review_dispute",
        resourceId: dispute.id,
      },
    });
  });

  revalidatePath(`/reviews/${reviewId}`);
  revalidatePath("/reviews");
}
