/**
 * Read-side queries for auto-reply rules.
 *
 * Kept separate from `actions.ts` so server-component pages can import the
 * read path without dragging the "use server" boundary into their
 * dependency tree. (Next 15 doesn't actually care, but the split keeps the
 * Webpack chunking honest and the typing predictable.)
 */

import { withTenant } from "@/lib/db/with-tenant";
import type { AutoReplyRule } from "@prisma/client";

export interface AutoReplyRuleListItem {
  id: string;
  name: string;
  enabled: boolean;
  establishmentId: string | null;
  establishmentName: string | null;
  matchMinRating: number;
  matchMaxRating: number;
  matchKeywords: string[];
  matchSources: string[];
  action: string;
  delayMinutes: number;
  replyTone: string;
  fireCount: number;
  lastFiredAt: Date | null;
  createdAt: Date;
}

/**
 * List rules for the org. Optionally filtered to a single establishment.
 * Returns both per-listing and org-wide rules.
 *
 * Ordering matches the executor's evaluation order so the UI can show "this
 * is what would fire first" at a glance:
 *   1. Per-listing rules first (NULLS LAST means non-null first when ASC).
 *   2. Within each group, oldest first.
 */
export async function listAutoReplyRules(
  orgId: string,
  options: { establishmentId?: string } = {},
): Promise<AutoReplyRuleListItem[]> {
  return withTenant(orgId, async (tx) => {
    const rows = await tx.autoReplyRule.findMany({
      where: options.establishmentId
        ? {
            OR: [{ establishmentId: options.establishmentId }, { establishmentId: null }],
          }
        : undefined,
      include: {
        establishment: { select: { id: true, name: true } },
      },
      orderBy: [{ establishmentId: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    });
    return rows.map(serialize);
  });
}

/** Single rule for the edit page. Returns null on miss. */
export async function getAutoReplyRule(
  orgId: string,
  ruleId: string,
): Promise<AutoReplyRuleListItem | null> {
  return withTenant(orgId, async (tx) => {
    const row = await tx.autoReplyRule.findFirst({
      where: { id: ruleId },
      include: {
        establishment: { select: { id: true, name: true } },
      },
    });
    return row ? serialize(row) : null;
  });
}

/**
 * Establishments dropdown source for the create/edit form. Excludes
 * soft-deleted listings — a rule pointing at a deleted listing would
 * silently never fire, which is more confusing than the option being
 * absent.
 */
export async function listEstablishmentsForRuleForm(orgId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.establishment.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true },
    });
  });
}

function serialize(
  row: AutoReplyRule & { establishment: { id: string; name: string } | null },
): AutoReplyRuleListItem {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    establishmentId: row.establishment?.id ?? null,
    establishmentName: row.establishment?.name ?? null,
    matchMinRating: row.matchMinRating,
    matchMaxRating: row.matchMaxRating,
    matchKeywords: row.matchKeywords,
    matchSources: row.matchSources,
    action: row.action,
    delayMinutes: row.delayMinutes,
    replyTone: row.replyTone,
    fireCount: row.fireCount,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
  };
}
