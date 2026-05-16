import { AppShellServer } from "@/components/app-shell-server";
import { CancelSubscriptionButton } from "@/components/cancel-subscription";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { auth } from "@/lib/auth/config";
import { getOrgContext } from "@/lib/auth/org-context";
import { createCheckoutSession, createPortalSession } from "@/lib/billing/actions";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { redirect } from "next/navigation";

/**
 * Subscription & plans — repulabs v2 design.
 *
 * Real data: org.plan, subscription, trialEndsAt, usage counts. Billing
 * actions kept on Stripe (createCheckoutSession + createPortalSession) —
 * Shopify-subscription pivot is a future re-platform task, not a same-day
 * rip-and-replace.
 *
 * Usage gauges pulled from real models when available; falls back to "—" for
 * counters we don't track yet.
 */

export const dynamic = "force-dynamic";

const PLAN_FEATURES: Record<"standard" | "pro" | "scale", Array<[string, boolean]>> = {
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
    ["Everything in Standard", true],
    ["Unlimited review requests (Email + SMS)", true],
    ["AI-drafted replies in your brand voice", true],
    ["Cross-channel social scheduler", true],
    ["Surveys with AI polish", true],
    ["Premium dispute service", true],
    ["AI phone receptionist · 200 min", true],
    ["Priority support", true],
  ],
  scale: [
    ["Everything in Pro", true],
    ["SSO + SAML + audit logs", true],
    ["Multi-brand workspaces", true],
    ["Volume API access", true],
    ["Dedicated CSM", true],
    ["Custom voice clone", true],
  ],
};

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ cancel?: string }>;
}) {
  const { orgId, userEmail } = await getOrgContext();
  const params = await searchParams;

  const [org, usage] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      include: { subscription: true },
    }),
    withTenant(orgId, async (tx) => {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [requestsSent, repliesDrafted, surveyResponses, socialPosts] = await Promise.all([
        tx.reviewRequest.count({ where: { sentAt: { gte: since30d } } }),
        tx.reviewReply.count({ where: { createdAt: { gte: since30d } } }),
        tx.surveyResponse.count({ where: { createdAt: { gte: since30d } } }),
        tx.socialPost.count({ where: { createdAt: { gte: since30d } } }),
      ]);
      return { requestsSent, repliesDrafted, surveyResponses, socialPosts };
    }),
  ]);
  if (!org) return null;

  const plan = (org.plan as "standard" | "pro" | "scale") ?? "standard";
  const isPro = plan === "pro" || plan === "scale";

  const billingEmail = org.ownerEmail ?? userEmail ?? "—";
  const renewsAt = org.subscription?.currentPeriodEnd;
  const nextCharge = renewsAt
    ? `${renewsAt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })} · $89.00 USD`
    : org.plan === "pro"
      ? "—"
      : "No active subscription";

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Settings", "Subscription"]}>
      <PageHeader
        kicker={
          plan === "pro" ? "Pro · billed monthly · $89/mo per location" : `${prettyPlan(plan)} plan`
        }
        title="Plans & billing"
        description="Start free, level up when reviews start rolling. No per-seat surprises."
        actions={
          isPro ? (
            <form action={portalAction}>
              <button type="submit" className="btn btn--pri">
                <Icon name="card" size={12} />
                Manage billing
              </button>
            </form>
          ) : (
            <form action={upgradeAction}>
              <button type="submit" className="btn btn--pri">
                <Icon name="arrowUR" size={12} />
                Upgrade to Pro
              </button>
            </form>
          )
        }
      />

      {params.cancel === "submitted" && (
        <div
          className="ds-card"
          style={{
            padding: "12px 16px",
            marginBottom: 16,
            background: "var(--ok-soft, #dcfce7)",
            border: "1px solid var(--ok, #16a34a)",
            color: "var(--ok, #166534)",
            fontSize: 13,
          }}
        >
          <strong>Cancellation request received.</strong> Our billing team will reach out within 1
          business day. Your Pro features stay active until your team confirms the cancellation
          date.
        </div>
      )}

      <div className="row" style={{ justifyContent: "center", marginBottom: 26 }}>
        <div className="seg">
          <button type="button" className="seg__t">
            Monthly
          </button>
          <button type="button" className="seg__t is-active">
            Annual{" "}
            <span className="mono" style={{ color: "var(--ok)", marginLeft: 6 }}>
              −20%
            </span>
          </button>
        </div>
      </div>

      <div className="grid-3" style={{ gap: 16 }}>
        <PlanCard
          name="Standard"
          price="Free"
          period="forever · 1 location"
          // If the user is on Pro, the Standard column shows a "Cancel
          // subscription" CTA that opens a reason form (server action records
          // a cancel request for the billing team to process).
          ctaLabel={plan === "standard" ? "Current plan" : "Downgrade"}
          ctaDisabled={plan === "standard"}
          customCta={isPro ? <CancelSubscriptionButton /> : undefined}
          features={PLAN_FEATURES.standard}
        />
        <PlanCard
          name="Pro"
          badge="MOST POPULAR"
          price="$89"
          priceSuffix="/mo"
          period="per location · billed annually"
          ctaLabel={plan === "pro" ? "Current plan" : "Continue on Pro"}
          ctaActive={plan !== "pro"}
          ctaDisabled={plan === "pro"}
          accent
          isUpgrade={plan !== "pro"}
          features={PLAN_FEATURES.pro}
        />
        <PlanCard
          name="Scale"
          price="Custom"
          period="10+ locations · multi-brand"
          ctaLabel="Talk to sales"
          ctaHref="mailto:sales@repulabs.com"
          features={PLAN_FEATURES.scale}
        />
      </div>

      <div className="grid-2" style={{ gap: 16, marginTop: 26 }}>
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">This month's usage</h3>
            <span className="mono dim" style={{ fontSize: 10.5 }}>
              ROLLING 30 DAYS
            </span>
          </div>
          <div className="ds-card__body">
            <UsageRow
              l="Review requests"
              used={usage.requestsSent}
              max={isPro ? null : 50}
              color="var(--pri)"
            />
            <UsageRow
              l="AI replies drafted"
              used={usage.repliesDrafted}
              max={isPro ? 500 : 50}
              color="#5EEAD4"
            />
            <UsageRow
              l="Survey responses"
              used={usage.surveyResponses}
              max={isPro ? null : 100}
              color="#F59E0B"
            />
            <UsageRow
              l="Social posts published"
              used={usage.socialPosts}
              max={isPro ? 100 : 0}
              color="var(--ok)"
            />
          </div>
        </div>

        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Billing</h3>
            {isPro && (
              <span className="chip chip--ok">
                <Icon name="checkCircle" size={9} stroke={2.4} />
                Auto-renew
              </span>
            )}
          </div>
          <div className="ds-card__body">
            <BillingRow l="Next charge" v={nextCharge} />
            <BillingRow l="Plan" v={prettyPlan(plan)} />
            <BillingRow l="Billing email" v={billingEmail} />
            <BillingRow l="Country" v={org.country ?? "—"} />
            {org.subscription?.stripeSubscriptionId && (
              <BillingRow l="Subscription ID" v={org.subscription.stripeSubscriptionId} mono />
            )}
            <div className="divider" />
            <div className="lbl-mono" style={{ margin: 0, marginBottom: 8 }}>
              ACCOUNT
            </div>
            <p className="dim" style={{ fontSize: 12, lineHeight: 1.55 }}>
              Card details and invoices are managed through the Stripe billing portal. Click "Manage
              billing" above to update payment methods or download invoices.
            </p>
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

