/**
 * Stripe billing actions — used by both API routes AND server actions.
 *
 * Separating the work here means dashboard server actions can call these directly
 * (no HTTP round-trip, no cookie-forwarding required).
 */
import { withTenant } from "@/lib/db/with-tenant";
import { APP_URL, STRIPE_PRO_PRICE_ID, stripe } from "@/lib/stripe/client";
import { logger } from "@/lib/logger";

/**
 * Returns a Stripe Checkout URL for upgrading the given org to Pro (7-day trial).
 */
export async function createCheckoutSession(orgId: string, userEmail: string): Promise<string> {
  if (!STRIPE_PRO_PRICE_ID) {
    throw new Error("STRIPE_PRO_PRICE_ID not configured");
  }

  const org = await withTenant(orgId, (tx) =>
    tx.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, stripeCustomerId: true },
    }),
  );
  if (!org) throw new Error("org_not_found");

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      name: org.name,
      metadata: { organizationId: org.id },
    });
    customerId = customer.id;
    await withTenant(orgId, (tx) =>
      tx.organization.update({
        where: { id: org.id },
        data: { stripeCustomerId: customerId },
      }),
    );
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { organizationId: org.id },
    },
    metadata: { organizationId: org.id },
    success_url: `${APP_URL}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/dashboard?checkout=canceled`,
    allow_promotion_codes: true,
  });

  if (!checkout.url) throw new Error("stripe_no_checkout_url");

  logger.info(
    { orgId: org.id, sessionId: checkout.id, event: "billing.checkout.created" },
    "stripe checkout session created",
  );

  return checkout.url;
}

/**
 * Returns a Stripe Customer Portal URL for self-serve billing management.
 */
export async function createPortalSession(orgId: string): Promise<string> {
  const org = await withTenant(orgId, (tx) =>
    tx.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    }),
  );
  if (!org?.stripeCustomerId) throw new Error("no_stripe_customer");

  const portal = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${APP_URL}/dashboard`,
  });
  return portal.url;
}
