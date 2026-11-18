"use client";

import { openAskAi } from "@/components/ask-ai";
import { openCommandPalette } from "@/components/command-palette";
import { LockIcon, upgradeHref } from "@/components/pro-gate";
import { Icon, type IconName } from "@/components/shell/icon";
import { type AccessTabKey, accessTabLabel } from "@/lib/access/tabs";
import type { FeatureKey } from "@/lib/billing/feature-access";
import { ChevronDown, Gift, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Persistent sidebar nav — Hostinger-style structure (2026-11), unified IA.
 *
 * Lives inside the framed shell's rounded sheet (logo is in the full-width
 * top bar). A pinned top block (Dashboard, AI Autopilot, Ask Repulabs AI,
 * Search ⌘K), then titled sections with chevron toggles (collapsed state is
 * remembered; a section holding the current page always stays open). Every
 * row has an icon. Footer: workspace avatar + name + plan, plus an "Upgrade
 * to Pro" pill for non-Pro plans. Each item links straight to its section's
 * main page; sub-navigation lives as in-page tabs (`<TabBar>`).
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

  { group: "Business Setup" },
  { href: "/establishments", label: "My Businesses", icon: "pin", tab: "establishments" },
  { href: "/hardware", label: "Device Manager", icon: "qr", tab: "hardware" },

  { group: "AI Tools" },
  { href: "/ai", label: "AI Brain", icon: "brain", tab: "ai" },
  // Hidden per request — AI Receptionist. Restore this line to show it again.
  // { href: "/phone", label: "AI Receptionist", icon: "phone", badge: "Soon", tab: "phone" },

  { group: "Reputation" },
  { href: "/reviews", label: "Review Inbox", icon: "star", tab: "reviews" },
  { href: "/outreach", label: "Review Outreach", icon: "send", tab: "outreach" },
  { href: "/reviews/dispute", label: "Dispute Manager", icon: "flag", tab: "dispute" },

  { group: "Inbox & Social" },
  // Hidden per request — Message Center. Restore this line to show it again.
  // { href: "/support", label: "Message Center", icon: "chat", badge: "Soon", tab: "support" },
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

  { group: "CRM" },
  {
    href: "/surveys",
    label: "Customer Feedback",
    icon: "survey",
    pro: "surveys_insights",
    tab: "surveys",
  },
  { href: "/contacts", label: "Customer Directory", icon: "users", tab: "contacts" },

  { group: "Data & Insights" },
  { href: "/analytics", label: "Analytics", icon: "bars", tab: "analytics" },

  { group: "Account" },
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

/** "PRO" → "Pro", "FREE" → "Free". */
const planName = (p: string) => (p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "");

/** Up to two initials for the workspace avatar ("Summit Dental Studio" → "SD"). */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "R";

type Section = { title: string | null; items: NavLink[] };

/** NAV → [pinned top block, …titled sections]. */
const SECTIONS: Section[] = NAV.reduce<Section[]>(
  (acc, n) => {
    if (isGroup(n)) acc.push({ title: n.group, items: [] });
    else acc[acc.length - 1]?.items.push(n);
    return acc;
  },
  [{ title: null, items: [] }],
);

const COLLAPSED_KEY = "rl-sb-closed-groups";

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

  // Collapsible section headers (Hostinger-style chevrons), remembered per browser.
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      if (raw) setClosed(JSON.parse(raw));
    } catch {}
  }, []);
  const toggleGroup = (title: string) =>
    setClosed((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const renderItem = (n: NavLink) => {
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
    const active = pathMatches(pathname, n.href, activeTab);

    return (
      <Link
        key={n.href}
        href={href}
        onClick={onNavigate}
        className={`sb__item${active ? " is-active" : ""}`}
        aria-current={active ? "page" : undefined}
        aria-label={
          restricted ? `${n.label} (Restricted)` : locked ? `${n.label} (Pro)` : undefined
        }
        title={
          restricted
            ? `${n.label} restricted by your workspace admin`
            : locked
              ? `${n.label} upgrade to Pro`
              : undefined
        }
        style={locked ? { color: "var(--rl-muted-2)" } : undefined}
      >
        <Icon name={n.icon} className="sb__ico" style={locked ? { opacity: 0.6 } : undefined} />
        <span className="sb__label" style={{ flex: 1, opacity: locked ? 0.7 : undefined }}>
          {n.label}
        </span>
        {restricted ? (
          <Icon
            name="lock"
            size={13}
            style={{ color: "var(--rl-muted-2)", marginLeft: "auto" }}
            title="Restricted by your workspace admin"
          />
        ) : proLocked ? (
          <span style={{ marginLeft: "auto", display: "inline-flex" }}>
            <LockIcon size={13} />
          </span>
        ) : (
          n.badge && <span className="sb__badge">{n.badge}</span>
        )}
      </Link>
    );
  };

  return (
    <aside className="sb sb--hs">
      <nav className="sb__nav" aria-label="Main">
        {SECTIONS.map((sec, i) => {
          if (!sec.title) {
            return (
              <div key="top" className="sb__section">
                {sec.items.map(renderItem)}
                {/* Start a conversation with Repulabs AI (Hostinger's "Agent" slot). */}
                <button
                  type="button"
                  className="sb__item"
                  onClick={() => {
                    onNavigate?.();
                    openAskAi();
                  }}
                >
                  <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" className="sb__ico" />
                  <span className="sb__label">Ask Repulabs AI</span>
                </button>
                <button
                  type="button"
                  className="sb__item"
                  aria-label="Search and navigate (Command or Control + K)"
                  onClick={() => {
                    onNavigate?.();
                    openCommandPalette();
                  }}
                >
                  <Search size={18} strokeWidth={1.75} aria-hidden="true" className="sb__ico" />
                  <span className="sb__label" style={{ flex: 1 }}>
                    Search
                  </span>
                  <kbd className="sb__kbd">⌘K</kbd>
                </button>
              </div>
            );
          }
          const title = sec.title;
          // A section holding the current page never hides it.
          const hasActive = sec.items.some((n) => pathMatches(pathname, n.href, activeTab));
          const open = hasActive || !closed.includes(title);
          const id = `sb-sec-${i}`;
          return (
            <div key={title} className="sb__section">
              <button
                type="button"
                className="sb__group"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => toggleGroup(title)}
              >
                <span>{title}</span>
                <ChevronDown
                  size={15}
                  strokeWidth={2}
                  aria-hidden="true"
                  className={`sb__chev${open ? "" : " is-closed"}`}
                />
              </button>
              {open && <div id={id}>{sec.items.map(renderItem)}</div>}
            </div>
          );
        })}
      </nav>

      {/* Pinned footer: who you are + one offer pill for non-Pro plans. */}
      <div className="sb__bottom">
        <Link href="/settings" onClick={onNavigate} className="sb__profile">
          <span className="sb__av" aria-hidden="true">
            {initials(orgName)}
          </span>
          <span className="sb__who">
            <span className="sb__who-name">{orgName}</span>
            <span className="sb__who-plan">{planName(planLabel)}</span>
          </span>
        </Link>
        {!isPro && (
          <Link href="/subscription" onClick={onNavigate} className="sb__offer">
            <Gift size={15} strokeWidth={1.9} aria-hidden="true" />
            Upgrade to Pro
          </Link>
        )}
      </div>
    </aside>
  );
}
