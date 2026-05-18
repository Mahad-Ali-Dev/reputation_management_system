"use client";

import { Avatar } from "@/components/shell/avatar";
import { Icon, type IconName } from "@/components/shell/icon";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Persistent sidebar nav — 244px glass-blur shell per the repulabs v2 design.
 *
 * Structure ported from the design handoff (project/repu.jsx NAV), with hrefs
 * mapped to actual app routes. Groups: Workspace, Reputation, Engagement,
 * Intelligence, Settings.
 *
 * Active state: highlights the link matching the current pathname. Items with
 * children auto-expand when any child route is active.
 *
 * Public API matches the previous component: { onNavigate?, orgName, planLabel }.
 */

type NavSubitem = { href: string; label: string };
type NavLink = {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
  children?: NavSubitem[];
};
type NavGroup = { group: string };
type NavItem = NavLink | NavGroup;

function isGroup(x: NavItem): x is NavGroup {
  return "group" in x;
}

const NAV: NavItem[] = [
  { group: "Workspace" },
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/establishments", label: "Listings", icon: "building" },
  { href: "/hardware", label: "QR Stands", icon: "qr" },

  { group: "Reputation" },
  {
    href: "/outreach",
    label: "Review Requests",
    icon: "send",
    children: [
      { href: "/outreach/send", label: "One-off send" },
      { href: "/outreach/bulk", label: "Automations" },
      { href: "/contacts", label: "Recipients" },
    ],
  },
  {
    href: "/reviews",
    label: "Reviews",
    icon: "star",
    children: [
      { href: "/reviews", label: "All reviews" },
      { href: "/reviews/dispute", label: "Dispute" },
      { href: "/reviews/replies", label: "Replies" },
      { href: "/reviews/auto-reply", label: "Auto-reply" },
    ],
  },
  {
    href: "/surveys",
    label: "Surveys",
    icon: "survey",
    children: [
      { href: "/surveys", label: "Campaigns" },
      { href: "/surveys/new", label: "Templates" },
      { href: "/surveys/coupons", label: "Coupons" },
    ],
  },

  { group: "Engagement" },
  {
    href: "/support",
    label: "Support Inbox",
    icon: "chat",
    children: [
      { href: "/support/comments", label: "Comments" },
      { href: "/support/dms", label: "DMs" },
      { href: "/support/live-chat", label: "Live chat" },
      { href: "/support/customers", label: "Visitors" },
      { href: "/support/chat-automation", label: "Automations" },
      { href: "/support/analytics", label: "Analytics" },
    ],
  },
  {
    href: "/social/posts",
    label: "Social Studio",
    icon: "share",
    children: [
      { href: "/social/posts", label: "Create post" },
      { href: "/social/posts/bulk", label: "Bulk schedule" },
      { href: "/social/calendar", label: "Calendar" },
    ],
  },

  { group: "Intelligence" },
  { href: "/ai/training", label: "AI Training", icon: "brain" },
  { href: "/phone", label: "Phone Receptionist", icon: "phone", badge: "AI" },

  { group: "Settings" },
  { href: "/connections", label: "Connections", icon: "plug" },
  { href: "/subscription", label: "Subscription", icon: "card" },
  { href: "/settings/account", label: "Account", icon: "settings" },
];

function pathMatches(pathname: string, href: string): boolean {
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
          width={32}
          height={32}
          priority
          style={{ borderRadius: 8, objectFit: "contain", flex: "0 0 32px" }}
        />
        <div className="sb__brandname">
          repu<span>labs</span>
        </div>
        <Icon name="chevD" size={12} style={{ marginLeft: "auto", color: "var(--rl-muted)" }} />
      </Link>

      <button type="button" className="sb__search" aria-label="Search">
        <Icon name="search" size={13} />
        <span>Search…</span>
        <kbd>⌘K</kbd>
      </button>

      <div
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
          return <SidebarItem key={n.href} item={n} pathname={pathname} onNavigate={onNavigate} />;
        })}
      </div>

      <div className="sb__bottom">
        <Link href="/settings/account" onClick={onNavigate} className="sb__profile">
          <Avatar name={orgName || "User"} size={28} tone={5} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {orgName}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--rl-muted)" }}>{planLabel}</div>
          </div>
          <Icon name="chevR" size={12} style={{ color: "var(--rl-muted-2)" }} />
        </Link>
      </div>
    </aside>
  );
}

function SidebarItem({
  item,
  pathname,
  onNavigate,
}: {
  item: NavLink;
  pathname: string;
  onNavigate?: () => void;
}) {
  const selfActive = pathMatches(pathname, item.href);
  const childActive = !!item.children?.some((c) => pathMatches(pathname, c.href));
  const isActive = selfActive || childActive;
  const [open, setOpen] = useState<boolean>(isActive);

  // Re-open when navigating to a child route from outside
  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);

  return (
    <div>
      <Link
        href={item.href}
        onClick={(e) => {
          if (item.children) {
            e.preventDefault();
            setOpen((o) => !o);
          } else {
            onNavigate?.();
          }
        }}
        className={`sb__item${isActive ? " is-active" : ""}`}
      >
        <Icon name={item.icon} />
        <span style={{ flex: 1 }}>{item.label}</span>
        {item.badge && <span className="sb__badge">{item.badge}</span>}
        {item.children && !item.badge && (
          <Icon
            name={open ? "chevD" : "chevR"}
            size={11}
            style={{ color: isActive ? "var(--pri-300)" : "var(--rl-muted-2)" }}
          />
        )}
      </Link>
      {item.children && open && (
        <div className="sb__sub">
          {item.children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              onClick={onNavigate}
              className={`sb__subitem${pathMatches(pathname, c.href) ? " is-active" : ""}`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
