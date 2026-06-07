import { Icon } from "@/components/shell/icon";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { getAutomationRule } from "@/lib/outreach/automation";
import Link from "next/link";
import { AutomationForm } from "./automation-form";

/**
 * Automation Rules panel (server). Loads:
 *   - entitlement (Pro gate — sends incur cost),
 *   - active connections (to gate the trigger picker / show a connect CTA),
 *   - the existing after_purchase rule (fail-soft if the table isn't migrated),
 *   - templates for the optional template picker.
 *
 * Non-Pro orgs see an upsell instead of the form (mirrors the entitlement gate
 * the send paths already enforce).
 */
export async function AutomationTab({ orgId }: { orgId: string }) {
  const [entitled, data] = await Promise.all([
    isOrgEntitled(orgId),
    withTenant(orgId, async (tx) => {
      const [connections, templates] = await Promise.all([
        tx.connection
          .findMany({
            where: { status: "active" },
            select: { provider: true },
          })
          .catch(() => [] as { provider: string }[]),
        tx.outreachTemplate
          .findMany({ select: { id: true, name: true, channel: true }, orderBy: { name: "asc" } })
          .catch(() => [] as { id: string; name: string; channel: string }[]),
      ]);
      return { connections, templates };
    }),
  ]);

  if (!entitled) {
    return (
      <div className="ds-card" style={{ padding: 32, textAlign: "center" }}>
        <Icon name="bolt" size={28} style={{ color: "var(--pri)", marginBottom: 10 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>
          Automation is a Pro feature
        </div>
        <p
          className="dim"
          style={{ marginTop: 6, marginBottom: 16, fontSize: 13, maxWidth: 440, marginInline: "auto" }}
        >
          Upgrade to automatically request reviews after every purchase or appointment — with delay
          timing and per-customer frequency caps.
        </p>
        <Link href="/subscription" className="btn btn--pri">
          Upgrade to Pro
        </Link>
      </div>
    );
  }

  const connectedProviders = Array.from(new Set(data.connections.map((c) => c.provider)));
  // Surface the post_purchase rule by default (the most common automation).
  const rule = await getAutomationRule(orgId, "post_purchase");

  return (
    <AutomationForm rule={rule} connectedProviders={connectedProviders} templates={data.templates} />
  );
}
