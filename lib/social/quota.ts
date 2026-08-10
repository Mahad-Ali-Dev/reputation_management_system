import { loadPlan, planAllowsPaidFeatures } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";

/**
 * Daily publishing quota for the Post Creator.
 *
 * Counts POSTS PUBLISHED per UTC day, not posts created — drafting and
 * scheduling stay unlimited, and a post that failed to publish never burns
 * quota. A single post counts once no matter how many platforms it targets
 * (one SocialPost row = one post).
 *
 * Enforced at BOTH publish paths — the immediate "Publish now" action and the
 * scheduled cron dispatch — so queueing 50 posts overnight can't bypass the cap.
 */

/** Posts per UTC day, by plan. */
export const POSTS_PER_DAY: Record<string, number> = {
  pro: 7,
  trial: 7, // an active trial gets full Pro behaviour
  scale: 7,
  standard: 0,
  free: 0,
  past_due: 0,
  suspended: 0,
};

/** Fallback for an unrecognized plan string — treat as the paid allowance. */
const DEFAULT_LIMIT = 7;

export function limitForPlan(plan: string | null | undefined): number {
  if (!plan) return 0;
  const v = POSTS_PER_DAY[plan];
  return v === undefined ? DEFAULT_LIMIT : v;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type QuotaState = { used: number; limit: number; remaining: number; allowed: boolean };

/** Read-only quota state — safe for rendering "3 of 7 used today" in the UI. */
export async function getPostQuota(orgId: string, now: Date = new Date()): Promise<QuotaState> {
  const org = await loadPlan(orgId);
  // An in-date trial gets the paid allowance even though `plan` reads "trial",
  // and an EXPIRED trial must not — planAllowsPaidFeatures owns that rule, so
  // defer to it rather than trusting the plan string alone.
  const limit =
    org && planAllowsPaidFeatures(org.plan, org.trialEndsAt)
      ? limitForPlan(org.plan) || DEFAULT_LIMIT
      : 0;
  const used = await withTenant(orgId, (tx) =>
    tx.socialPost.count({
      where: { status: "posted", postedAt: { gte: startOfUtcDay(now) } },
    }),
  );
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, allowed: used < limit };
}
