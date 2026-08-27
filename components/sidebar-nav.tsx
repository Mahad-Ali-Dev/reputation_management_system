"use client";

import { openCommandPalette } from "@/components/command-palette";
import { LockIcon, upgradeHref } from "@/components/pro-gate";
import { Icon, type IconName } from "@/components/shell/icon";
import { type AccessTabKey, accessTabLabel } from "@/lib/access/tabs";
import type { FeatureKey } from "@/lib/billing/feature-access";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Persistent sidebar nav — repulabs v3 (clean redesign), unified IA.
 *
 * Grouped, ALL-CAPS sections matching the master-plan information architecture
 * (tasks/master/01-architecture.md): DASHBOARD / DEVICE SETUP / AI ENGINE /
 * REVIEWS / SOCIAL & MESSAGING / ENGAGEMENT & CRM / INTELLIGENCE / SETTINGS.
 * Each item links straight to its section's main page; sub-navigation lives as
 * in-page tabs (`<TabBar>`). Active state = blue-tint pill. A "Unlock more
 * growth" upgrade card sits at the bottom for non-Pro plans.
 *
 * Per-item Pro padlock (A3): items flagged `pro` show a gold padlock + faded
 * text for Free plans and route to `/subscription?feature=<key>` instead of the
 * gated surface. The padlock affordance is the shared `<LockIcon>` from
 * `components/pro-gate.tsx`, so locked nav items, locked TabBar tabs, and the
 * ProGate lock card all read as ONE product. Pro/trial orgs see every item live.
 *
 * Per-item access padlock: items flagged `tab` are checked against the
 * signed-in member's `allowedTabs` (lib/access/tabs.ts) — a workspace admin's
 * per-invite restriction, orthogonal to plan. A restricted item shows a
 * muted-gray padlock (distinct from the gold Pro one) and routes to
 * `/restricted?feature=<label>` instead of the real page; the actual
 * enforcement is server-side in `getOrgContext` (lib/auth/org-context.ts) —
 * this lock is a hint, direct URL entry is blocked there regardless.
 *
 * Routing contract: hrefs are NEVER changed here (a prior commit chose
 * action-led labels with no URL migration) — only link TEXT is relabeled.
 *
 * Public API unchanged: { onNavigate?, orgName, planLabel, allowedTabs? }.
 */

type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
  /**
   * When set, the item is a paid surface: Free plans see a gold padlock + faded
   * text and the link points at the upgrade route for this feature instead.
   * Pro/trial plans see it as a normal link. The key is a canonical
   * `FeatureKey` so the padlock + upgrade CTA stay consistent app-wide.
   */
  pro?: FeatureKey;
  /** Canonical access-tab key (lib/access/tabs.ts) this item is gated by.
   *  Omitted for Dashboard/Settings, which are never restrictable. */
  tab?: AccessTabKey;
};
type NavGroup = { group: string };
type NavItem = NavLink | NavGroup;

const isGroup = (x: NavItem): x is NavGroup => "group" in x;

/**
 * Unified IA. `href` values are the EXISTING routes (unchanged); `label` is the
 * action-led text. `pro` flags a paid surface (gold padlock for Free plans).
 */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/autopilot", label: "AI Autopilot", icon: "bolt", badge: "AI", tab: "autopilot" },

  { group: "Device Setup" },
  { href: "/establishments", label: "My Businesses", icon: "pin", tab: "establishments" },
  { href: "/hardware", label: "Device Manager", icon: "qr", tab: "hardware" },

  { group: "AI Engine" },
  { href: "/ai", label: "AI Brain", icon: "brain", tab: "ai" },
  { href: "/phone", label: "AI Receptionist", icon: "phone", badge: "Soon", tab: "phone" },

  { group: "Reviews" },
  { href: "/reviews", label: "Review Inbox", icon: "star", tab: "reviews" },
  { href: "/outreach", label: "Review Outreach", icon: "send", tab: "outreach" },
  { href: "/reviews/dispute", label: "Dispute Manager", icon: "flag", tab: "dispute" },

  { group: "Social & Messaging" },
  { href: "/support", label: "Message Center", icon: "chat", badge: "Soon", tab: "support" },
  {
    href: "/support?tab=meetings",
    label: "Booking Requests",
    icon: "cal",
    badge: "Soon",
    tab: "support",
  },
  {
    href: "/social/posts",
    label: "Social Studio",
    icon: "share",
    pro: "image_creatives",
    tab: "social",
  },

  { group: "Engagement & CRM" },
  {
    href: "/surveys",
    label: "Customer Feedback",
    icon: "survey",
    pro: "surveys_insights",
    tab: "surveys",
  },
  { href: "/contacts", label: "Customer Directory", icon: "users", tab: "contacts" },

  { group: "Intelligence" },
  { href: "/analytics", label: "Analytics", icon: "bars", tab: "analytics" },

  { group: "Settings" },
  { href: "/connections", label: "App Connections", icon: "plug", tab: "connections" },
  { href: "/subscription", label: "Plan & Billing", icon: "card", tab: "subscription" },
  { href: "/settings", label: "General Settings", icon: "settings" },
];

