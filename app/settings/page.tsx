import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import { planAllowsPaidFeatures } from "@/lib/billing/entitlements";
import { PRO_PRICE_AUD } from "@/lib/billing/plans";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import { loadSettingsData, memberRoleLabel } from "./_lib/data";

/**
 * /settings — workspace overview hub (designs/settings/main/mockup.png).
 *
 * At-a-glance composition: Profile card (owner + workspace), Team-roles table,
 * Plan card (real plan/price via lib/billing semantics), a Usage-meters panel
 * (real 30-day tenant counters, mirroring /subscription's reads) and a row of
 * section-entry cards. Every card links into its existing routed sub-page —
 * all mutations stay on the sub-pages, this page is read-only.
 */
export const dynamic = "force-dynamic";

const ASSET = "/assets/repulabs/settings";

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

/** Section-entry cards (bottom row) → tile art + tint + copy per the mockup. */
const SECTION_CARDS: Array<{
  id: string;
  href: string;
  title: string;
  desc: string;
  art: string;
  tint: string;
}> = [
  {
    id: "brand",
    href: "/settings/brand",
    title: "Brand",
    desc: "Customize your brand identity",
    art: `${ASSET}/nav-brand.svg`,
    tint: "set-tile--violet",
  },
  {
    id: "notifications",
    href: "/settings/notifications",
    title: "Notifications",
    desc: "Manage alerts and preferences",
    art: `${ASSET}/nav-notifications.svg`,
    tint: "set-tile--indigo",
  },
  {
    id: "security",
    href: "/settings/security",
    title: "Security",
    desc: "Manage access and permissions",
    art: `${ASSET}/nav-security.svg`,
    tint: "set-tile--emerald",
  },
  {
    id: "api",
    href: "/settings/api",
    title: "API & webhooks",
    desc: "Integrations and developer tools",
    art: `${ASSET}/nav-api.svg`,
    tint: "set-tile--blue",
  },
  {
    id: "data",
    href: "/settings/data",
    title: "Data & export",
    desc: "Export and manage your data",
    art: `${ASSET}/nav-data.svg`,
    tint: "set-tile--rose",
  },
];

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

  const planStatusLabel = isPaid
    ? subStatus === "active" || subStatus === "trialing"
      ? "active"
      : (subStatus ?? "active")
    : plan === "trial"
      ? entitled
        ? trialDaysLeft !== null
          ? `active · ${trialDaysLeft}d left`
          : "active"
        : "trial ended"
      : planLabel(plan).toLowerCase();

  return (
    <div className="set-hub">
      <div className="set-hub__top">
        {/* ── Profile / workspace ─────────────────────────────────── */}
        <section className="set-card set-sum">
          <div className="set-sum__head">
            <span className="set-tile set-tile--sm set-tile--indigo">
              <Icon name="user" size={16} />
            </span>
            <div className="set-sum__titles">
              <h2 className="set-sum__title">Profile</h2>
              <p className="set-sum__sub">Workspace owner</p>
            </div>
            <Link
              href="/settings/workspace"
              className="set-sum__chev"
              aria-label="Open workspace settings"
            >
              <Icon name="chevR" size={16} />
            </Link>
          </div>
          <div className="set-idrow">
            <Avatar name={ownerDisplayName} size={34} tone={5} />
            <div className="set-idrow__meta">
              <div className="set-idrow__name">{ownerDisplayName}</div>
              <div className="set-idrow__sub">{myRole}</div>
            </div>
            <span className="set-pill set-pill--ok">
              <span className="set-pill__dot" />
              Live
            </span>
          </div>
          <div className="set-idrow">
            <Avatar name={org.name} size={34} tone={2} />
            <div className="set-idrow__meta">
              <div className="set-idrow__name">{org.name}</div>
              <div className="set-idrow__sub">
                {usage
                  ? `${usage.locations} ${usage.locations === 1 ? "location" : "locations"} · `
                  : ""}
                Joined{" "}
                {org.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </div>
            </div>
            <span className={`set-pill ${entitled ? "set-pill--ok" : "set-pill--muted"}`}>
              {entitled && <span className="set-pill__dot" />}
              {entitled ? "Active" : planLabel(plan)}
            </span>
          </div>
        </section>

        {/* ── Team roles ──────────────────────────────────────────── */}
        <section className="set-card set-sum">
          <div className="set-sum__head">
            <span className="set-tile set-tile--sm set-tile--indigo">
              <Icon name="users" size={16} />
            </span>
            <div className="set-sum__titles">
              <h2 className="set-sum__title">Team roles</h2>
              <p className="set-sum__sub">
                {members.length} {members.length === 1 ? "member" : "members"} · RBAC
              </p>
            </div>
            <Link href="/settings/team" className="set-btn set-btn--primary set-btn--sm">
              <Icon name="plus" size={13} className="set-btn__ic" />
              Invite teammate
            </Link>
          </div>
          {members.length === 0 ? (
            <p className="set-dim" style={{ fontSize: 13 }}>
              No team members yet —{" "}
              <Link href="/settings/team" className="set-link">
                invite your first teammate
              </Link>
              .
            </p>
          ) : (
            <table className="set-mini">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {members.slice(0, 4).map((m, i) => {
                  const tone = ((i % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="set-nrow" style={{ gap: 10 }}>
                          <Avatar
                            name={m.user.name ?? m.user.email ?? "User"}
                            size={28}
                            tone={tone}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div className="set-mini__name">{m.user.name ?? m.user.email}</div>
                            <div className="set-mini__email">{m.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className="set-pill set-pill--neutral"
                          style={{ textTransform: "capitalize" }}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="set-mini__access">{ROLE_ACCESS[m.role] ?? "Member"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {members.length > 4 && (
            <Link
              href="/settings/team"
              className="set-link"
              style={{ fontSize: 13, marginTop: 12 }}
            >
              View all {members.length} members
              <Icon name="arrowR" size={12} />
            </Link>
          )}
        </section>

        {/* ── Plan ────────────────────────────────────────────────── */}
        <section className="set-card set-sum">
          <div className="set-sum__head">
            <span className="set-tile set-tile--sm set-tile--indigo">
              <Icon name="card" size={16} />
            </span>
            <div className="set-sum__titles">
              <h2 className="set-sum__title">Plan</h2>
              <p className="set-sum__sub">{planLabel(plan)}</p>
            </div>
            <Link
              href="/settings/billing"
              className="set-sum__chev"
              aria-label="Open billing settings"
            >
              <Icon name="chevR" size={16} />
            </Link>
          </div>
          <div className="set-plan">
            <div className="set-plan__eyebrow">
              {isPaid ? "Monthly" : plan === "trial" ? "Trial" : "Current plan"}
            </div>
            <div className="set-plan__pricerow">
              <span className="set-plan__price">{isPaid ? `A$${PRO_PRICE_AUD}` : "$0"}</span>
              <span className="set-plan__suffix">
                {isPaid ? "/mo per location" : plan === "trial" ? "during trial" : "free plan"}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className={`set-pill ${entitled ? "set-pill--ok" : "set-pill--muted"}`}>
                {entitled && <span className="set-pill__dot" />}
                {planStatusLabel}
              </span>
            </div>
            {isPaid && renewsAt && (
              <div className="set-plan__renew">
                Renews{" "}
                {renewsAt.toLocaleDateString("en-US", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            )}
            {/* biome-ignore lint/a11y/useAltText: decorative plan art */}
            <img
              src={`${ASSET}/main-plan.svg`}
              alt=""
              aria-hidden="true"
              className="set-plan__art"
            />
          </div>
          {!isPaid && (
            <Link
              href="/subscription"
              className="set-btn set-btn--primary"
              style={{ marginTop: 12 }}
            >
              <Icon name="arrowUR" size={14} className="set-btn__ic" />
              Upgrade to Pro
            </Link>
          )}
        </section>

      </div>

      {/* ── Usage meters ──────────────────────────────────────────── */}
      <section className="set-card">
        <div className="set-sec-head" style={{ alignItems: "center" }}>
          <span className="set-tile set-tile--sm set-tile--indigo">
            <Icon name="bars" size={16} />
          </span>
          <div style={{ flex: 1 }}>
            <h2 className="set-card__title set-card__title--sm">Usage meters</h2>
            <p className="set-card__sub">Across limits · rolling 30 days</p>
          </div>
          <Link href="/subscription" className="set-link">
            Full usage
            <Icon name="arrowR" size={13} />
          </Link>
        </div>
        {usage ? (
          <div className="set-meters">
            <Meter
              label="AI replies"
              art={`${ASSET}/meter-ai-replies.svg`}
              used={usage.repliesDrafted30d}
              max={aiReplyCap}
              color="var(--set-indigo)"
            />
            <Meter
              label="Review requests"
              art={`${ASSET}/meter-review-requests.svg`}
              note={`${usage.smsRequests30d.toLocaleString()} via SMS`}
              used={usage.requestsSent30d}
              max={requestCap}
              color="var(--set-emerald)"
            />
            <Meter
              label="Locations"
              art={`${ASSET}/meter-locations.svg`}
              used={usage.locations}
              max={locationCap}
              color="var(--set-amber)"
              noteRight
            />
          </div>
        ) : (
          <p className="set-dim" style={{ fontSize: 13, marginTop: 16 }}>
            Usage counters are unavailable right now — see the{" "}
            <Link href="/subscription" className="set-link">
              billing page
            </Link>{" "}
            for plan details.
          </p>
        )}
      </section>

      {/* ── Section-entry cards ───────────────────────────────────── */}
      <nav className="set-cards" aria-label="More settings sections">
        {SECTION_CARDS.map((s) => (
          <Link key={s.id} href={s.href} className="set-seccard">
            <span className="set-seccard__chev">
              <Icon name="chevR" size={16} />
            </span>
            <span className={`set-tile ${s.tint}`}>
              {/* biome-ignore lint/a11y/useAltText: decorative section art */}
              <img src={s.art} alt="" aria-hidden="true" />
            </span>
            <div>
              <div className="set-seccard__title">{s.title}</div>
              <div className="set-seccard__desc">{s.desc}</div>
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function Meter({
  label,
  art,
  note,
  noteRight,
  used,
  max,
  color,
}: {
  label: string;
  art: string;
  note?: string;
  noteRight?: boolean;
  used: number;
  max: number | null;
  color: string;
}) {
  const pct = max && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : null;
  return (
    <div className="set-meter">
      <span className="set-meter__tile">
        {/* biome-ignore lint/a11y/useAltText: decorative meter art */}
        <img src={art} alt="" aria-hidden="true" />
      </span>
      <div
        className="set-meter__body"
        role="progressbar"
        aria-label={`${label} ${used}${max !== null ? ` of ${max}` : ""}`}
        aria-valuenow={pct ?? used}
        aria-valuemin={0}
        aria-valuemax={max ?? undefined}
      >
        <div className="set-meter__row">
          <span className="set-meter__label">{label}</span>
          <span className="set-meter__val">
            {used.toLocaleString()}
            {max !== null && <span className="set-dim"> / {max.toLocaleString()}</span>}
          </span>
          <span className="set-meter__pct" style={{ color: pct === null ? undefined : color }}>
            {pct === null ? "Unlimited" : `${pct}%`}
          </span>
        </div>
        <div className="set-track">
          <i style={{ width: `${pct === null ? 100 : pct}%`, background: color }} />
        </div>
        {note && (
          <div className={`set-meter__note${noteRight ? " set-meter__note--right" : ""}`}>
            {note}
          </div>
        )}
        {noteRight && !note && max === null && (
          <div className="set-meter__note set-meter__note--right">Unlimited</div>
        )}
      </div>
    </div>
  );
}
