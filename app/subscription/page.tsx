import { AppShellServer } from "@/components/app-shell-server";
import { CancelSubscriptionButton } from "@/components/cancel-subscription";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { auth } from "@/lib/auth/config";
import { getOrgContext } from "@/lib/auth/org-context";
import { createCheckoutSession, createPortalSession } from "@/lib/billing/actions";
import { PLAN_FEATURES, PRO_PRICE_AUD } from "@/lib/billing/plans";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";
import "./subscription-bill.css";

/**
 * Account & Billing → "Plans & billing" — repulabs design-kit surface.
 * Source of truth: designs/billing/ (mockup.png + 18-account-billing-plans.md).
 *
 * Real data: org.plan (canonical entitlement state), Stripe subscription row,
 * rolling-30-day usage counts. Billing MUTATIONS stay on Stripe
 * (createCheckoutSession + createPortalSession) — do NOT re-platform here.
 *
 * org.plan is the canonical billing state (pro | trial | free | past_due |
 * suspended) — NOT the 3 pricing-TIER names shown on the cards. We map it onto
 * the tiers: an active trial has full Pro features but no Stripe sub to manage;
 * only a paid `pro` plan has a subscription to manage/cancel/auto-renew.
 */

export const dynamic = "force-dynamic";

/**
 * Plan config drives the 3 cards — features are never hardcoded in JSX. It
 * lives in lib/billing/plans.ts so this page and the public /pricing page
 * cannot disagree about prices, trial length or what each tier includes.
 */

const ASSET = "/assets/repulabs/billing";

/**
 * Why the upgrade/portal button couldn't reach Stripe. These map the throw
 * reasons from lib/billing/actions.ts onto something an owner can act on.
 *
 * Before this existed, `upgradeAction` let those errors throw out of a bare
 * `<form action>` — which Next.js turns into a masked production crash page, so
 * "Upgrade to Pro" simply looked like a broken link with no clue why.
 */
const BILLING_ERRORS: Record<string, string> = {
  not_configured:
    "Billing isn't finished being set up — STRIPE_PRO_PRICE_ID isn't set on the server. Add the Pro price ID from your Stripe dashboard and restart the app.",
  wrong_id_type:
    "STRIPE_PRO_PRICE_ID is set to a Stripe PRODUCT id (prod_…) instead of a PRICE id (price_…). In Stripe → Product catalog → your Pro product, copy the API ID from the Pricing row (it starts with price_), then restart the app.",
  bad_price:
    "Stripe doesn't have that price. STRIPE_SECRET_KEY and STRIPE_PRO_PRICE_ID must be from the SAME Stripe mode — price ids are mode-specific, so a live price is invisible to a test key and vice versa. Swap the key, the price id, the webhook secret and the publishable key together as one set.",
  no_key:
    "Stripe isn't configured on the server (missing STRIPE_SECRET_KEY). Add it to the environment and restart.",
  auth: "Stripe rejected the API key. Check STRIPE_SECRET_KEY is the live key for the account that owns the Pro price.",
  no_customer: "No Stripe customer exists for this workspace yet — start a subscription first.",
  org: "We couldn't load this workspace. Refresh and try again.",
  failed: "Something went wrong reaching Stripe. Try again, or contact support if it persists.",
};