function pathMatches(pathname: string, href: string, activeTab: string | null): boolean {
  if (href === "/reviews") {
    // keep Review Feed from swallowing /reviews/dispute (its own item)
    return pathname === "/reviews" || /^\/reviews\/(?!dispute)[^/]+$/.test(pathname);
  }
  // Unified Inbox + Meeting requests both live on /support now (the latter is the
  // `?tab=meetings` view). Disambiguate the two sidebar entries by the active tab
  // so only one lights up at a time. All other /support/* (legacy redirect) paths
  // belong to Unified Inbox.
  if (href === "/support?tab=meetings") {
    return pathname === "/support" && activeTab === "meetings";
  }
  if (href === "/support") {
    if (pathname === "/support") return activeTab !== "meetings";
    return pathname.startsWith("/support/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  onNavigate,
  orgName,
  planLabel,
  allowedTabs,
}: {
  onNavigate?: () => void;
  orgName: string;
  planLabel: string;
  /** This member's tab whitelist (lib/access/tabs.ts). Empty/undefined = no
   *  restriction — every item renders exactly as it always has. */
  allowedTabs?: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams?.get("tab") ?? null;
  const isPro = /pro|scale|business|enterprise/i.test(planLabel);
  const isRestricted = (tab: AccessTabKey | undefined) =>
    Boolean(tab) && Boolean(allowedTabs?.length) && !allowedTabs?.includes(tab as string);

  return (
    <aside className="sb">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="sb__brand"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <Image
          src="/favicon.png"
          alt=""
          width={30}
          height={30}
          priority
          style={{ borderRadius: 8, objectFit: "contain", flex: "0 0 30px" }}
        />
        <div className="sb__brandname">
          repu<span>labs</span>
        </div>
      </Link>

      <button
        type="button"
        className="sb__search"
        aria-label="Search and navigate (Command or Control + K)"
        onClick={openCommandPalette}
      >
        <Icon name="search" size={14} />
        <span>Search…</span>
        <kbd>⌘K</kbd>
      </button>

      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          marginRight: -6,
          paddingRight: 6,
        }}
      >
        {NAV.map((n) => {
          if (isGroup(n)) {
            return (
              <div key={`g-${n.group}`} className="sb__group">
                {n.group}
              </div>
            );
          }

          // Two independent locks: a Pro item is locked when the org isn't on
          // a paid plan; an access-restricted item is locked regardless of
          // plan (a workspace admin narrowed this specific member's tabs).
          // Access restriction takes the more specific copy/href when both
          // could apply — upgrading the plan would never fix it anyway.
          const proLocked = Boolean(n.pro) && !isPro;
          const restricted = isRestricted(n.tab);
          const locked = proLocked || restricted;
          const href = restricted
            ? `/restricted?feature=${encodeURIComponent(accessTabLabel(n.tab as string))}`
            : proLocked
              ? upgradeHref(n.pro)
              : n.href;

          return (
            <Link
              key={n.href}
              href={href}
              onClick={onNavigate}
              className={`sb__item${pathMatches(pathname, n.href, activeTab) ? " is-active" : ""}`}
              aria-label={
                restricted ? `${n.label} (Restricted)` : locked ? `${n.label} (Pro)` : undefined
              }
              title={
                restricted
                  ? `${n.label} — restricted by your workspace admin`
                  : locked
                    ? `${n.label} — upgrade to Pro`
                    : undefined
              }
              style={locked ? { color: "var(--rl-muted-2)" } : undefined}
            >
              <Icon name={n.icon} style={locked ? { opacity: 0.6 } : undefined} />
              <span style={{ flex: 1, opacity: locked ? 0.7 : undefined }}>{n.label}</span>
              {restricted ? (
                <Icon
                  name="lock"
                  size={13}
                  style={{ color: "var(--rl-muted-2)", marginLeft: "auto" }}
                  title="Restricted by your workspace admin"
                />
              ) : proLocked ? (
                <LockIcon size={13} style={{ marginLeft: "auto" }} />
              ) : (
                n.badge && <span className="sb__badge">{n.badge}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="sb__bottom">
        {isPro ? (
          <div className="sb__plan">
            <span className="sb__planbadge">{planLabel}</span>
            <span style={{ fontSize: 11.5, color: "var(--rl-muted)" }}>{orgName}</span>
          </div>
        ) : (
          <div className="sb__upsell">
            <div className="sb__upsell-title">
              <Icon name="bolt" size={13} />
              Unlock more growth
            </div>
            <p className="sb__upsell-sub">
              Upgrade to Pro for advanced AI, competitor insights, and more.
            </p>
            <Link href="/subscription" onClick={onNavigate} className="sb__upsell-btn">
              <Icon name="sparkle" size={12} />
              Upgrade to Pro
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
