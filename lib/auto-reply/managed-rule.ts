import { withTenant } from "@/lib/db/with-tenant";

/**
 * Managed 5★ auto-reply rule — shared constants + the read path (Module 06).
 *
 * The page-level "Auto-Reply to 5-Star Reviews" toggle is backed by a SINGLE
 * org-wide `AutoReplyRule` with a reserved name, so the entire existing
 * executor → safety → schedule → publish-cron pipeline drives it for free.
 *
 * This module is intentionally NOT `"use server"`: it holds the reserved name
 * constant + type (which a server-actions file may not export) and the
 * read-only state lookup, so server components (the reviews page, the rules
 * page) can import them without dragging an action boundary into their tree.
 * The write lives in `./toggle.ts` (`setAutoReply5Star`).
 */

/** Reserved name for the single managed 5★ auto-reply rule. */
export const MANAGED_5STAR_RULE_NAME = "__auto_reply_5star";

export type AutoReply5StarState = { enabled: boolean };

/**
 * Read-only: is the managed 5★ auto-reply rule present and enabled?
 *
 * Fail-soft: the `auto_reply_rules` table is established, but we still treat a
 * missing-table / missing-column Postgres error (42P01 / 42703) as "off"
 * rather than 500-ing the reviews page (consistent with the un-migrated-DB
 * guardrail for new-model access).
 */
export async function getAutoReply5StarState(orgId: string): Promise<AutoReply5StarState> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rule = await tx.autoReplyRule.findFirst({
        where: { name: MANAGED_5STAR_RULE_NAME, establishmentId: null },
        select: { enabled: true },
      });
      return { enabled: rule?.enabled ?? false };
    });
  } catch (err) {
    // Prisma surfaces missing relations as P2021/P2022; raw paths carry the
    // Postgres 42P01/42703 codes directly. Treat both as "off".
    const code = (err as { code?: string } | null)?.code;
    if (code === "42P01" || code === "42703" || code === "P2021" || code === "P2022") {
      return { enabled: false };
    }
    throw err;
  }
}
