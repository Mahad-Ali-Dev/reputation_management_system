/**
 * Shared Stripe subscription -> DB sync.
 *
 * This is the single source of truth for mapping a Stripe `Subscription` onto
 * our `subscriptions` row + `organizations.plan` column. Both the Stripe
 * webhook (`app/api/webhooks/stripe/route.ts`) and the sync-on-return path on
 * the dashboard call it, so the two can never drift.
 *
 * Idempotency + ordering:
 *   - The write happens in one transaction so the subscription row and org plan
 *     are never observed inconsistent.
 *   - An ordering check on `stripe_event_created_at` runs INSIDE the transaction
 *     so a stale event (or a racing sync-on-return) can't clobber newer state.
 *     Pass the Stripe event's `created` timestamp as `eventCreatedAt`; for
 *     out-of-band syncs (dashboard return, dev tools) pass `new Date()` so the
 *     freshly-pulled Stripe state wins.
 */
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { stripe } from "@/lib/stripe/client";
import type Stripe from "stripe";

/** Map a Stripe subscription status onto our `organizations.plan` column. */
export function planForStatus(status: Stripe.Subscription.Status): "pro" | "free" | "past_due" {
  if (status === "active" || status === "trialing") return "pro";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "free";
}

/**
 * Upsert the subscription row + mirror the plan onto the org, transactionally
 * and idempotently (with an ordering guard on `eventCreatedAt`).
 *
 * Returns `true` if the write was applied, `false` if it was skipped as stale.
 */
export async function syncSubscriptionFromStripe(
  orgId: string,
  sub: Stripe.Subscription,
  eventCreatedAt: Date,
): Promise<boolean> {
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

  const orgPlan = planForStatus(sub.status);

  return prisma.$transaction(async (tx) => {
    const stored = await tx.subscription.findUnique({
      where: { organizationId: orgId },
      select: { stripeEventCreatedAt: true },
    });
    if (stored?.stripeEventCreatedAt && eventCreatedAt < stored.stripeEventCreatedAt) {
      logger.info(
        { orgId, event: "subscription.sync.stale_event" },
        "skipping out-of-order subscription sync",
      );
      return false;
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
    return true;
  });
}

/**
 * Sync-on-return after Stripe Checkout, idempotent with the webhook.
 *
 * Called from the dashboard when the user lands on
 * `?checkout=success&session_id=...`. It resolves the subscription from Stripe
 * and writes it immediately so the plan reflects Pro without waiting for the
 * async webhook (which may race the redirect or be unregistered in prod).
 *
 * Security: the `sessionId` param is NEVER trusted blindly. We retrieve the
 * session from Stripe and require its `customer` to equal the logged-in org's
 * `stripeCustomerId`; on any mismatch we ignore the param and fall back to
 * listing the org's own subscriptions by its known customer id.
 *
 * Fail-soft: any Stripe error is swallowed (logged) and the function returns
 * the org's current plan so the page renders normally and the webhook can
 * still reconcile later.
 */
export async function syncSubscriptionOnReturn(
  orgId: string,
  stripeCustomerId: string | null,
  sessionId: string | null,
): Promise<void> {
  if (!stripeCustomerId) return;

  try {
    let sub: Stripe.Subscription | null = null;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["subscription"],
      });
      const sessionCustomerId =
        typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
      // Only trust the session if it belongs to THIS org's customer.
      if (sessionCustomerId === stripeCustomerId && session.subscription) {
        sub =
          typeof session.subscription === "string"
            ? await stripe.subscriptions.retrieve(session.subscription)
            : (session.subscription as Stripe.Subscription);
      } else {
        logger.warn(
          { orgId, event: "billing.return.session_mismatch" },
          "checkout session customer did not match org — ignoring session_id",
        );
      }
    }

    // Fallback (or param mismatch): pull the org's own subscriptions by its
    // known customer id — never anything tied to the unverified param.
    if (!sub) {
      const subs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "all",
        limit: 5,
      });
      sub =
        subs.data.find((s) => s.status === "active" || s.status === "trialing") ??
        subs.data[0] ??
        null;
    }

    if (!sub) {
      logger.info(
        { orgId, event: "billing.return.no_subscription" },
        "no subscription found on stripe for org on checkout return",
      );
      return;
    }

    // Out-of-band sync: stamp with `now` so the fresh Stripe state wins the
    // ordering check vs. an older webhook, but a NEWER webhook still wins.
    await syncSubscriptionFromStripe(orgId, sub, new Date());
    logger.info(
      { orgId, status: sub.status, event: "billing.return.synced" },
      "subscription synced on checkout return",
    );
  } catch (err) {
    // Fail-soft: log and let the page render with current state; the webhook
    // remains the durable reconciliation path.
    logger.error(
      { orgId, error: err instanceof Error ? err.message : String(err), event: "billing.return.sync_failed" },
      "sync-on-return failed — falling back to current plan",
    );
  }
}
