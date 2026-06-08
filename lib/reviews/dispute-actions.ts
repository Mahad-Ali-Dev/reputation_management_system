"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { assertEntitled } from "@/lib/billing/entitlements";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { draftDisputeArgument } from "./dispute-argument";
import { legacyReasonFor, VIOLATION_VALUES, type ViolationType } from "./dispute-meta";

/** Postgres error codes for the pre-migration window (see modules/08_dispute.md). */
function isPreMigrationError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42703" /* undefined_column */ || code === "23514" /* check_violation */;
}

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

/* ===========================================================================
 * Dispute Center wizard (Module 08) — new actions alongside the legacy two
 * above. These use requireRole("manager") (content write) per the RBAC
 * convention; the legacy actions are left on requireOrg to avoid regressions.
 * ======================================================================== */

const PrepareSchema = z.object({
  reviewId: z.string().uuid(),
  violationType: z.enum(VIOLATION_VALUES),
  argument: z.string().min(1).max(8000),
});

/**
 * Prepare (draft) a dispute from the wizard. Persists status "submitted"
 * (= Pending) with the precise `violationType` AND the dual-written legacy
 * `reason`, then redirects to the Ready-to-Send screen. Re-opens a
 * withdrawn/rejected row; throws a friendly error if an active dispute exists
 * (mirrors fileReviewDispute's guard). The wizard's Step 1 picker already
 * excludes reviews with an open dispute, so the collision is rare.
 *
 * NOTE: NOT gated by assertEntitled — saving a dispute is free; only the AI
 * draft (draftDisputeArgumentAction) spends. A lapsed plan can still file.
 */