/** Map a thrown billing error onto a BILLING_ERRORS key. */
function billingErrorCode(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const type = (err as { type?: string } | null)?.type;
  const code = (err as { code?: string } | null)?.code;
  if (msg.includes("must be a price id")) return "wrong_id_type";
  if (/no such price: '?prod_/i.test(msg)) return "wrong_id_type";
  if (msg.includes("STRIPE_PRO_PRICE_ID")) return "not_configured";
  if (msg.includes("STRIPE_SECRET_KEY")) return "no_key";
  if (msg === "org_not_found") return "org";
  if (msg === "no_stripe_customer") return "no_customer";
  if (type === "StripeAuthenticationError") return "auth";
  // Stripe: "No such price: price_… " / resource_missing on a live/test mismatch.
  if (code === "resource_missing" || /no such (price|plan|customer)/i.test(msg)) return "bad_price";
  return "failed";
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ cancel?: string; billing_error?: string }>;
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

  const realPlan = org.plan ?? "free";
  const hasPaidPlan = realPlan === "pro"; // real Stripe subscription exists
  const onProTier = realPlan === "pro" || realPlan === "trial"; // Pro features active
  const isPro = onProTier;

  const billingEmail = org.ownerEmail ?? userEmail ?? "—";
  const country = org.country ?? "—";
  const renewsAt = org.subscription?.currentPeriodEnd;
  const nextCharge = renewsAt
    ? `${renewsAt.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })} · A$${PRO_PRICE_AUD}.00 AUD`
    : hasPaidPlan
      ? "—"
      : "No active subscription";
  const subId = org.subscription?.stripeSubscriptionId ?? null;

  // Card brand/last4 are NOT stored in our DB (the Subscription model holds no
  // PCI data — it lives in Stripe). So the "Payment method" row links out to the
  // portal rather than fabricating a masked card the mockup happens to show.

  const eyebrow =
    realPlan === "pro"
      ? ["PRO", "BILLED MONTHLY", `A$${PRO_PRICE_AUD}/MO PER LOCATION`]
      : realPlan === "trial"
        ? ["FREE TRIAL", "PRO FEATURES ACTIVE"]
        : realPlan === "past_due"
          ? ["PAST DUE", "UPDATE YOUR PAYMENT METHOD"]
          : ["STANDARD", "FREE FOREVER", "1 LOCATION"];

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Settings", "Account & Billing"]}>
      <div className="bill">
        {/* ── Header ──────────────────────────────────────────────── */}
        <header className="bill-head">
          <div style={{ minWidth: 0 }}>
            <div className="bill-eyebrow">
              {eyebrow.map((chip, i) => (
                <span key={chip} style={{ display: "inline-flex", gap: 8 }}>
                  {i > 0 && <span className="sep">·</span>}
                  {chip}
                </span>
              ))}
            </div>
            <h1 className="bill-title">Plans &amp; billing</h1>
            <p className="bill-sub">
              Start free, level up when reviews start rolling. No per-seat surprises.
            </p>
          </div>
          {hasPaidPlan ? (
            <form action={portalAction}>
              <button type="submit" className="bill-btn-primary">
                <Icon name="card" size={15} />
                Manage billing
              </button>
            </form>
          ) : (
            <form action={upgradeAction}>
              <button type="submit" className="bill-btn-primary">
                <Icon name="arrowUR" size={15} />
                Upgrade to Pro
              </button>
            </form>
          )}
        </header>

        {params.billing_error && (
          <div
            className="bill-notice"
            role="alert"
            style={{ borderColor: "#e14d62", background: "rgba(225,77,98,0.06)" }}
          >
            <strong>We couldn&apos;t open Stripe Checkout.</strong>{" "}
            {BILLING_ERRORS[params.billing_error] ?? BILLING_ERRORS.failed}
          </div>
        )}

        {params.cancel === "submitted" && (
          <div className="bill-notice">
            <strong>Cancellation request received.</strong> Our billing team will reach out within 1
            business day. Your Pro features stay active until your team confirms the cancellation
            date.
          </div>
        )}

        {/* ── Pricing cards ───────────────────────────────────────── */}
        <div className="bill-plans">
          {/* STANDARD */}
          <section className="bill-card bill-card--standard" aria-label="Standard plan — Free">
            <span className="bill-card__tier bill-card__tier--standard">Standard</span>
            {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
            <img
              className="bill-card__art"
              src={`${ASSET}/plan-free.svg`}
              alt=""
              aria-hidden="true"
            />
            <div className="bill-card__pricewrap">
              <span className="bill-card__price">Free</span>
            </div>
            <div className="bill-card__period">Forever · 1 location</div>

            {hasPaidPlan ? (
              // On Pro → Standard column offers the cancel/downgrade flow.
              <CancelSubscriptionButton />
            ) : (
              <button
                type="button"
                className="bill-card__cta bill-card__cta--current"
                aria-current="true"
                aria-disabled="true"
              >
                Your current plan
              </button>
            )}

            <div className="bill-card__sep" />
            <FeatureList features={PLAN_FEATURES.standard} />
          </section>

          {/* PRO — highlighted */}
          <section
            className="bill-card bill-card--pro"
            aria-label={`Pro plan — A$${PRO_PRICE_AUD} per month`}
          >
            <span className="bill-card__tier bill-card__tier--pro">Pro</span>
            <span className="bill-card__badge">
              <Icon name="star" size={11} style={{ color: "#8b5cf6" }} />
              MOST POPULAR
            </span>
            {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
            <img
              className="bill-card__art"
              src={`${ASSET}/plan-pro.svg`}
              alt=""
              aria-hidden="true"
            />
            <div className="bill-card__pricewrap">
              <span className="bill-card__price">A${PRO_PRICE_AUD}</span>
              <span className="bill-card__price-suffix">/mo</span>
            </div>
            <div className="bill-card__period">per location · billed monthly</div>

            {hasPaidPlan ? (
              <button
                type="button"
                className="bill-card__cta bill-card__cta--lav"
                aria-current="true"
                aria-disabled="true"
              >
                Current plan
              </button>
            ) : (
              <form action={upgradeAction}>
                <button type="submit" className="bill-card__cta bill-card__cta--purple">
                  {realPlan === "trial" ? "Continue on Pro" : "Upgrade to Pro"}
                </button>
              </form>
            )}

            <div className="bill-card__sep" />
            <div className="bill-card__section">Everything in Standard, plus:</div>
            <FeatureList features={PLAN_FEATURES.pro} />

            {hasPaidPlan && (
              <form action={portalAction} style={{ marginTop: "auto", paddingTop: 16 }}>
                <button type="submit" className="bill-card__cta bill-card__cta--purple">
                  Manage plan
                </button>
              </form>
            )}
          </section>

          {/* SCALE */}
          <section className="bill-card bill-card--scale" aria-label="Scale plan — Custom pricing">
            <span className="bill-card__tier bill-card__tier--scale">Scale</span>
            {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
            <img
              className="bill-card__art"
              src={`${ASSET}/plan-custom.svg`}
              alt=""
              aria-hidden="true"
            />
            <div className="bill-card__pricewrap">
              <span className="bill-card__price">Custom</span>
            </div>
            <div className="bill-card__period">10+ locations · multi-brand</div>

            <a
              href="mailto:sales@repulabs.com?subject=Scale%20plan%20enquiry"
              className="bill-card__cta"
            >
              Talk to sales
            </a>

            <div className="bill-card__sep" />
            <div className="bill-card__section">Everything in Pro, plus:</div>
            <FeatureList features={PLAN_FEATURES.scale} />
          </section>
        </div>

        {/* ── Bottom panels ───────────────────────────────────────── */}
        <div className="bill-panels">
          {/* This month's usage */}
          <section className="bill-panel" aria-label="This month's usage">
            <div className="bill-panel__head">
              {/* biome-ignore lint/performance/noImgElement: static kit icon */}
              <img
                className="bill-panel__ic"
                src={`${ASSET}/ic-plan.svg`}
                alt=""
                aria-hidden="true"
              />
              <h2 className="bill-panel__title">This month&apos;s usage</h2>
              <span className="bill-pill bill-pill--neutral">
                <Icon name="cal" size={12} />
                ROLLING 30 DAYS
              </span>
            </div>

            <UsageMeter
              icon="meter-review-requests"
              tile="blue"
              label="Review requests"
              used={usage.requestsSent}
              max={isPro ? null : 50}
              fill="#3b82f6"
              infColor="#3b82f6"
            />
            <UsageMeter
              icon="meter-ai-replies"
              tile="purple"
              label="AI replies drafted"
              used={usage.repliesDrafted}
              max={500}
              fill="#4f46e5"
              infColor="#7c3aed"
            />
            <UsageMeter
              icon="meter-survey-responses"
              tile="orange"
              label="Survey responses"
              used={usage.surveyResponses}
              max={isPro ? null : 100}
              fill="#f97316"
              infColor="#f97316"
            />
            <UsageMeter
              icon="meter-social-posts"
              tile="green"
              label="Social posts published"
              used={usage.socialPosts}
              max={100}
              fill="#10b981"
              infColor="#10b981"
            />

            <div className="bill-banner bill-banner--lav">
              {/* biome-ignore lint/performance/noImgElement: static kit icon */}
              <img
                className="bill-banner__ic"
                src={`${ASSET}/needs-star.svg`}
                alt=""
                aria-hidden="true"
              />
              <span className="bill-banner__txt">
                Need more capacity? Upgrade your plan or reach out — we&apos;re here to help you
                grow.
              </span>
              <a
                href="mailto:sales@repulabs.com?subject=More%20capacity"
                className="bill-banner__cta"
              >
                Talk to sales
              </a>
            </div>
          </section>

          {/* Billing overview */}
          <section className="bill-panel" aria-label="Billing overview">
            <div className="bill-panel__head">
              {/* biome-ignore lint/performance/noImgElement: static kit icon */}
              <img
                className="bill-panel__ic"
                src={`${ASSET}/ic-billing-overview.svg`}
                alt=""
                aria-hidden="true"
              />
              <h2 className="bill-panel__title">Billing overview</h2>
              {hasPaidPlan && (
                <span className="bill-pill bill-pill--ok">
                  <Icon name="refresh" size={12} />
                  Auto-renew on
                </span>
              )}
            </div>

            <dl className="bill-dl">
              <BillingRow icon="ic-next-charge" label="Next charge" value={nextCharge} />
              <BillingRow icon="ic-plan" label="Plan" value={prettyPlan(realPlan)} />
              <BillingRow icon="ic-mail" label="Billing email" value={billingEmail} />
              <BillingRow icon="ic-country" label="Country" value={country} />
              <BillingRow
                icon="ic-payment"
                label="Payment method"
                value={hasPaidPlan ? "Managed in Stripe portal" : "—"}
              />
              {subId && (
                <BillingRow icon="ic-subscription" label="Subscription ID" value={subId} mono />
              )}
            </dl>

            <div className="bill-banner bill-banner--green">
              {/* biome-ignore lint/performance/noImgElement: static kit icon */}
              <img
                className="bill-banner__ic"
                src={`${ASSET}/ic-card-lock.svg`}
                alt=""
                aria-hidden="true"
              />
              <span className="bill-banner__txt">
                Card details and invoices are managed through the Stripe billing portal.
              </span>
              {hasPaidPlan ? (
                <form action={portalAction}>
                  <button type="submit" className="bill-banner__cta">
                    <Icon name="card" size={12} />
                    Manage billing
                  </button>
                </form>
              ) : (
                <form action={upgradeAction}>
                  <button type="submit" className="bill-banner__cta">
                    <Icon name="arrowUR" size={12} />
                    Upgrade
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShellServer>
  );
}

/* ── Feature list (✓ included / ✗ excluded, with text equivalents) ────── */
function FeatureList({ features }: { features: Array<[string, boolean]> }) {
  return (
    <div className="bill-feats">
      {features.map(([label, on]) => (
        <div key={label} className={`bill-feat${on ? "" : " bill-feat--off"}`}>
          <span className="bill-feat__ic">
            {on ? (
              <Icon name="check" size={14} stroke={2.6} style={{ color: "#10b981" }} />
            ) : (
              <Icon name="x" size={13} stroke={2.2} style={{ color: "#94a3b8" }} />
            )}
          </span>
          <span className="bill-feat__txt-hidden">{on ? "Included:" : "Not included:"}</span>
          {label}
        </div>
      ))}
    </div>
  );
}

/* ── Usage meter (supports the "Unlimited ∞" state) ───────────────────── */
function UsageMeter({
  icon,
  tile,
  label,
  used,
  max,
  fill,
  infColor,
}: {
  icon: string;
  tile: "blue" | "purple" | "orange" | "green";
  label: string;
  used: number;
  max: number | null;
  fill: string;
  infColor: string;
}) {
  const unlimited = max === null;
  const pct = !unlimited && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const warn = !unlimited && pct >= 90;
  return (
    <div className="bill-meter">
      <span className={`bill-meter__tile bill-meter__tile--${tile}`}>
        {/* biome-ignore lint/performance/noImgElement: static kit icon */}
        <img src={`${ASSET}/${icon}.svg`} alt="" aria-hidden="true" />
      </span>
      <div className="bill-meter__body">
        <div className="bill-meter__row">
          <span className="bill-meter__label">{label}</span>
          {unlimited ? (
            <span className="bill-meter__val">Unlimited</span>
          ) : (
            <span className="bill-meter__val">
              {used.toLocaleString()} / {max.toLocaleString()}
            </span>
          )}
          {unlimited ? (
            <span className="bill-meter__inf" style={{ color: infColor }} aria-hidden="true">
              ∞
            </span>
          ) : (
            <span className="bill-meter__pct" style={{ color: warn ? "#d97706" : "#94a3b8" }}>
              {pct}%
            </span>
          )}
        </div>
        <div
          className="bill-track"
          role="progressbar"
          aria-label={label}
          aria-valuenow={unlimited ? undefined : pct}
          aria-valuemin={0}
          aria-valuemax={unlimited ? undefined : 100}
          aria-valuetext={unlimited ? "Unlimited" : `${pct}%`}
        >
          <i style={{ width: `${unlimited ? 100 : pct}%`, background: warn ? "#f59e0b" : fill }} />
        </div>
      </div>
    </div>
  );
}

/* ── Billing-overview key/value row ───────────────────────────────────── */
function BillingRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="bill-dl__row">
      {/* biome-ignore lint/performance/noImgElement: static kit icon */}
      <img className="bill-dl__ic" src={`${ASSET}/${icon}.svg`} alt="" aria-hidden="true" />
      <dt className="bill-dl__label">{label}</dt>
      <dd className={`bill-dl__value${mono ? " bill-dl__value--mono" : ""}`}>{value}</dd>
    </div>
  );
}

function prettyPlan(plan: string): string {
  const labels: Record<string, string> = {
    pro: "Pro",
    trial: "Free trial",
    free: "Free",
    past_due: "Past due",
    suspended: "Suspended",
    standard: "Standard",
    scale: "Scale",
  };
  return labels[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
}

async function upgradeAction() {
  "use server";
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const email = session?.user?.email;
  if (!session || !orgId || !email) redirect("/login");

  // A Stripe failure here must NOT escape the action: this is a bare
  // `<form action>`, so a throw becomes a masked production crash page and the
  // upgrade button reads as a broken link. Redirect back with a reason instead.
  // NOTE: redirect() signals via a thrown NEXT_REDIRECT, so the success redirect
  // stays OUTSIDE the try — otherwise the catch would swallow it.
  let url: string;
  try {
    url = await createCheckoutSession(orgId, email);
  } catch (err) {
    const code = billingErrorCode(err);
    logger.error({
      orgId,
      code,
      error: err instanceof Error ? err.message : String(err),
      event: "billing.checkout.failed",
    });
    redirect(`/subscription?billing_error=${code}`);
  }
  redirect(url);
}

async function portalAction() {
  "use server";
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");

  let url: string;
  try {
    url = await createPortalSession(orgId);
  } catch (err) {
    const code = billingErrorCode(err);
    logger.error({
      orgId,
      code,
      error: err instanceof Error ? err.message : String(err),
      event: "billing.portal.failed",
    });
    redirect(`/subscription?billing_error=${code}`);
  }
  redirect(url);
}
