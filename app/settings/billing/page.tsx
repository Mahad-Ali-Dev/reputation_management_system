import { Icon } from "@/components/shell/icon";
import { getOrgContext } from "@/lib/auth/org-context";
import { prisma } from "@/lib/db/client";
import Link from "next/link";
import { DisplayRow } from "../_components/fields";
import { prettyPlan } from "../_lib/sections";

/**
 * Billing settings — a summary of the current plan + subscription, with the
 * full plan-picker / Stripe checkout + portal flows living on /subscription.
 * Deliberately does NOT duplicate the Stripe action wiring; it links out so
 * there's one source of truth for billing mutations.
 */
export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const { orgId, userEmail } = await getOrgContext();

  // Mirror the /subscription page's read: plan + linked subscription row.
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { subscription: true },
  });

  const plan = (org?.plan as "standard" | "pro" | "scale" | "trial") ?? "trial";
  const isPro = plan === "pro" || plan === "scale";
  const billingEmail = org?.ownerEmail ?? userEmail ?? "—";
  const renewsAt = org?.subscription?.currentPeriodEnd ?? null;
  const status = org?.subscription?.status ?? (isPro ? "active" : "none");

  return (
    <section className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Billing</h3>
          <div className="ds-card__sub">Your plan, renewal and billing contact</div>
        </div>
        <Link href="/subscription" className="btn btn--sm btn--pri" style={{ textDecoration: "none" }}>
          <Icon name="card" size={12} />
          {isPro ? "Manage plan" : "View plans"}
        </Link>
      </div>
      <div className="ds-card__body">
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            padding: 14,
            borderRadius: 10,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            marginBottom: 16,
          }}
        >
          <div className="row" style={{ gap: 12 }}>
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--pri-50)",
                color: "var(--pri)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="card" size={18} />
            </span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{prettyPlan(plan)} plan</div>
              <div className="dim" style={{ fontSize: 12 }}>
                {isPro
                  ? "Billed via Stripe · per location"
                  : "Free forever on Standard — upgrade when reviews roll in"}
              </div>
            </div>
          </div>
          <span className={`chip ${isPro ? "chip--ok" : "chip--out"}`}>
            {status === "active" || isPro ? "Active" : "No subscription"}
          </span>
        </div>

        <div className="grid-2" style={{ gap: 12 }}>
          <DisplayRow l="Plan" v={prettyPlan(plan)} />
          <DisplayRow
            l="Renews"
            v={
              renewsAt
                ? renewsAt.toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : isPro
                  ? "—"
                  : "No active subscription"
            }
          />
          <DisplayRow l="Billing email" v={billingEmail} />
          <DisplayRow l="Status" v={status === "none" ? "Free plan" : prettyPlan(status)} />
        </div>

        <div className="divider" />

        <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
          <p className="dim" style={{ fontSize: 12.5, margin: 0, maxWidth: 460 }}>
            Manage your plan, payment method, invoices and cancellations on the full billing page.
          </p>
          <Link href="/subscription" className="btn btn--sm" style={{ textDecoration: "none" }}>
            Open billing
            <Icon name="arrowR" size={12} />
          </Link>
        </div>
      </div>
    </section>
  );
}
