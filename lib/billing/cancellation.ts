"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

const CancelSchema = z.object({
  reason: z.enum([
    "too_expensive",
    "missing_feature",
    "switching_provider",
    "not_using_enough",
    "business_closing",
    "other",
  ]),
  notes: z.string().max(2000).optional(),
  refundRequested: z.coerce.boolean().optional(),
});

/**
 * Submit a subscription cancellation request.
 *
 * This DOES NOT immediately cancel the Stripe subscription — instead it
 * records the request as an `audit_log` entry of type
 * `subscription.cancel_requested` plus an in-app notification, and our team
 * processes it (verifies refund eligibility, schedules end-of-period
 * cancellation, follows up on retention).
 *
 * The customer sees an instant confirmation in the UI; the heavy lifting
 * happens async in admin.
 */
export async function requestCancellation(form: FormData): Promise<void> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");

  const parsed = CancelSchema.safeParse({
    reason: form.get("reason"),
    notes: (form.get("notes") as string) || undefined,
    refundRequested: form.get("refundRequested") === "on",
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  await withTenant(orgId, async (tx) => {
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "subscription.cancel_requested",
        resourceType: "subscription",
        resourceId: orgId,
        afterData: {
          reason: parsed.data.reason,
          notes: parsed.data.notes ?? null,
          refundRequested: !!parsed.data.refundRequested,
          submittedAt: new Date().toISOString(),
        },
      },
    });
    // Surface in the bell — owners + admins will see it land in their queue.
    await tx.notification.create({
      data: {
        organizationId: orgId,
        userId: null,
        type: "billing.cancel_requested",
        title: "Cancellation request received",
        body: "Our team will reach out within 1 business day to process your cancellation.",
        resourceType: "subscription",
        resourceId: orgId,
      },
    });
  });

  logger.info(
    {
      event: "billing.cancel_requested",
      orgId,
      userId,
      reason: parsed.data.reason,
      refundRequested: !!parsed.data.refundRequested,
    },
    "subscription cancellation requested — admin queue",
  );

  revalidatePath("/subscription");
  redirect("/subscription?cancel=submitted");
}
