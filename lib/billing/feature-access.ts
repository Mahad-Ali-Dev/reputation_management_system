import { PLAN, isOrgEntitled, planAllowsPaidFeatures } from "@/lib/billing/entitlements";

/**
 * Feature → plan-requirement map + the single source of truth for "which
 * surfaces are Pro".
 *
 * This module deliberately owns **no** entitlement logic of its own. It maps a
 * stable `FeatureKey` to a requirement tier and then DELEGATES the actual
 * "is this plan allowed?" decision to `lib/billing/entitlements.ts`
 * (`planAllowsPaidFeatures` / `isOrgEntitled` / `PLAN`). Forking the plan-string
 * checks here is exactly what re-introduces the 2026-06 entitlement-drift bug,
 * so don't — only add rows to the map.
 *
 * Presentation only: `<ProGate>` and the sidebar padlock use these helpers to
 * decide what to *show*. They are NOT a security boundary. Every paid server
 * action / API route behind a gated feature MUST still call
 * `assertEntitled(orgId)` (and `requireRole` where relevant).
 */

/** Canonical feature keys gated across the app. Extend as modules need. */
export type FeatureKey =
  | "ai_autopilot" // Step 15 reputation autopilot
  | "competitor_intel" // Step 13 SEO/competitor
  | "image_creatives" // Step 10 AI image gen
  | "advanced_inbox" // Step 9 moderation/SMS handoff
  | "surveys_insights" // Step 11 AI insights
  | "rank_tracking"; // Step 13 keyword ranks

/**
 * Requirement tier per feature. v1 is binary (`"paid"` vs not) because the
 * schema's `Subscription.plan` is `pro_monthly|pro_annual` and
 * `Organization.plan` is `trial|pro|past_due|suspended|free`. `"scale"` is
 * reserved for a future higher tier without changing call sites — today it is
 * treated identically to `"paid"` (see `planHasFeature`). Do NOT invent a new
 * plan string for it; that would drift from `entitlements.ts`.
 */
export const FEATURE_REQUIREMENT: Record<FeatureKey, "paid" | "scale"> = {
  ai_autopilot: "paid",
  competitor_intel: "paid",
  image_creatives: "paid",
  advanced_inbox: "paid",
  surveys_insights: "paid",
  rank_tracking: "paid",
};

/** The requirement tier a feature needs (`"paid"` | `"scale"`). */
export function featureRequiresPlan(feature: FeatureKey): "paid" | "scale" {
  return FEATURE_REQUIREMENT[feature];
}

/**
 * Pure helper for when the plan is already loaded (e.g. inside org-context or a
 * server component that already has the org row). Delegates the paid-feature
 * decision to `planAllowsPaidFeatures` — never re-implements it.
 *
 * Both `"paid"` and `"scale"` map to `planAllowsPaidFeatures` for now; when a
 * real "scale" tier exists this is the one place that grows an extra check.
 */
export function planHasFeature(
  plan: string,
  trialEndsAt: Date | null,
  feature: FeatureKey,
): boolean {
  const requirement = FEATURE_REQUIREMENT[feature];
  // v1: both tiers gate on the same paid-feature entitlement.
  // TODO scale tier: when a "scale" plan ships, additionally require
  // plan === PLAN.SCALE (or an env/flag) for `requirement === "scale"`.
  if (requirement === "scale") {
    // Keep referencing PLAN so the intent is explicit and the import is used;
    // until the tier exists, "scale" === "paid".
    void PLAN;
  }
  return planAllowsPaidFeatures(plan, trialEndsAt);
}

/**
 * Server-side check: may this org use `feature` right now? Reuses
 * `isOrgEntitled` (which loads the org's own plan via the documented
 * auth-domain exception and runs `planAllowsPaidFeatures`). Since every v1
 * feature is `"paid"`, this is `isOrgEntitled`; the per-feature indirection
 * exists so adding a `"scale"` tier later is a one-line change here, not at
 * every call site.
 */
export async function orgHasFeature(orgId: string, feature: FeatureKey): Promise<boolean> {
  void feature; // every v1 feature gates on the same paid entitlement
  return isOrgEntitled(orgId);
}

/** Alias matching the prose in the foundation spec (`canUseFeature`). */
export const canUseFeature = orgHasFeature;
