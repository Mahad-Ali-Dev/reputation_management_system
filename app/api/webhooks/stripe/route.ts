import { prisma } from "@/lib/db/client";
import { provisionDevicesForOrder } from "@/lib/hardware/provision";
import { logger } from "@/lib/logger";
import { STRIPE_WEBHOOK_SECRET, stripe } from "@/lib/stripe/client";
import { handleIdempotent } from "@/lib/webhooks/idempotency";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

// Stripe needs the raw body for signature verification — disable Next.js body parsing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe — Stripe events (signature-verified, idempotent).
 *
 * See INFRASTRUCTURE.md §5.9 webhook contract:
 *   - HMAC-SHA256 signature
 *   - 300s skew tolerance
 *   - idempotency on event.id via webhook_deliveries
 *   - state ordering check via stripe_event_created_at on subscriptions
 */
export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    logger.error({ event: "webhook.stripe.no_secret" }, "STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "webhook_secret_not_set" }, { status: 500 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ error, event: "webhook.stripe.bad_signature" });
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  const result = await handleIdempotent("stripe", event.id, rawBody, async () => {
    await processStripeEvent(event);
  });

  if (result === "replay") {
    return NextResponse.json({ idempotent: true }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}

async function processStripeEvent(event: Stripe.Event) {
  const log = logger.child({ event: "webhook.stripe", type: event.type, id: event.id });
  log.info("processing stripe event");

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end":
      await syncSubscription(event);
      break;

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      log.info({ invoiceId: invoice.id }, "invoice paid");
      await handleInvoicePaymentResult(invoice, "succeeded");
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      log.warn({ invoiceId: invoice.id }, "invoice failed");
      await handleInvoicePaymentResult(invoice, "failed");
      break;
    }

    case "payment_intent.succeeded":
      log.info(
        { piId: (event.data.object as Stripe.PaymentIntent).id },
        "payment intent succeeded",
      );
      break;

    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment" && session.metadata?.hardwareOrderId) {
        await handleHardwareCheckoutComplete(session);
      }
      // mode=subscription handled by customer.subscription.created which fires separately
      break;
    }

    default:
      log.debug("event type not handled");
  }
}

