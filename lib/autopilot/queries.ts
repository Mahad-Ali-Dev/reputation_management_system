/**
 * Autopilot read layer (Module 15 — Differentiators).
 *
 * Tenant-scoped reads for the `/autopilot` page + the dashboard summary card.
 * All tolerant of "no config yet" / unmigrated tables — return safe defaults so
 * a pre-migration `force-dynamic` page never 500s.
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import {
  type AutopilotActionRow,
  type AutopilotSummary,
  listAutopilotActions,
  summarizeAutopilotActions,
} from "./ledger";
import { policyFromRow, type AutopilotPolicy } from "./policy";

/** Postgres "relation/column does not exist" → table not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

export type AutopilotConfigView = AutopilotPolicy & {
  enabledAt: string | null;
  updatedAt: string | null;
  hasRow: boolean;
};

/**
 * The org's Autopilot config as a serializable view. Returns the default
 * (disabled) policy with `hasRow:false` when there's no row / unmigrated table.
 */
export async function getAutopilotConfig(orgId: string): Promise<AutopilotConfigView> {
  try {
    const row = await withTenant(orgId, (tx) =>
      tx.autopilotConfig.findUnique({ where: { organizationId: orgId } }),
    );
    const policy = policyFromRow(row);
    return {
      ...policy,
      enabledAt: row?.enabledAt ? row.enabledAt.toISOString() : null,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
      hasRow: !!row,
    };
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.error(
        { orgId, event: "autopilot.queries.config_failed", error: err instanceof Error ? err.message : String(err) },
        "getAutopilotConfig failed",
      );
    }
    const policy = policyFromRow(null);
    return { ...policy, enabledAt: null, updatedAt: null, hasRow: false };
  }
}

export type AutopilotOverview = {
  enabled: boolean;
  thisWeek: AutopilotSummary;
  requiresHuman: number;
  lastDigestSentAt: string | null;
};

/**
 * The dashboard/hero overview: this-week action summary, the "needs you" count,
 * and when the last weekly digest went out.
 */
export async function getAutopilotOverview(orgId: string): Promise<AutopilotOverview> {
  const weekStart = startOfWeek(new Date());
  const [config, summary, lastDigestSentAt] = await Promise.all([
    getAutopilotConfig(orgId),
    summarizeAutopilotActions(orgId, weekStart),
    lastDigestSent(orgId),
  ]);
  return {
    enabled: config.enabled,
    thisWeek: summary,
    requiresHuman: summary.requiresHuman,
    lastDigestSentAt,
  };
}

/** The most recent completed weekly-digest send time, or null. */
async function lastDigestSent(orgId: string): Promise<string | null> {
  try {
    const run = await withTenant(orgId, (tx) =>
      tx.autopilotDigestRun.findFirst({
        where: { completedAt: { not: null } },
        orderBy: { weekStart: "desc" },
        select: { completedAt: true },
      }),
    );
    return run?.completedAt ? run.completedAt.toISOString() : null;
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({ orgId, event: "autopilot.queries.last_digest_failed" }, "lastDigestSent failed");
    }
    return null;
  }
}

export type ActivityFeedItem = {
  id: string;
  loop: string;
  action: string;
  status: string;
  requiresHuman: boolean;
  resourceType: string | null;
  resourceId: string | null;
  detail: unknown;
  createdAt: string;
};

/** The page's activity feed (serializable). */
export async function getAutopilotActivityFeed(
  orgId: string,
  limit = 60,
): Promise<ActivityFeedItem[]> {
  const rows = await listAutopilotActions(orgId, { limit });
  return rows.map(toFeedItem);
}

/** The "needs you" queue (escalations + drafts awaiting a human). */
export async function getNeedsHumanQueue(orgId: string, limit = 30): Promise<ActivityFeedItem[]> {
  const rows = await listAutopilotActions(orgId, { requiresHuman: true, limit });
  return rows.map(toFeedItem);
}

function toFeedItem(r: AutopilotActionRow): ActivityFeedItem {
  return {
    id: r.id,
    loop: r.loop,
    action: r.action,
    status: r.status,
    requiresHuman: r.requiresHuman,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    detail: r.detail,
    createdAt: r.createdAt.toISOString(),
  };
}

/** Monday 00:00 UTC of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay(); // 0=Sun … 1=Mon
  const diff = (day + 6) % 7; // days since Monday
  utc.setUTCDate(utc.getUTCDate() - diff);
  return utc;
}
