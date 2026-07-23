import { Icon } from "@/components/shell/icon";
import { getOrgContext } from "@/lib/auth/org-context";
import { PRO_PRICE_AUD } from "@/lib/billing/plans";
import { prisma } from "@/lib/db/client";
import Link from "next/link";
import { SettingsFrame } from "../_components/settings-frame";

/**
 * Billing settings (designs/settings/billing/billing.png).
 *
 * A billing SUMMARY: current-plan card + 4 info tiles + recent activity, sized
 * to the real data model. The full plan-picker / Stripe checkout + portal flows
 * live on /subscription (already redesigned in a prior wave) — this page does
 * NOT duplicate the plans grid or re-wire Stripe; it links out so there's one
 * source of truth for billing mutations.
 *
 * Live-data note: this app has no Invoice model and stores no card details
 * (invoices + payment methods are owned by Stripe, surfaced via the Customer
 * Portal that /subscription opens). So the payment-method tile and invoice
 * history route to Stripe rather than rendering fabricated rows. Plan / status /
 * renewal / billing-email come from the real subscription + org rows.
 */
export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro plan",
  scale: "Scale plan",
  standard: "Standard plan",
  trial: "Free trial",
  free: "Free plan",
  past_due: "Past due",
  suspended: "Suspended",
};