export async function prepareDispute(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  const parsed = PrepareSchema.safeParse({
    reviewId: form.get("reviewId"),
    violationType: form.get("violationType"),
    argument: form.get("argument"),
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { reviewId, violationType, argument } = parsed.data;
  const legacyReason = legacyReasonFor(violationType as ViolationType);

  let disputeId = "";
  await withTenant(orgId, async (tx) => {
    const review = await tx.review.findFirst({
      where: { id: reviewId },
      select: { id: true, source: true, externalId: true, rating: true },
    });
    if (!review) throw new Error("Review not found");

    const existing = await tx.reviewDispute.findUnique({ where: { reviewId } });
    if (existing && existing.status !== "withdrawn" && existing.status !== "rejected") {
      throw new Error(
        `A dispute is already open for this review (status: ${existing.status}). Withdraw it first if you want to re-file.`,
      );
    }

    // Full write incl. the new violation_type column. On an un-migrated DB this
    // throws 42703/23514 → degrade to a legacy-shaped write so the flow never
    // 500s in the pre-migration window.
    const fullCreate = {
      reviewId,
      organizationId: orgId,
      reason: legacyReason,
      violationType,
      details: argument,
      status: "submitted",
      submittedBy: userId,
      resolvedAt: null,
      filedAt: null,
      decisionAt: null,
      submittedToProviderAt: null,
    };
    const fullUpdate = {
      reason: legacyReason,
      violationType,
      details: argument,
      status: "submitted",
      submittedBy: userId,
      resolvedAt: null,
      filedAt: null,
      decisionAt: null,
    };
    const legacyCreate = {
      reviewId,
      organizationId: orgId,
      reason: legacyReason,
      details: argument,
      status: "submitted",
      submittedBy: userId,
      resolvedAt: null,
    };
    const legacyUpdate = {
      reason: legacyReason,
      details: argument,
      status: "submitted",
      submittedBy: userId,
      resolvedAt: null,
    };

    try {
      if (existing) {
        const row = await tx.reviewDispute.update({ where: { id: existing.id }, data: fullUpdate });
        disputeId = row.id;
      } else {
        const row = await tx.reviewDispute.create({ data: fullCreate });
        disputeId = row.id;
      }
    } catch (err) {
      if (!isPreMigrationError(err)) throw err;
      logger.warn(
        { event: "dispute.prepare.pre_migration_fallback", orgId },
        "review_disputes is missing violation_type/new columns — run the dispute_center migration. Writing legacy-shaped dispute.",
      );
      if (existing) {
        const row = await tx.reviewDispute.update({ where: { id: existing.id }, data: legacyUpdate });
        disputeId = row.id;
      } else {
        const row = await tx.reviewDispute.create({ data: legacyCreate });
        disputeId = row.id;
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "review.dispute.prepared",
        resourceType: "review_dispute",
        resourceId: disputeId,
        afterData: {
          violationType,
          reason: legacyReason,
          source: review.source,
          externalId: review.externalId,
          rating: review.rating,
        },
      },
    });
  });

  logger.info(
    { event: "review.dispute.prepared", orgId, reviewId, violationType },
    "review dispute prepared",
  );

  revalidatePath("/reviews/dispute");
  redirect(`/reviews/dispute/${disputeId}/ready`);
}

const MarkFiledSchema = z.object({ disputeId: z.string().uuid() });

/**
 * Mark a prepared dispute as filed with Google (the user emailed Google from
 * their own account). Sets status "submitted_to_google" (= Under Review) and
 * stamps `filedAt` for the timeline. Idempotent. We do NOT auto-submit to
 * Google — the user files manually (spec compliance flag).
 */
export async function markDisputeFiled(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const parsed = MarkFiledSchema.safeParse({ disputeId: form.get("disputeId") });
  if (!parsed.success) throw new Error("Invalid dispute id");
  const { disputeId } = parsed.data;

  await withTenant(orgId, async (tx) => {
    const dispute = await tx.reviewDispute.findFirst({ where: { id: disputeId } });
    if (!dispute) throw new Error("Dispute not found");
    if (dispute.status === "submitted_to_google") return; // idempotent

    try {
      await tx.reviewDispute.update({
        where: { id: disputeId },
        data: { status: "submitted_to_google", filedAt: new Date(), submittedToProviderAt: new Date() },
      });
    } catch (err) {
      if (!isPreMigrationError(err)) throw err;
      logger.warn(
        { event: "dispute.mark_filed.pre_migration_fallback", orgId },
        "review_disputes missing filed_at — run the dispute_center migration. Updating status only.",
      );
      await tx.reviewDispute.update({
        where: { id: disputeId },
        data: { status: "submitted_to_google", submittedToProviderAt: new Date() },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "review.dispute.filed_external",
        resourceType: "review_dispute",
        resourceId: disputeId,
      },
    });
  });

  logger.info({ event: "review.dispute.filed_external", orgId, disputeId }, "dispute marked filed");

  revalidatePath("/reviews/dispute");
  redirect("/reviews/dispute");
}

const ArgumentSchema = z.object({
  reviewId: z.string().uuid(),
  violationType: z.enum(VIOLATION_VALUES),
  avoidText: z.string().max(8000).optional(),
});

/**
 * Draft / regenerate the AI dispute argument for the wizard's Step 3 island.
 * Gated by requireRole("manager") + assertEntitled (paid AI spend). Returns the
 * argument text + KB-grounding signal to the client; throws PlanInactiveError /
 * AiBudgetError / ForbiddenError which the island surfaces.
 */
export async function draftDisputeArgumentAction(args: {
  reviewId: string;
  violationType: string;
  avoidText?: string;
}): Promise<{ argument: string; kbChunksUsed: number }> {
  const { orgId } = await requireRole("manager");
  await assertEntitled(orgId);

  const parsed = ArgumentSchema.safeParse(args);
  if (!parsed.success) throw new Error("Invalid argument request");
  const { reviewId, violationType, avoidText } = parsed.data;

  const review = await withTenant(orgId, async (tx) =>
    tx.review.findFirst({
      where: { id: reviewId },
      select: { id: true, rating: true, body: true, reviewerName: true, establishmentId: true },
    }),
  );
  if (!review) throw new Error("Review not found");

  const result = await draftDisputeArgument({
    orgId,
    establishmentId: review.establishmentId,
    reviewBody: review.body,
    reviewerName: review.reviewerName,
    rating: review.rating,
    violationType: violationType as ViolationType,
    avoidTexts: avoidText ? [avoidText] : undefined,
  });

  return { argument: result.argument, kbChunksUsed: result.kbChunksUsed };
}

/** Regenerate alias — threads the prior text into the avoid fence. */
export async function regenerateDisputeArgumentAction(args: {
  reviewId: string;
  violationType: string;
  previousText: string;
}): Promise<{ argument: string; kbChunksUsed: number }> {
  return draftDisputeArgumentAction({
    reviewId: args.reviewId,
    violationType: args.violationType,
    avoidText: args.previousText,
  });
}
