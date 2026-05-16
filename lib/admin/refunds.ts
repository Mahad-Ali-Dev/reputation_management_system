"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { stripe } from "@/lib/stripe/client";
import { getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

const RefundSchema = z.object({
  orderId: z.string().uuid(),
  amountCents: z.coerce.number().int().positive().optional(),  // omit = full refund
  reason: z.enum(["requested_by_customer", "duplicate", "fraudulent"]),
  internalNote: z.string().max(500).optional(),
});

/**
 * Issue a Stripe refund against a hardware order. Refunds go through Stripe's
 * `refunds.create` against the original PaymentIntent. We don't currently
 * support refunding subscription invoices from the admin panel — those use
 * Stripe Dashboard or the customer portal.
 *
 * Requires an admin session. Audited with before/after data.
 */
export async function refundHardwareOrder(form: FormData): Promise<void> {
  const adminSession = await getAdminSession();
  if (!adminSession) redirect("/admin/login");
  if (!["super_admin", "finance"].includes(adminSession.role)) {
    throw new Error("forbidden: only super_admin or finance can issue refunds");
  }

  const parsed = RefundSchema.safeParse({
    orderId: form.get("orderId"),
    amountCents: form.get("amountCents") || undefined,
    reason: form.get("reason"),
    internalNote: form.get("internalNote") || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const { orderId, amountCents, reason, internalNote } = parsed.data;

  const order = await prisma.hardwareOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      totalCents: true,
      currency: true,
      stripePaymentIntentId: true,
    },
  });
  if (!order) throw new Error("Order not found");
  if (!order.stripePaymentIntentId) {
    throw new Error("Order has no Stripe PaymentIntent — cannot refund via Stripe.");
  }
  if (amountCents && amountCents > order.totalCents) {
    throw new Error(`Refund amount $${amountCents/100} exceeds order total $${order.totalCents/100}.`);
  }

  // Create refund in Stripe
  let refund;
  try {
    refund = await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount: amountCents ?? undefined,    // omit for full refund
      reason,
      metadata: {
        org_id: order.organizationId,
        order_id: order.id,
        admin_id: adminSession.adminId,
        internal_note: internalNote ?? "",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { event: "admin.refund.stripe_error", orderId, error: msg },
      "Stripe refund failed",
    );
    throw new Error(`Stripe refund failed: ${msg}`);
  }

  // Update order status if fully refunded
  const fullyRefunded = refund.amount === order.totalCents;
  await prisma.hardwareOrder.update({
    where: { id: orderId },
    data: { status: fullyRefunded ? "refunded" : "partially_refunded" },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: order.organizationId,
      actorType: "admin_user",
      actorId: adminSession.adminId,
      action: "hardware_order.refunded",
      resourceType: "hardware_order",
      resourceId: orderId,
      beforeData: { totalCents: order.totalCents, status: order.status },
      afterData: {
        refundId: refund.id,
        refundedCents: refund.amount,
        reason,
        fullyRefunded,
        internalNote,
      },
    },
  });

  logger.info(
    {
      event: "admin.refund.success",
      adminId: adminSession.adminId,
      orderId,
      refundedCents: refund.amount,
      fullyRefunded,
    },
    "refund issued",
  );

  revalidatePath("/admin/fulfillment");
  revalidatePath(`/admin/refunds/${orderId}`);
}