function PlanCard({
  name,
  badge,
  price,
  priceSuffix,
  period,
  features,
  ctaLabel,
  ctaActive,
  ctaDisabled,
  accent,
  isUpgrade,
  ctaHref,
  customCta,
}: {
  name: string;
  badge?: string;
  price: string;
  priceSuffix?: string;
  period: string;
  features: Array<[string, boolean]>;
  ctaLabel: string;
  ctaActive?: boolean;
  ctaDisabled?: boolean;
  accent?: boolean;
  isUpgrade?: boolean;
  ctaHref?: string;
  customCta?: React.ReactNode;
}) {
  const cta = customCta ? (
    customCta
  ) : ctaHref ? (
    <a
      href={ctaHref}
      className={`btn${ctaActive ? " btn--pri" : ""}`}
      style={{
        width: "100%",
        justifyContent: "center",
        marginTop: 16,
      }}
    >
      {ctaLabel}
    </a>
  ) : isUpgrade ? (
    <form action={upgradeAction} style={{ marginTop: 16 }}>
      <button
        type="submit"
        className={`btn${ctaActive ? " btn--pri" : ""}${ctaDisabled ? " btn--ghost" : ""}`}
        disabled={ctaDisabled}
        style={{
          width: "100%",
          justifyContent: "center",
          cursor: ctaDisabled ? "default" : "pointer",
        }}
      >
        {ctaLabel}
      </button>
    </form>
  ) : (
    <button
      type="button"
      className={`btn${ctaActive ? " btn--pri" : ""}${ctaDisabled ? " btn--ghost" : ""}`}
      disabled={ctaDisabled}
      style={{
        width: "100%",
        justifyContent: "center",
        marginTop: 16,
        cursor: ctaDisabled ? "default" : "pointer",
      }}
    >
      {ctaLabel}
    </button>
  );
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 14,
        padding: accent ? 1.5 : 0,
        background: accent ? "linear-gradient(155deg, var(--pri) 0%, #06B6D4 100%)" : "transparent",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: accent ? 13 : 14,
          padding: 24,
          border: accent ? "none" : "1px solid var(--line)",
          height: "100%",
        }}
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <span
            className="lbl-mono"
            style={{ margin: 0, color: accent ? "var(--pri)" : "var(--rl-muted)" }}
          >
            {name}
          </span>
          {badge && (
            <span className="chip chip--pri" style={{ marginLeft: "auto", fontSize: 9.5 }}>
              {badge}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
          <span style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.025em" }}>{price}</span>
          {priceSuffix && (
            <span style={{ fontSize: 15, color: "var(--rl-muted)", fontWeight: 500 }}>
              {priceSuffix}
            </span>
          )}
        </div>
        <div className="dim" style={{ fontSize: 11.5 }}>
          {period}
        </div>
        {cta}
        <div className="divider" />
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {features.map(([f, on]) => (
            <div
              key={f}
              className="row"
              style={{
                gap: 8,
                fontSize: 12.5,
                color: on ? "var(--ink-2)" : "var(--rl-muted)",
              }}
            >
              {on ? (
                <Icon name="check" size={12} stroke={2.4} style={{ color: "var(--ok)" }} />
              ) : (
                <Icon name="x" size={11} stroke={2} style={{ color: "var(--rl-muted-2)" }} />
              )}
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsageRow({
  l,
  used,
  max,
  color,
}: {
  l: string;
  used: number;
  max: number | null;
  color: string;
}) {
  const pct = max && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row" style={{ marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>{l}</span>
        <span className="mono" style={{ fontSize: 12 }}>
          {used.toLocaleString()}
          {max !== null && <span className="dim"> / {max.toLocaleString()}</span>}
        </span>
        <span
          className="mono"
          style={{ fontSize: 11.5, fontWeight: 500, width: 56, textAlign: "right" }}
        >
          {max === null ? "Unlimited" : `${pct}%`}
        </span>
      </div>
      <div className="gauge">
        <i style={{ width: `${max === null ? 100 : pct}%`, background: color }} />
      </div>
    </div>
  );
}

function BillingRow({ l, v, mono }: { l: string; v: string; mono?: boolean }) {
  return (
    <div className="row" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      <span className="dim" style={{ fontSize: 11.5, flex: 1 }}>
        {l}
      </span>
      <span
        style={{
          fontSize: 12,
          fontFamily: mono ? "var(--f-mono)" : undefined,
          wordBreak: "break-all",
        }}
      >
        {v}
      </span>
    </div>
  );
}

function prettyPlan(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

async function upgradeAction() {
  "use server";
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const email = session?.user?.email;
  if (!session || !orgId || !email) redirect("/login");
  const url = await createCheckoutSession(orgId, email);
  redirect(url);
}

async function portalAction() {
  "use server";
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  const url = await createPortalSession(orgId);
  redirect(url);
}
