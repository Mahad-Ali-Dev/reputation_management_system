/**
 * Single source of truth for plan names, prices, trial length and feature
 * lists — shared by the in-app subscription page and the public /pricing page.
 *
 * WHY THIS EXISTS: the marketing copy and the product had already drifted (specs
 * promised a "30-day free workspace" while the code grants 7 days). Anything a
 * customer is shown about plans must come from here, so a price or trial change
 * is one edit and cannot leave the two surfaces disagreeing.
 */

/** Pro list price, AUD per location per month. */
export const PRO_PRICE_AUD = 79;

/**
 * Free-trial length in days. Must stay in step with the Stripe checkout
 * (`trial_period_days`) and the trial window stamped at signup.
 */
export const TRIAL_DAYS = 7;

export type PlanKey = "standard" | "pro" | "scale";

/** `[label, included]` — `false` renders as a struck-through/greyed row. */
export const PLAN_FEATURES: Record<PlanKey, Array<[string, boolean]>> = {
  standard: [
    ["QR review cards & plaques", true],
    ["Up to 50 review requests / mo", true],
    ["Live Google feed", true],
    ["Basic spam filter", true],
    ["AI-drafted replies", false],
    ["Dispute service", false],
    ["AI phone receptionist", false],
  ],
  pro: [
    ["Unlimited review requests (Email + SMS)", true],
    ["AI-drafted replies in your brand voice", true],
    ["Cross-channel social scheduler", true],
    ["Surveys with AI polish", true],
    ["Premium dispute service", true],
    ["AI phone receptionist – 200 min", true],
    ["Priority support", true],
  ],
  scale: [
    ["SSO + SAML + audit logs", true],
    ["Multi-brand workspaces", true],
    ["Volume API access", true],
    ["Dedicated CSM", true],
    ["Custom voice clone", true],
  ],
};

/** Display metadata for each tier, used by both pricing surfaces. */
export const PLAN_META: Record<
  PlanKey,
  { name: string; price: string; period: string; blurb: string }
> = {
  standard: {
    name: "Standard",
    price: "Free",
    period: "forever",
    blurb: "Everything you need to start collecting reviews from a single location.",
  },
  pro: {
    name: "Pro",
    price: `A$${PRO_PRICE_AUD}`,
    period: "per location · billed monthly",
    blurb:
      "The full reputation engine — AI replies, unlimited requests, and the phone receptionist.",
  },
  scale: {
    name: "Scale",
    price: "Custom",
    period: "talk to us",
    blurb: "For groups and franchises that need SSO, multi-brand workspaces and volume API access.",
  },
};