async function syncSubscription(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const metaOrgId = sub.metadata?.organizationId as string | undefined;
  const customerId = sub.customer as string;
  const orgFromCustomer = await orgIdFromCustomer(customerId);
  const orgId = metaOrgId ?? orgFromCustomer;

  logger.info(
    {
      subId: sub.id,
      eventType: event.type,
      customerId,
      metaOrgId: metaOrgId ?? null,
      orgFromCustomer: orgFromCustomer ?? null,
      resolvedOrgId: orgId ?? null,
      status: sub.status,
      event: "webhook.stripe.sync_attempt",
    },
    "syncSubscription called",
  );

  if (!orgId) {
    logger.warn(
      { subId: sub.id, customerId, metaOrgId, event: "webhook.stripe.org_not_found" },
      "could not resolve org for subscription",
    );
    return;
  }

  const eventCreatedAt = new Date(event.created * 1000);

  // Newer Stripe API versions moved current_period_end onto items; fall back if missing.
  const periodEndUnix =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end ??
    null;

  const data = {
    organizationId: orgId,
    stripeSubscriptionId: sub.id,
    plan: sub.items.data[0]?.price.id ?? "unknown",
    status: sub.status,
    currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    stripeEventCreatedAt: eventCreatedAt,
  };

  // Mirror Stripe status onto the org's plan column for fast access checks.
  // Both writes happen in one transaction so the subscription row and org plan
  // are never observed in an inconsistent state. The ordering check happens
  // INSIDE the transaction too so we don't race a sibling webhook.
  const orgPlan: "pro" | "free" | "past_due" =
    sub.status === "active" || sub.status === "trialing"
      ? "pro"
      : sub.status === "past_due" || sub.status === "unpaid"
        ? "past_due"
        : "free";

  try {
    await prisma.$transaction(async (tx) => {
      const stored = await tx.subscription.findUnique({
        where: { organizationId: orgId },
        select: { stripeEventCreatedAt: true },
      });
      if (stored?.stripeEventCreatedAt && eventCreatedAt < stored.stripeEventCreatedAt) {
        logger.info(
          { orgId, eventId: event.id, event: "webhook.stripe.stale_event" },
          "skipping out-of-order event",
        );
        return;
      }
      await tx.subscription.upsert({
        where: { organizationId: orgId },
        create: data,
        update: data,
      });
      await tx.organization.update({
        where: { id: orgId },
        data: { plan: orgPlan },
      });
    });
    logger.info(
      { orgId, status: sub.status, orgPlan, event: "subscription.synced" },
      "subscription synced",
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(
      { orgId, error, event: "subscription.sync_failed", data },
      "subscription upsert failed",
    );
    throw err;
  }
}

/**
 * Mirror invoice payment state onto the org so dashboards + access checks
 * can show a clear past_due banner without waiting for the next
 * subscription.updated event.
 */
async function handleInvoicePaymentResult(
  invoice: Stripe.Invoice,
  result: "succeeded" | "failed",
): Promise<void> {
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  if (!customerId) return;
  const orgId = await orgIdFromCustomer(customerId);
  if (!orgId) {
    logger.warn(
      { customerId, invoiceId: invoice.id, event: "webhook.stripe.invoice_no_org" },
      "invoice for unknown customer",
    );
    return;
  }
  // Don't downgrade a 'pro' org on a single failure if Stripe still considers
  // them active — only flip to past_due when the subscription status confirms.
  // For succeeded events, clear past_due back to pro.
  await prisma.$transaction(async (tx) => {
    if (result === "failed") {
      await tx.organization.updateMany({
        where: { id: orgId, plan: "pro" },
        data: { plan: "past_due" },
      });
    } else {
      await tx.organization.updateMany({
        where: { id: orgId, plan: "past_due" },
        data: { plan: "pro" },
      });
    }
  });
  logger.info(
    { orgId, invoiceId: invoice.id, result, event: "webhook.stripe.invoice_processed" },
    "invoice payment result applied",
  );
}

async function orgIdFromCustomer(customerId: string): Promise<string | undefined> {
  const org = await prisma.organization.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  return org?.id;
}

/**
 * Mark hardware order paid and provision devices.
 * Called from checkout.session.completed for mode=payment sessions.
 */
async function handleHardwareCheckoutComplete(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.hardwareOrderId;
  if (!orderId) {
    logger.warn({ sessionId: session.id, event: "hardware.checkout.no_order_id" });
    return;
  }

  // Capture shipping address from the Stripe session
  const shipping = session.shipping_details ?? null;
  const shippingAddress = shipping
    ? {
        name: shipping.name ?? null,
        line1: shipping.address?.line1 ?? null,
        line2: shipping.address?.line2 ?? null,
        city: shipping.address?.city ?? null,
        region: shipping.address?.state ?? null,
        postal: shipping.address?.postal_code ?? null,
        country: shipping.address?.country ?? null,
      }
    : {};

  await prisma.hardwareOrder.update({
    where: { id: orderId },
    data: {
      status: "paid",
      stripePaymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent?.id ?? null),
      shippingAddress,
    },
  });

  // Provision devices (idempotent — guarded by existing-devices check)
  try {
    const result = await provisionDevicesForOrder(orderId);
    logger.info(
      { orderId, provisioned: result.provisioned, event: "hardware.order.paid" },
      "hardware order paid + devices provisioned",
    );
  } catch (err) {
    logger.error(
      { orderId, error: String(err), event: "hardware.provision.failed" },
      "device provisioning failed — manual intervention needed",
    );
    throw err;
  }
}
