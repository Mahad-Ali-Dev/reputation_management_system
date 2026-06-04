import { prisma } from "@/lib/db/client";

/**
 * Plan entitlements — the single source of truth for "may this org use paid
 * features right now?".
 *
 * Canonical values stored on `organizations.plan`:
 *   trial      — inside the free-trial window (gated by `trialEndsAt`)
 *   pro        — active paid subscription (Stripe `active` / `trialing`)
 *   past_due   — payment failed; access suspended pending recovery
 *   suspended  — admin- or system-suspended
 *   free       — no active subscription (canceled / never subscribed)
 *
 * Writers should map to these (the Stripe webhook + admin actions). Readers
 * that gate behavior MUST go through the helpers here rather than comparing
 * `plan` strings ad hoc — that drift is what let lapsed orgs keep paid access.
 */
export const PLAN = {
  TRIAL: "trial",
  PRO: "pro",
  PAST_DUE: "past_due",
  SUSPENDED: "suspended",
  FREE: "free",
} as const;

export type Plan = (typeof PLAN)[keyof typeof PLAN];

/**
 * Whether a plan grants access to paid features. Active subscription always
 * does; a trial does until it expires; everything else (past_due, suspended,
 * free, canceled, or any unknown value) does not.
 */
export function planAllowsPaidFeatures(plan: string, trialEndsAt: Date | null): boolean {
  if (plan === PLAN.PRO) return true;
  if (plan === PLAN.TRIAL) return trialEndsAt === null || trialEndsAt.getTime() > Date.now();
  return false;
}

/** Thrown by `assertEntitled` when the org's plan does not include a feature. */
export class PlanInactiveError extends Error {
  readonly code = "plan_inactive";
  constructor(public readonly plan: string) {
    super(`plan_inactive: this workspace's plan (${plan}) does not include this feature`);
    this.name = "PlanInactiveError";
  }
}

async function loadPlan(orgId: string): Promise<{ plan: string; trialEndsAt: Date | null } | null> {
  // Reads the caller's OWN org by verified session orgId — the documented
  // auth-domain exception to the withTenant rule.
  return prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true, trialEndsAt: true },
  });
}

/** Returns whether the org may use paid features right now (no throw). */
export async function isOrgEntitled(orgId: string): Promise<boolean> {
  const org = await loadPlan(orgId);
  if (!org) return false;
  return planAllowsPaidFeatures(org.plan, org.trialEndsAt);
}

/**
 * Throw `PlanInactiveError` if the org may not use paid features. Call at the
 * top of paid server actions (outreach, AI, phone) and paid API routes.
 */
export async function assertEntitled(orgId: string): Promise<void> {
  const org = await loadPlan(orgId);
  if (!org || !planAllowsPaidFeatures(org.plan, org.trialEndsAt)) {
    throw new PlanInactiveError(org?.plan ?? "unknown");
  }
}