function planName(plan: string): string {
  return PLAN_LABELS[plan] ?? `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;
}

export default async function BillingSettingsPage() {
  const { orgId, userEmail } = await getOrgContext();

  // Mirror the /subscription page's read: plan + linked subscription row.
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { subscription: true },
  });

  const plan = org?.plan ?? "trial";
  const isPro = plan === "pro" || plan === "scale";
  const billingEmail = org?.ownerEmail ?? userEmail ?? "—";
  const renewsAt = org?.subscription?.currentPeriodEnd ?? null;
  const status = org?.subscription?.status ?? (isPro ? "active" : "none");
  const isActive = status === "active" || status === "trialing" || isPro;
  const renewLabel = renewsAt
    ? renewsAt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
    : isPro
      ? "—"
      : "No active subscription";
  const statusLabel = isActive ? "Active" : status === "none" ? "Free plan" : status;
  const priceLabel = isPro ? `A$${PRO_PRICE_AUD}` : "$0";
  const priceSuffix = isPro ? "/ month per location" : plan === "trial" ? "during trial" : "free";

  return (
    <SettingsFrame>
      {/* ── Current plan ────────────────────────────────────────────── */}
      <section className="set-card">
        <h2 className="set-card__title set-card__title--sm" style={{ marginBottom: 18 }}>
          Current plan
        </h2>
        <div className="set-plan-card">
          <div className="set-plan-card__left">
            <span className="set-plan-card__icon">
              <Icon name="card" size={30} style={{ color: "var(--set-indigo)" }} />
            </span>
            <div>
              <div className="set-plan-card__name">
                {planName(plan)}
                <span className={`set-pill ${isActive ? "set-pill--ok" : "set-pill--muted"}`}>
                  {isActive && <span className="set-pill__dot" />}
                  {isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="set-plan-card__price">
                <b>{priceLabel}</b>
                <span>{priceSuffix}</span>
              </div>
              <div className="set-plan-card__billed">
                {isPro ? "Billed via Stripe · Monthly" : "No paid subscription"}
              </div>
            </div>
          </div>

          <div className="set-plan-card__meta">
            <div>
              <div className="set-dl__label">Renewal date</div>
              <div className="set-plan-card__metaval">
                <Icon name="cal" size={15} style={{ color: "var(--set-mut-2)" }} />
                {renewLabel}
              </div>
            </div>
            <div>
              <div className="set-dl__label">Billing email</div>
              <div className="set-plan-card__metaval" style={{ fontWeight: 500 }}>
                <Icon name="mail" size={15} style={{ color: "var(--set-mut-2)" }} />
                {billingEmail}
              </div>
            </div>
            <div>
              <div className="set-dl__label">Status</div>
              <div
                className="set-plan-card__metaval"
                style={{ color: isActive ? "var(--set-emerald-2)" : "var(--set-mut)" }}
              >
                <span
                  className="set-pill__dot"
                  style={{ background: isActive ? "var(--set-emerald)" : "var(--set-mut-2)" }}
                />
                {statusLabel}
              </div>
            </div>
          </div>

          <div className="set-plan-card__actions">
            <Link href="/subscription" className="set-btn set-btn--primary">
              <Icon name="card" size={16} className="set-btn__ic" />
              {isPro ? "Manage plan" : "View plans"}
            </Link>
            <Link href="/subscription" className="set-btn">
              <Icon name="file" size={16} className="set-btn__ic" />
              View invoices
            </Link>
          </div>
        </div>
      </section>

      {/* ── Info tiles ──────────────────────────────────────────────── */}
      <div className="set-tiles">
        <div className="set-infotile">
          <div className="set-infotile__top">
            <span className="set-tile set-tile--sm set-tile--indigo">
              <Icon name="file" size={18} />
            </span>
            <span className="set-infotile__eyebrow">Plan</span>
          </div>
          <div className="set-infotile__val">{planName(plan)}</div>
          <div className="set-infotile__sub">
            {isPro ? "All premium features included" : "Upgrade for premium features"}
          </div>
          <Link href="/subscription" className="set-infotile__link">
            Compare plans →
          </Link>
        </div>

        <div className="set-infotile">
          <div className="set-infotile__top">
            <span className="set-tile set-tile--sm set-tile--violet">
              <Icon name="cal" size={18} />
            </span>
            <span className="set-infotile__eyebrow">Renewal</span>
          </div>
          <div className="set-infotile__val">{renewLabel}</div>
          <div className="set-infotile__sub">
            {isPro ? "Next billing date" : "No renewal scheduled"}
          </div>
          <Link href="/subscription" className="set-infotile__link">
            Manage billing cycle →
          </Link>
        </div>

        <div className="set-infotile">
          <div className="set-infotile__top">
            <span className="set-tile set-tile--sm set-tile--amber">
              <Icon name="card" size={18} />
            </span>
            <span className="set-infotile__eyebrow">Payment method</span>
          </div>
          <div className="set-infotile__val">{isPro ? "Card on file" : "None"}</div>
          <div className="set-infotile__sub">
            {isPro ? "Managed securely in Stripe" : "Add one when you upgrade"}
          </div>
          <Link href="/subscription" className="set-infotile__link">
            Update payment method →
          </Link>
        </div>

        <div className="set-infotile">
          <div className="set-infotile__top">
            <span className="set-tile set-tile--sm set-tile--emerald">
              <Icon name="checkCircle" size={18} />
            </span>
            <span className="set-infotile__eyebrow">Invoice status</span>
          </div>
          <div className="set-infotile__val">{isActive ? "All paid" : "—"}</div>
          <div className="set-infotile__sub">
            {isActive ? "You're up to date" : "No invoices yet"}
          </div>
          <Link href="/subscription" className="set-infotile__link">
            View invoice history →
          </Link>
        </div>
      </div>

      {/* ── Recent billing activity ─────────────────────────────────── */}
      <section className="set-card">
        <div className="set-sec-head" style={{ alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <h2 className="set-card__title set-card__title--sm">Recent billing activity</h2>
          </div>
          <Link href="/subscription" className="set-btn set-btn--sm">
            <Icon name="download" size={15} className="set-btn__ic" />
            Download history
          </Link>
        </div>

        <div
          style={{
            marginTop: 18,
            padding: "28px 20px",
            borderRadius: 12,
            border: "1px solid var(--set-track)",
            background: "#fff",
            textAlign: "center",
          }}
        >
          <p className="set-dim" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>
            {isPro
              ? "Your full invoice history — receipts, amounts and downloads — lives in the Stripe billing portal."
              : "Invoices appear here once you're on a paid plan."}
          </p>
          <Link href="/subscription" className="set-link" style={{ marginTop: 12 }}>
            {isPro ? "Open billing portal" : "View plans"}
            <Icon name="arrowR" size={13} />
          </Link>
        </div>
      </section>
    </SettingsFrame>
  );
}
