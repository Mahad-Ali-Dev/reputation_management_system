/**
 * Shared, framework-neutral helpers + serialized prop shapes for the
 * Connections page (module 14_connections, Wave 3a).
 *
 * RSC SAFETY: the page is a SERVER component that reads the DB, but all the
 * interactivity (accordion toggles, connect/disconnect, the confirm modal)
 * lives in `'use client'` islands under `_components/`. Those islands may only
 * receive plain, JSON-serializable props — never Prisma rows or `Date` objects
 * (a `Date` crossing the server→client boundary either throws or silently
 * becomes a string). So the server page maps every connection into the
 * `SerializedConnection` shape below (dates → ISO strings) and these pure
 * helpers run on both sides without importing anything server-only.
 */

/** What the client islands receive per live connection. All JSON-safe. */
export type SerializedConnection = {
  id: string;
  provider: string;
  /** active | revoked | expired | error (raw `Connection.status`). */
  status: string;
  /** ISO string or null — never a Date across the RSC boundary. */
  lastSyncedAt: string | null;
  accountLabel: string | null;
  /** Surfaced sync error (Wave-0 column; null pre-migration). */
  syncError: string | null;
};

/** A provider row in the accordion, pre-resolved server-side. */
export type SerializedProviderRow = {
  id: string;
  displayName: string;
  description: string;
  /** Implementation is live + creds are pasteable (registry `ready`). */
  ready: boolean;
  /** Admin has pasted OAuth creds for this provider (`provider_apps`). */
  configured: boolean;
  /** Why a provider can't be connected yet (App Review, paid tier, …). */
  blockerNote: string | null;
  /** How the connection is made: oauth | api_key | embed | csv. */
  connType: "oauth" | "api_key" | "embed" | "csv";
  /** What it feeds the data spine: contacts | social | reviews | null. */
  syncs: "contacts" | "social" | "reviews" | null;
  /** The live connections for this provider (usually 0 or 1). */
  connections: SerializedConnection[];
};

/** One accordion section (Reviews / Social / POS / Email & CRM / …). */
export type SerializedSection = {
  key: string;
  label: string;
  subline: string;
  /** Icon name (from `components/shell/icon`). */
  icon: string;
  providers: SerializedProviderRow[];
  connectedCount: number;
  total: number;
};

/** The status pill a provider row / table row renders. */
export type ConnPillTone = "ok" | "warn" | "bad" | "neutral";
export type ConnPill = { label: string; tone: ConnPillTone };

/**
 * Collapse a provider's connections into a single status pill.
 *   - any `error` row            → "Error" (bad)
 *   - an `active` row            → "Connected" (ok)
 *   - an `expired`/`revoked` row → "Needs attention" (warn)
 *   - nothing                    → "Not connected" (neutral)
 */
export function connectionPill(conns: Pick<SerializedConnection, "status">[]): ConnPill {
  if (conns.some((c) => c.status === "error")) return { label: "Error", tone: "bad" };
  if (conns.some((c) => c.status === "active")) return { label: "Connected", tone: "ok" };
  if (conns.some((c) => c.status === "expired" || c.status === "revoked")) {
    return { label: "Needs attention", tone: "warn" };
  }
  return { label: "Not connected", tone: "neutral" };
}

/** True when a provider has at least one usable (active) connection. */
export function isConnected(conns: Pick<SerializedConnection, "status">[]): boolean {
  return conns.some((c) => c.status === "active");
}

/** The newest lastSyncedAt across a provider's connections (ISO or null). */
export function newestSync(conns: Pick<SerializedConnection, "lastSyncedAt">[]): string | null {
  let best: number | null = null;
  let bestIso: string | null = null;
  for (const c of conns) {
    if (!c.lastSyncedAt) continue;
    const t = Date.parse(c.lastSyncedAt);
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) {
      best = t;
      bestIso = c.lastSyncedAt;
    }
  }
  return bestIso;
}

/**
 * "2m ago" / "3h ago" / "5d ago" from an ISO string. Pure + deterministic
 * given `now` (defaults to Date.now()), so it's safe to call on the client.
 * Returns "—" for null/unparseable.
 */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const ms = now - t;
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Re-exported so existing `./_lib/format` imports across this route tree
// don't need to change — canonical definition lives in the provider registry
// since app/admin/providers/** needs it too (the setup instructions' callback
// URL), not just this route tree.
export { authorizeRouteSlug } from "@/lib/providers/registry";

/** Title-case a provider id: `square_pos` → `Square Pos`. */
export function prettyProvider(p: string): string {
  return p
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Human label for a connection type, used in the Connected Systems table. */
export function connTypeLabel(connType: SerializedProviderRow["connType"]): string {
  switch (connType) {
    case "oauth":
      return "OAuth";
    case "api_key":
      return "API key";
    case "embed":
      return "Embed";
    case "csv":
      return "CSV";
    default:
      return "—";
  }
}

/** Human label for what a provider syncs, used as a sub-detail. */
export function syncsLabel(syncs: SerializedProviderRow["syncs"]): string | null {
  switch (syncs) {
    case "contacts":
      return "Syncs customers";
    case "social":
      // NOT "Comments & DMs": that describes the Unified Inbox, which is behind
      // the coming-soon lock. What a connected social provider does today is
      // publish — so say that rather than advertising a locked capability.
      return "Publishing";
    case "reviews":
      return "Syncs reviews";
    default:
      return null;
  }
}
