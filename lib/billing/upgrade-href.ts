import type { FeatureKey } from "@/lib/billing/feature-access";

/**
 * Canonical upgrade route for any locked affordance.
 *
 * Pure, server-safe helper. It lives here (not in components/pro-gate.tsx, which
 * is a "use client" module) so SERVER components — e.g. the hardware next-step
 * banner and analytics gates — can call it during render without tripping
 * "Attempted to call upgradeHref() from the server but it's on the client".
 */
export function upgradeHref(feature?: FeatureKey | string): string {
  return feature ? `/subscription?feature=${encodeURIComponent(feature)}` : "/subscription";
}
