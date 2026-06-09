"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { LockIcon, upgradeHref } from "@/components/pro-gate";
import type { FeatureKey } from "@/lib/billing/feature-access";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
 * Routing contract: hrefs are NEVER changed here (a prior commit chose
 * action-led labels with no URL migration) — only link TEXT is relabeled.
 *
 * Public API unchanged: { onNavigate?, orgName, planLabel }.
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
  { href: "/autopilot", label: "Autopilot", icon: "bolt", badge: "AI" },

  { group: "Device Setup" },
  { href: "/establishments", label: "My Establishments", icon: "pin" },
  { href: "/hardware", label: "My Devices", icon: "qr" },

  { group: "AI Engine" },
  { href: "/ai/training", label: "AI Knowledge Base", icon: "brain" },
  { href: "/phone", label: "AI Phone Receptionist", icon: "phone", badge: "AI" },

  { group: "Reviews" },
  { href: "/reviews", label: "Review Feed", icon: "star" },
  { href: "/outreach", label: "Review Requests", icon: "send" },
  { href: "/reviews/dispute", label: "Dispute Center", icon: "flag" },

  { group: "Social & Messaging" },
  { href: "/support", label: "Unified Inbox", icon: "chat", pro: "advanced_inbox" },
  { href: "/support/meetings", label: "Meeting Requests", icon: "cal" },
  { href: "/social/posts", label: "Post Creator", icon: "share", pro: "image_creatives" },

  { group: "Engagement & CRM" },
  { href: "/surveys", label: "Customer Surveys", icon: "survey", pro: "surveys_insights" },
  { href: "/contacts", label: "Contact Directory", icon: "users" },

  { group: "Intelligence" },
  { href: "/analytics", label: "Business Reports", icon: "bars" },

  { group: "Settings" },
  { href: "/connections", label: "Connections", icon: "plug" },
  { href: "/subscription", label: "Account & Billing", icon: "card" },
  { href: "/settings/account", label: "Settings", icon: "settings" },
];

function pathMatches(pathname: string, href: string): boolean {
  if (href === "/reviews") {
    // keep Review Feed from swallowing /reviews/dispute (its own item)
    return pathname === "/reviews" || /^\/reviews\/(?!dispute)[^/]+$/.test(pathname);
  }
  if (href === "/support") {
    // keep Unified Inbox from swallowing /support/meetings (its own item)
    return pathname === "/support" || /^\/support\/(?!meetings)[^/]+/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  onNavigate,
  orgName,
  planLabel,
}: {
  onNavigate?: () => void;
  orgName: string;
  planLabel: string;
}) {
  const pathname = usePathname();
  const isPro = /pro|scale|business|enterprise/i.test(planLabel);

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

      <button type="button" className="sb__search" aria-label="Search">
        <Icon name="search" size={14} />
        <span>Search…</span>
        <kbd>⌘K</kbd>
      </button>

      <nav
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden", marginRight: -6, paddingRight: 6 }}
      >
        {NAV.map((n) => {
          if (isGroup(n)) {
            return (
              <div key={`g-${n.group}`} className="sb__group">
                {n.group}
              </div>
            );
          }

          // A Pro item is "locked" only when the org is NOT on a paid plan.
          const locked = Boolean(n.pro) && !isPro;
          const href = locked ? upgradeHref(n.pro) : n.href;

          return (
            <Link
              key={n.href}
              href={href}
              onClick={onNavigate}
              className={`sb__item${pathMatches(pathname, n.href) ? " is-active" : ""}`}
              aria-label={locked ? `${n.label} (Pro)` : undefined}
              title={locked ? `${n.label} — upgrade to Pro` : undefined}
              style={locked ? { color: "var(--rl-muted-2)" } : undefined}
            >
              <Icon name={n.icon} style={locked ? { opacity: 0.6 } : undefined} />
              <span style={{ flex: 1, opacity: locked ? 0.7 : undefined }}>{n.label}</span>
              {locked ? (
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
