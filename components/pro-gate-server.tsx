import { UpgradeCard } from "@/components/pro-gate";
import { type FeatureKey, orgHasFeature } from "@/lib/billing/feature-access";
import { getOrgContext } from "@/lib/auth/org-context";
import type { ReactNode } from "react";

/**
 * `<ProGateServer>` — server-side whole-page / section gate (A3).
 *
 * Reads the org context (`getOrgContext`) and the feature-access map, then
 * decides ON THE SERVER whether to render `children` (entitled) or the
 * `fallback` (default: an `<UpgradeCard>`). Use this for full-page gates so
 * gated server content is NEVER sent to a Free client — unlike `<ProGate>`
 * (client overlay), which is for already-rendered UI.
 *
 * Entitlement is resolved via `orgHasFeature`, which loads the org's own
 * `plan` + `trialEndsAt` through `entitlements.ts` (the canonical check). We do
 * NOT read `plan` off the org-context row here, because that row does not
 * include `trialEndsAt` and would force a trial-expiry re-implementation —
 * exactly the drift we avoid.
 *
 * Reminder: this is presentation. The paid server action / API route behind the
 * feature must still call `assertEntitled(orgId)`.
 */
export async function ProGateServer({
  feature,
  children,
  fallback,
}: {
  feature: FeatureKey;
  /** Rendered only when entitled. */
  children: ReactNode;
  /** Rendered when not entitled (default: a centered `<UpgradeCard>`). */
  fallback?: ReactNode;
}) {
  const { orgId } = await getOrgContext();
  const hasAccess = await orgHasFeature(orgId, feature);

  if (hasAccess) return <>{children}</>;

  if (fallback !== undefined) return <>{fallback}</>;

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px 16px" }}>
      <UpgradeCard feature={feature} />
    </div>
  );
}
