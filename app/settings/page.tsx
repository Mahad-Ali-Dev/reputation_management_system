import { EmptyIllustration } from "@/components/empty-state";
import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { planAllowsPaidFeatures } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import { loadSettingsData, memberRoleLabel } from "./_lib/data";
import { SETTINGS_SECTIONS } from "./_lib/sections";
import "./settings-overview.css";

/**
 * /settings — workspace overview landing (was a redirect to /settings/workspace).
 *
 * At-a-glance composition per the v3 redesign: Profile card (owner + workspace),
 * Team-roles table, Plan card (real plan/price via lib/billing semantics) and
 * Usage meters (real 30-day tenant counters, mirroring /subscription's reads).
 * Every card links into its existing routed sub-page — all mutations stay on
 * the sub-pages, this page is read-only.
 */
export const dynamic = "force-dynamic";

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro",
  trial: "Free trial",
  free: "Free",
  past_due: "Past due",
  suspended: "Suspended",
  standard: "Standard",
  scale: "Scale",
};

function planLabel(plan: string): string {
  return PLAN_LABELS[plan] ?? plan.charAt(0).toUpperCase() + plan.slice(1);
}

/** Human description of what each membership role can do (mirrors the invite
 *  form's role descriptions on /settings/team — derived, not stored). */
const ROLE_ACCESS: Record<string, string> = {
  owner: "Full control",
  admin: "Manage data",
  manager: "Reply + edit",
  viewer: "Read-only",
};

type UsageCounters = {
  locations: number;
  requestsSent30d: number;
  smsRequests30d: number;
  repliesDrafted30d: number;
};

/** Fail-soft tenant usage read — a missing relation or RLS hiccup hides the
 *  meters instead of crashing the whole settings landing. */
async function loadUsage(orgId: string): Promise<UsageCounters | null> {
  try {
    return await withTenant(orgId, async (tx) => {
      const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [locations, requestsSent30d, smsRequests30d, repliesDrafted30d] = await Promise.all([
        tx.establishment.count(),
        tx.reviewRequest.count({ where: { sentAt: { gte: since30d } } }),
        tx.reviewRequest.count({ where: { sentAt: { gte: since30d }, channel: "sms" } }),
        tx.reviewReply.count({ where: { createdAt: { gte: since30d } } }),
      ]);
      return { locations, requestsSent30d, smsRequests30d, repliesDrafted30d };
    });
  } catch {
    return null;
  }
}

