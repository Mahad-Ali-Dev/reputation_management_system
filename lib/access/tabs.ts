import type { IconName } from "@/components/shell/icon";

/**
 * Canonical catalog of restrictable sidebar sections ("tabs"), keyed by a
 * stable id independent of href/label. Mirrors the `NAV` list in
 * components/sidebar-nav.tsx, minus Dashboard and Settings — those two are
 * never restrictable (see the note on `TAB_CATALOG` below).
 *
 * Used in three places that all need to agree on the same keys:
 *   1. The invite-teammate checkbox grid (app/settings/team/_components).
 *   2. The sidebar's locked/unlocked rendering (components/sidebar-nav.tsx).
 *   3. Server-side enforcement (matchTabForPath, called from
 *      lib/auth/org-context.ts on every tenant page load).
 */
export type AccessTabKey =
  | "autopilot"
  | "establishments"
  | "hardware"
  | "ai"
  | "phone"
  | "reviews"
  | "outreach"
  | "dispute"
  | "support"
  | "social"
  | "surveys"
  | "contacts"
  | "analytics"
  | "connections"
  | "subscription";

export type AccessTab = {
  key: AccessTabKey;
  label: string;
  icon: IconName;
  group: string;
  /** Does `pathname` (no query string) belong to this tab? */
  matches: (pathname: string) => boolean;
};

function prefix(base: string) {
  return (pathname: string) => pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Dashboard (`/dashboard`) and Settings (`/settings*`) are deliberately NOT in
 * this catalog — they're account chrome, not a product feature, and Dashboard
 * in particular has to stay reachable for EVERYONE (it's where a blocked nav
 * click and the post-login redirect both land). Settings keeps its own
 * existing role gates (billing/team actions already require "admin" via
 * requireRole) rather than being tab-restrictable on top of that.
 */
export const TAB_CATALOG: AccessTab[] = [
  { key: "autopilot", label: "Autopilot", icon: "bolt", group: "Dashboard", matches: prefix("/autopilot") },
  {
    key: "establishments",
    label: "My Establishments",
    icon: "pin",
    group: "Device Setup",
    matches: prefix("/establishments"),
  },
  { key: "hardware", label: "My Devices", icon: "qr", group: "Device Setup", matches: prefix("/hardware") },
  { key: "ai", label: "AI Knowledge Base", icon: "brain", group: "AI Engine", matches: prefix("/ai") },
  {
    key: "phone",
    label: "AI Phone Receptionist",
    icon: "phone",
    group: "AI Engine",
    matches: prefix("/phone"),
  },
  {
    key: "reviews",
    label: "Review Feed",
    icon: "star",
    group: "Reviews",
    // /reviews/dispute* belongs to the separate "Dispute Center" tab.
    matches: (p) => p === "/reviews" || (p.startsWith("/reviews/") && !p.startsWith("/reviews/dispute")),
  },
  { key: "outreach", label: "Review Requests", icon: "send", group: "Reviews", matches: prefix("/outreach") },
  {
    key: "dispute",
    label: "Dispute Center",
    icon: "flag",
    group: "Reviews",
    matches: prefix("/reviews/dispute"),
  },
  {
    key: "support",
    label: "Unified Inbox & Meetings",
    icon: "chat",
    group: "Social & Messaging",
    matches: prefix("/support"),
  },
  {
    key: "social",
    label: "Post Creator",
    icon: "share",
    group: "Social & Messaging",
    matches: prefix("/social"),
  },
  {
    key: "surveys",
    label: "Customer Surveys",
    icon: "survey",
    group: "Engagement & CRM",
    matches: prefix("/surveys"),
  },
  {
    key: "contacts",
    label: "Contact Directory",
    icon: "users",
    group: "Engagement & CRM",
    matches: prefix("/contacts"),
  },
  {
    key: "analytics",
    label: "Business Reports",
    icon: "bars",
    group: "Intelligence",
    matches: prefix("/analytics"),
  },
  {
    key: "connections",
    label: "Connections",
    icon: "plug",
    group: "Settings",
    matches: prefix("/connections"),
  },
  {
    key: "subscription",
    label: "Account & Billing",
    icon: "card",
    group: "Settings",
    matches: prefix("/subscription"),
  },
];

const TAB_BY_KEY = new Map(TAB_CATALOG.map((t) => [t.key, t]));
const VALID_KEYS = new Set<string>(TAB_CATALOG.map((t) => t.key));

export function isAccessTabKey(value: string): value is AccessTabKey {
  return VALID_KEYS.has(value);
}

/** Whitelist-filter arbitrary form input down to known tab keys. Never trust
 *  client-submitted strings directly — an invalid key silently drops instead
 *  of being stored. */
export function sanitizeTabKeys(values: string[]): AccessTabKey[] {
  return values.filter(isAccessTabKey);
}

export function accessTabLabel(key: string): string {
  return TAB_BY_KEY.get(key as AccessTabKey)?.label ?? key;
}

/** Which catalog tab (if any) does this pathname belong to? Longest-prefix
 *  match isn't needed — "dispute" and "reviews" are the only overlapping
 *  pair and "reviews"'s matcher already excludes the dispute subtree. */
export function matchTabForPath(pathname: string): AccessTab | null {
  for (const tab of TAB_CATALOG) {
    if (tab.matches(pathname)) return tab;
  }
  return null;
}

/** Grouped view for the invite-teammate checkbox grid, in catalog order. */
export function tabsByGroup(): Array<{ group: string; tabs: AccessTab[] }> {
  const groups: Array<{ group: string; tabs: AccessTab[] }> = [];
  for (const tab of TAB_CATALOG) {
    const g = groups.find((x) => x.group === tab.group);
    if (g) g.tabs.push(tab);
    else groups.push({ group: tab.group, tabs: [tab] });
  }
  return groups;
}
