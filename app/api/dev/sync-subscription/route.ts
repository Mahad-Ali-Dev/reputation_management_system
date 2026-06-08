import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { stripe } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/dev/sync-subscription
 *
 * DEV ONLY: forces a one-shot sync of the current user's org subscription from Stripe.
 * Bypasses webhook idempotency. Use this when:
 *   - The webhook fired but didn't sync (race, error, deleted/replayed event)
 *   - You want to verify the source-of-truth state from Stripe
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled_in_production" }, { status: 403 });
  }

  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { id: true, stripeCustomerId: true },
  });
  if (!org?.stripeCustomerId) {
    return NextResponse.json({ error: "no_stripe_customer" }, { status: 404 });
  }

  // Pull all subscriptions for this customer from Stripe (source of truth)
  const subs = await stripe.subscriptions.list({
    customer: org.stripeCustomerId,
    status: "all",
    limit: 5,
  });

  const active =
    subs.data.find((s) => s.status === "active" || s.status === "trialing") ?? subs.data[0];

  if (!active) {
    return NextResponse.json({
      ok: false,
      reason: "no_subscriptions_on_stripe",
      customerId: org.stripeCustomerId,
    });
  }

  const periodEndUnix =
    (active as unknown as { current_period_end?: number }).current_period_end ??
    (active.items?.data?.[0] as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end ??
    null;

  const data = {
    organizationId: orgId,
    stripeSubscriptionId: active.id,
    plan: active.items.data[0]?.price.id ?? "unknown",
    status: active.status,
    currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
    cancelAtPeriodEnd: active.cancel_at_period_end,
    trialEndsAt: active.trial_end ? new Date(active.trial_end * 1000) : null,
    stripeEventCreatedAt: new Date(),
  };

  await prisma.subscription.upsert({
    where: { organizationId: orgId },
    create: data,
    update: data,
  });

  const orgPlan: "pro" | "free" | "past_due" =
    active.status === "active" || active.status === "trialing"
      ? "pro"
      : active.status === "past_due" || active.status === "unpaid"
        ? "past_due"
        : "free";
  await prisma.organization.update({
    where: { id: orgId },
    data: { plan: orgPlan },
  });

  logger.info(
    { orgId, subscriptionId: active.id, status: active.status, orgPlan, event: "dev.subscription.force_synced" },
    "subscription force-synced from stripe",
  );

  return NextResponse.json({
    ok: true,
    subscriptionId: active.id,
    status: active.status,
    plan: orgPlan,
    trialEndsAt: data.trialEndsAt,
  });
}
