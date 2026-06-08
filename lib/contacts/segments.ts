/**
 * Dynamic contact segments (module 12, Wave 3b).
 *
 * There is deliberately NO `ContactSegment` table. The acceptance criteria call
 * for *pre-built, self-counting* segments (Recent Customers, VIP, High NPS, …) —
 * these are **derived predicates**, not user-authored saved rows. So a segment
 * is a code-defined **saved-filter definition**: a key + label + description + a
 * `where()` builder that produces a `Prisma.ContactWhereInput`.
 *
 * Tenant scoping comes from `withTenant` (RLS), so the predicates here do NOT
 * embed `organizationId` — they are composed inside an already org-scoped query
 * (see `buildContactWhere` in queries.ts). This keeps the SAME predicate usable
 * for both a segment's live `count()` and the directory's `?seg=` filter, so
 * "View Contacts →" lands on exactly the rows the count promised.
 *
 *  - `segmentWhere(key)`        → predicate for one segment (or null if unknown).
 *  - `evaluateSegment(filter)`  → live `count()` for an arbitrary filter def.
 *  - `recountSegments(orgId)`   → count every segment in one tenant tx (the
 *                                 rollup cron + the Segments tab both call this).
 *
 * Everything fails soft: a count over not-yet-migrated columns (e.g. `vip`,
 * `lastActivityAt`) returns 0 rather than throwing, so the page never 500s
 * before the founder applies the migration.
 *
 * Pure predicate builders are exported for unit testing without a DB.
 */

import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { softQuery } from "./fail-soft";

/** A connection a segment depends on (disabled CTA until connected). */
export type SegmentRequiresConnection = "shopify";

export interface SegmentDef {
  key: string;
  label: string;
  description: string;
  /** Build the Prisma filter for this segment (tenant scope via RLS). */
  where: () => Prisma.ContactWhereInput;
  /** When set, the UI shows a "Connect <provider>" CTA until connected. */
  requiresConnection?: SegmentRequiresConnection;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** `>= now - 30d`, computed at call time so counts are always fresh. */
function thirtyDaysAgo(): Date {
  return new Date(Date.now() - THIRTY_DAYS_MS);
}

/** Start of the current calendar month (UTC). */
function startOfThisMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * The canonical segment catalog. Order here is the display order in the
 * Segments tab. Predicates are tenant-agnostic (RLS scopes them); they compose
 * cleanly into the directory's AND-filter.
 */
export const SEGMENTS: readonly SegmentDef[] = [
  {
    key: "recent",
    label: "Recent Customers",
    description: "Contacts active in the last 30 days.",
    where: () => ({
      OR: [{ lastActivityAt: { gte: thirtyDaysAgo() } }, { lastContactedAt: { gte: thirtyDaysAgo() } }],
    }),
  },
  {
    key: "vip",
    label: "VIP",
    description: "Flagged VIPs and contacts tagged “vip”.",
    where: () => ({ OR: [{ vip: true }, { tags: { has: "vip" } }] }),
  },
  {
    key: "new_this_month",
    label: "New This Month",
    description: "Contacts added since the start of this month.",
    where: () => ({ createdAt: { gte: startOfThisMonth() } }),
  },
  {
    key: "has_phone",
    label: "Has Phone",
    description: "Contacts with a phone number on file (SMS-reachable).",
    where: () => ({ phone: { not: null } }),
  },
  {
    key: "has_email",
    label: "Has Email",
    description: "Contacts with an email address on file.",
    where: () => ({ email: { not: null } }),
  },
  {
    key: "no_contact_info",
    label: "Missing Contact Info",
    description: "Contacts with neither email nor phone — enrich these.",
    where: () => ({ email: null, phone: null }),
  },
  {
    key: "shopify",
    label: "Shopify Customers",
    description: "Contacts synced from a connected Shopify store.",
    requiresConnection: "shopify",
    where: () => ({ source: "shopify" }),
  },
] as const;

const BY_KEY: Record<string, SegmentDef> = Object.fromEntries(
  SEGMENTS.map((s) => [s.key, s]),
);

/** Look up a segment definition by key (undefined when unknown). */
export function getSegment(key: string | null | undefined): SegmentDef | undefined {
  if (!key || key === "all") return undefined;
  return BY_KEY[key];
}

/**
 * The where-predicate for `?seg=<key>`. Returns `null` for an unknown key so the
 * Contacts list can ignore a bad/stale segment param instead of throwing. Shared
 * verbatim with the Segments tab counts so list length == displayed count.
 */
export function segmentWhere(key: string | null | undefined): Prisma.ContactWhereInput | null {
  const def = getSegment(key);
  return def ? def.where() : null;
}

export interface SegmentCount {
  key: string;
  label: string;
  description: string;
  count: number;
  requiresConnection?: SegmentRequiresConnection;
}

/**
 * Run a live `count()` for one filter definition inside the given tenant
 * transaction. Exposed as `evaluateSegment(filter)` per the module contract.
 * Fail-soft → 0 when the predicate touches a not-yet-migrated column.
 */
export async function evaluateSegment(
  tx: Prisma.TransactionClient,
  def: Pick<SegmentDef, "key" | "where">,
): Promise<number> {
  return softQuery(() => tx.contact.count({ where: def.where() }), 0, {
    event: "contacts.segment_count_failed",
    context: { segment: def.key },
  });
}

function zeroCounts(): SegmentCount[] {
  return SEGMENTS.map((def) => ({
    key: def.key,
    label: def.label,
    description: def.description,
    count: 0,
    ...(def.requiresConnection ? { requiresConnection: def.requiresConnection } : {}),
  }));
}

/**
 * Count every segment for an org in a single tenant transaction (cheap: N
 * COUNTs over indexed predicates). The rollup cron calls this to keep the
 * Segments tab fast; the tab itself can also call it per request. Each count is
 * independently fail-soft so one bad predicate can't zero the rest, and a
 * whole-transaction failure degrades to all-zero rather than throwing.
 */
export async function recountSegments(orgId: string): Promise<SegmentCount[]> {
  return withTenant(orgId, async (tx) => {
    const out: SegmentCount[] = [];
    for (const def of SEGMENTS) {
      const count = await evaluateSegment(tx, def);
      out.push({
        key: def.key,
        label: def.label,
        description: def.description,
        count,
        ...(def.requiresConnection ? { requiresConnection: def.requiresConnection } : {}),
      });
    }
    return out;
  }).catch(() => zeroCounts());
}