export default async function SettingsOverviewPage() {
  const { org, members, sessionUser } = await loadSettingsData();

  // Subscription + trial window — same auth-domain read the billing sub-page
  // and /subscription use (own org by verified session orgId).
  const [orgBilling, usage] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: org.id },
      select: { trialEndsAt: true, subscription: true },
    }),
    loadUsage(org.id),
  ]);

  const plan = org.plan;
  const trialEndsAt = orgBilling?.trialEndsAt ?? null;
  const entitled = planAllowsPaidFeatures(plan, trialEndsAt);
  const isPaid = plan === "pro";
  const subStatus = orgBilling?.subscription?.status ?? null;
  const renewsAt = orgBilling?.subscription?.currentPeriodEnd ?? null;
  const trialDaysLeft =
    plan === "trial" && trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000))
      : null;

  const ownerDisplayName =
    org.ownerName ?? sessionUser.name ?? sessionUser.email?.split("@")[0] ?? "Owner";
  const myRole = memberRoleLabel(members, sessionUser.email ?? "");

  // Quota semantics mirror /subscription: paid/trial = Pro tier limits.
  const proTier = entitled;
  const locationCap = proTier ? null : 1;
  const requestCap = proTier ? null : 50;
  const aiReplyCap = proTier ? 500 : 50;

  const moreSections = SETTINGS_SECTIONS.filter(
    (s) => !["workspace", "team", "billing"].includes(s.id),
  );

  return (
    <div className="set-overview">
      <div className="set-top">
        {/* ── Profile / workspace ─────────────────────────────────── */}
        <section className="ds-card">
          <div className="ds-card__head">
            <div className="row" style={{ gap: 10 }}>
              <span className="set-bubble">
                <Icon name="user" size={15} />
              </span>
              <div>
                <h3 className="ds-card__title">Profile</h3>
                <div className="ds-card__sub">Workspace owner</div>
              </div>
            </div>
            <Link
              href="/settings/workspace"
              className="btn btn--xs btn--ghost"
              style={{ textDecoration: "none" }}
              aria-label="Open workspace settings"
            >
              <Icon name="arrowR" size={11} />
            </Link>
          </div>
          <div className="ds-card__body">
            <div className="set-id-row">
              <Avatar name={ownerDisplayName} size={34} tone={5} />
              <div className="set-id-row__meta">
                <div className="set-id-row__name">{ownerDisplayName}</div>
                <div className="set-id-row__sub">{myRole}</div>
              </div>
              <span className="chip chip--ok">Live</span>
            </div>
            <div className="set-id-row">
              <Avatar name={org.name} size={34} tone={2} />
              <div className="set-id-row__meta">
                <div className="set-id-row__name">{org.name}</div>
                <div className="set-id-row__sub">
                  {usage
                    ? `${usage.locations} ${usage.locations === 1 ? "location" : "locations"} · `
                    : ""}
                  joined{" "}
                  {org.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                </div>
              </div>
              <span className={`chip ${entitled ? "chip--ok" : "chip--out"}`}>
                {entitled ? "Active" : planLabel(plan)}
              </span>
            </div>
          </div>
        </section>

        {/* ── Team roles ──────────────────────────────────────────── */}
        <section className="ds-card set-card--team">
          <div className="ds-card__head">
            <div className="row" style={{ gap: 10 }}>
              <span className="set-bubble set-bubble--trust">
                <Icon name="users" size={15} />
              </span>
              <div>
                <h3 className="ds-card__title">Team roles</h3>
                <div className="ds-card__sub">
                  {members.length} {members.length === 1 ? "member" : "members"} · RBAC
                </div>
              </div>
            </div>
            <Link
              href="/settings/team"
              className="btn btn--xs btn--pri"
              style={{ textDecoration: "none" }}
            >
              <Icon name="plus" size={10} />
              Invite teammate
            </Link>
          </div>
          {members.length === 0 ? (
            <div className="ds-card__body dim" style={{ fontSize: 12.5 }}>
              No team members yet —{" "}
              <Link href="/settings/team" style={{ color: "var(--pri)" }}>
                invite your first teammate
              </Link>
              .
            </div>
          ) : (
            <table className="tbl tbl--compact">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18 }}>Name</th>
                  <th>Role</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {members.slice(0, 5).map((m, i) => {
                  const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                  return (
                    <tr key={m.id}>
                      <td style={{ paddingLeft: 18 }} className="set-team-name">
                        <div className="row" style={{ gap: 10 }}>
                          <Avatar
                            name={m.user.name ?? m.user.email ?? "User"}
                            size={26}
                            tone={tone}
                          />
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 12.5 }}>
                              {m.user.name ?? m.user.email}
                            </div>
                            <div className="dim" style={{ fontSize: 11 }}>
                              {m.user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="chip" style={{ textTransform: "capitalize" }}>
                          {m.role}
                        </span>
                      </td>
                      <td className="dim" style={{ fontSize: 12 }}>
                        {ROLE_ACCESS[m.role] ?? "Member"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {members.length > 5 && (
            <div className="ds-card__body" style={{ paddingTop: 8, paddingBottom: 12 }}>
              <Link
                href="/settings/team"
                className="dim"
                style={{ fontSize: 12, textDecoration: "none" }}
              >
                View all {members.length} members
                <Icon name="arrowR" size={10} style={{ marginLeft: 4 }} />
              </Link>
            </div>
          )}
        </section>

        {/* ── Plan ────────────────────────────────────────────────── */}
        <section className="ds-card">
          <div className="ds-card__head">
            <div className="row" style={{ gap: 10 }}>
              <span className="set-bubble">
                <Icon name="card" size={15} />
              </span>
              <div>
                <h3 className="ds-card__title">Plan</h3>
                <div className="ds-card__sub">{planLabel(plan)}</div>
              </div>
            </div>
            <Link
              href="/settings/billing"
              className="btn btn--xs btn--ghost"
              style={{ textDecoration: "none" }}
              aria-label="Open billing settings"
            >
              <Icon name="arrowR" size={11} />
            </Link>
          </div>
          <div className="ds-card__body">
            {!isPaid && (
              <div className="set-plan-art">
                <EmptyIllustration name="upgrade" size={170} />
              </div>
            )}
            <div className="set-plan-box" style={{ marginTop: isPaid ? 0 : 12 }}>
              <div className="lbl-mono" style={{ margin: 0, marginBottom: 6 }}>
                {isPaid ? "MONTHLY" : plan === "trial" ? "TRIAL" : "CURRENT PLAN"}
              </div>
              <div className="set-plan-price-row">
                <span className="set-plan-price">{isPaid ? "A$79" : "$0"}</span>
                <span className="set-plan-price-suffix">
                  {isPaid ? "/mo per location" : plan === "trial" ? "during trial" : "free plan"}
                </span>
              </div>
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                <span className={`chip ${entitled ? "chip--ok" : "chip--warn"}`}>
                  {isPaid
                    ? subStatus === "active" || subStatus === "trialing"
                      ? "active"
                      : (subStatus ?? "active")
                    : plan === "trial"
                      ? entitled
                        ? trialDaysLeft !== null
                          ? `active · ${trialDaysLeft}d left`
                          : "active"
                        : "trial ended"
                      : planLabel(plan).toLowerCase()}
                </span>
              </div>
              {isPaid && renewsAt && (
                <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>
                  Renews{" "}
                  {renewsAt.toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              )}
            </div>
            {!isPaid && (
              <Link
                href="/subscription"
                className="btn btn--sm btn--pri"
                style={{
                  textDecoration: "none",
                  width: "100%",
                  justifyContent: "center",
                  marginTop: 12,
                }}
              >
                <Icon name="arrowUR" size={12} />
                Upgrade to Pro
              </Link>
            )}
          </div>
        </section>
      </div>

      {/* ── Usage meters ──────────────────────────────────────────── */}
      <section className="ds-card">
        <div className="ds-card__head">
          <div className="row" style={{ gap: 10 }}>
            <span className="set-bubble set-bubble--trust">
              <Icon name="bars" size={15} />
            </span>
            <div>
              <h3 className="ds-card__title">Usage meters</h3>
              <div className="ds-card__sub">Account limits · rolling 30 days</div>
            </div>
          </div>
          <Link
            href="/subscription"
            className="btn btn--xs btn--ghost"
            style={{ textDecoration: "none" }}
          >
            Full usage
            <Icon name="arrowR" size={10} />
          </Link>
        </div>
        <div className="ds-card__body">
          {usage ? (
            <>
              <Meter
                label="AI replies"
                used={usage.repliesDrafted30d}
                max={aiReplyCap}
                color="var(--pri)"
              />
              <Meter
                label="Review requests"
                hint={`${usage.smsRequests30d.toLocaleString()} via SMS`}
                used={usage.requestsSent30d}
                max={requestCap}
                color="#0d9488"
              />
              <Meter label="Locations" used={usage.locations} max={locationCap} color="#F59E0B" />
            </>
          ) : (
            <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
              Usage counters are unavailable right now — see the{" "}
              <Link href="/subscription" style={{ color: "var(--pri)" }}>
                billing page
              </Link>{" "}
              for plan details.
            </p>
          )}
        </div>
      </section>

      {/* ── Remaining sections ────────────────────────────────────── */}
      <nav className="set-links" aria-label="More settings sections">
        {moreSections.map((s) => (
          <Link key={s.id} href={s.href} className="set-link">
            <Icon name={s.icon} size={14} style={{ color: "var(--pri)" }} />
            {s.label}
            <span className="set-link__arrow">
              <Icon name="chevR" size={12} />
            </span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Meter({
  label,
  hint,
  used,
  max,
  color,
}: {
  label: string;
  hint?: string;
  used: number;
  max: number | null;
  color: string;
}) {
  const pct = max && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : null;
  return (
    <div className="set-meter">
      <div className="set-meter__head">
        <span className="set-meter__label">{label}</span>
        {hint && <span className="set-meter__hint">{hint}</span>}
        <span className="mono" style={{ fontSize: 12 }}>
          {used.toLocaleString()}
          {max !== null && <span className="dim"> / {max.toLocaleString()}</span>}
        </span>
        <span
          className="mono"
          style={{ fontSize: 11.5, fontWeight: 500, width: 64, textAlign: "right" }}
        >
          {pct === null ? "Unlimited" : `${pct}%`}
        </span>
      </div>
      <div className="gauge">
        <i style={{ width: `${pct === null ? 100 : pct}%`, background: color }} />
      </div>
    </div>
  );
}
