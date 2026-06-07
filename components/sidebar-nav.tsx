"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Persistent sidebar nav — repulabs v3 (clean redesign).
 *
 * Flat, grouped navigation matching the reference: a single Dashboard link
 * followed by grouped sections (Reputation, Engage, Grow, Settings). Each item
 * links straight to its section's main page; sub-navigation lives as in-page
 * tabs. Active state = blue-tint pill. A "Unlock more growth" upgrade card sits
 * at the bottom for non-Pro plans.
 *
 * Public API unchanged: { onNavigate?, orgName, planLabel }.
 */

type NavLink = { href: string; label: string; icon: IconName; badge?: string };
type NavGroup = { group: string };
type NavItem = NavLink | NavGroup;

const isGroup = (x: NavItem): x is NavGroup => "group" in x;

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },

  { group: "Reputation" },
  { href: "/reviews", label: "Reviews", icon: "star" },
  { href: "/outreach", label: "Requests", icon: "send" },
  { href: "/reviews/auto-reply", label: "Responses", icon: "reply" },
  { href: "/reviews/dispute", label: "Disputes", icon: "flag" },
  { href: "/surveys", label: "Surveys", icon: "survey" },
  { href: "/analytics", label: "Insights", icon: "bars" },

  { group: "Engage" },
  { href: "/support/comments", label: "Messages", icon: "chat" },
  { href: "/social/posts", label: "Social Posts", icon: "share" },
  { href: "/ai/training", label: "AI Assistant", icon: "sparkle" },
  { href: "/phone", label: "Phone AI", icon: "phone", badge: "AI" },

  { group: "Grow" },
  { href: "/establishments", label: "Listings", icon: "pin" },
  { href: "/hardware", label: "QR Stands", icon: "qr" },
  { href: "/contacts", label: "Contacts", icon: "users" },

  { group: "Settings" },
  { href: "/connections", label: "Integrations", icon: "plug" },
  { href: "/subscription", label: "Billing", icon: "card" },
  { href: "/settings/account", label: "Settings", icon: "settings" },
];

function pathMatches(pathname: string, href: string): boolean {
  if (href === "/reviews") {
    // keep Reviews from swallowing /reviews/auto-reply + /reviews/dispute
    return pathname === "/reviews" || /^\/reviews\/[^/]+$/.test(pathname);
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
        {NAV.map((n) =>
          isGroup(n) ? (
            <div key={`g-${n.group}`} className="sb__group">
              {n.group}
            </div>
          ) : (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              className={`sb__item${pathMatches(pathname, n.href) ? " is-active" : ""}`}
            >
              <Icon name={n.icon} />
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.badge && <span className="sb__badge">{n.badge}</span>}
            </Link>
          ),
        )}
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
              Upgrade Now
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
