/**
 * Autopilot action ledger (Module 15 — Differentiators).
 *
 * Every agentic loop that Autopilot governs writes an `AutopilotAction` row here
 * when it acts ("published a 5★ reply", "scheduled a review request", "escalated
 * to you"). This ledger is the SOURCE OF TRUTH for the weekly digest's "what I
 * did" + "what needs you" sections and the `/autopilot` activity feed.
 *
 * `recordAutopilotAction` is BEST-EFFORT by design: a ledger hiccup (or an
 * unmigrated `autopilot_actions` table) must NEVER break the calling loop, so
 * every write is wrapped and swallowed-with-log. The read helpers degrade to
 * empty on a missing table.
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

export type AutopilotLedgerLoop =
  | "auto_reply"
  | "low_star_draft"
  | "review_request"
  | "voice_review"
  | "dispute"
  | "geo_post"
  | "inbox_reply"
  | "escalation";

export type AutopilotLedgerAction = "published" | "drafted" | "scheduled_request" | "escalated";

/** Postgres "relation/column does not exist" → table not migrated. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("42P01") || msg.includes("42703");
}

/**
 * Record one Autopilot action. Best-effort — returns silently on failure (after
 * logging) so the calling loop is never interrupted. `requiresHuman` flags the
 * "needs you" queue (escalations, drafts awaiting approval).
 */
export async function recordAutopilotAction(args: {
  orgId: string;
  loop: AutopilotLedgerLoop;
  action: AutopilotLedgerAction;
  resourceType?: string | null;
  resourceId?: string | null;
  status?: "done" | "pending" | "failed";
  requiresHuman?: boolean;
  detail?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await withTenant(args.orgId, (tx) =>
      tx.autopilotAction.create({
        data: {
          organizationId: args.orgId,
          loop: args.loop,
          action: args.action,
          resourceType: args.resourceType ?? null,
          resourceId: args.resourceId ?? null,
          status: args.status ?? "done",
          requiresHuman: args.requiresHuman ?? false,
          detail: (args.detail ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      }),
    );
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn(
        { orgId: args.orgId, loop: args.loop, event: "autopilot.ledger.table_not_ready" },
        "autopilot_actions not migrated — ledger write skipped",
      );
      return;
    }
    logger.error(
      {
        orgId: args.orgId,
        loop: args.loop,
        event: "autopilot.ledger.write_failed",
        error: err instanceof Error ? err.message : String(err),
      },
      "autopilot ledger write failed (swallowed)",
    );
  }
}

export type AutopilotActionRow = {
  id: string;
  loop: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  status: string;
  requiresHuman: boolean;
  detail: unknown;
  createdAt: Date;
};

/**
 * List recent Autopilot actions (newest first), optionally filtered. Degrades to
 * [] on a missing table.
 */
export async function listAutopilotActions(
  orgId: string,
  opts: { since?: Date; loop?: string; requiresHuman?: boolean; limit?: number } = {},
): Promise<AutopilotActionRow[]> {
  try {
    const rows = await withTenant(orgId, (tx) =>
      tx.autopilotAction.findMany({
        where: {
          ...(opts.since ? { createdAt: { gte: opts.since } } : {}),
          ...(opts.loop ? { loop: opts.loop } : {}),
          ...(opts.requiresHuman !== undefined ? { requiresHuman: opts.requiresHuman } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: Math.min(opts.limit ?? 100, 500),
        select: {
          id: true,
          loop: true,
          action: true,
          resourceType: true,
          resourceId: true,
          status: true,
          requiresHuman: true,
          detail: true,
          createdAt: true,
        },
      }),
    );
    return rows as AutopilotActionRow[];
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.error(
        { orgId, event: "autopilot.ledger.list_failed", error: err instanceof Error ? err.message : String(err) },
        "autopilot ledger list failed",
      );
    }
    return [];
  }
}

export type AutopilotSummary = {
  /** Total actions in the window. */
  total: number;
  /** Count per loop (e.g. { auto_reply: 12, review_request: 8 }). */
  byLoop: Record<string, number>;
  /** Count per action (published/drafted/scheduled_request/escalated). */
  byAction: Record<string, number>;
  /** Items flagged for a human (escalations + drafts awaiting approval). */
  requiresHuman: number;
};

/**
 * Summarize actions since a point in time — the digest's "what I did" counts +
 * the "what needs you" queue size. Degrades to all-zeros on a missing table.
 */
export async function summarizeAutopilotActions(
  orgId: string,
  since: Date,
): Promise<AutopilotSummary> {
  const empty: AutopilotSummary = { total: 0, byLoop: {}, byAction: {}, requiresHuman: 0 };
  try {
    const rows = await withTenant(orgId, (tx) =>
      tx.autopilotAction.findMany({
        where: { createdAt: { gte: since } },
        select: { loop: true, action: true, requiresHuman: true },
        take: 5000,
      }),
    );
    const summary: AutopilotSummary = { total: rows.length, byLoop: {}, byAction: {}, requiresHuman: 0 };
    for (const r of rows) {
      summary.byLoop[r.loop] = (summary.byLoop[r.loop] ?? 0) + 1;
      summary.byAction[r.action] = (summary.byAction[r.action] ?? 0) + 1;
      if (r.requiresHuman) summary.requiresHuman += 1;
    }
    return summary;
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.error(
        { orgId, event: "autopilot.ledger.summary_failed", error: err instanceof Error ? err.message : String(err) },
        "autopilot ledger summary failed",
      );
    }
    return empty;
  }
}
