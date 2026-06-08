import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Survey Automations — shared consts, types, and the read query (Module 11).
 *
 * Split out of `automation-actions.ts` because that file is `"use server"` and
 * may export ONLY async server actions. The trigger enum, the provider map, the
 * row type, and the list query live here (plain server module) so client
 * components and the page can import them without violating the action rule.
 */

/**
 * The closed set of trigger events. `manual` + `post_purchase`/`post_visit`
 * need no integration; the rest require a connected provider.
 */
export const TRIGGER_EVENTS = [
  "manual",
  "post_purchase",
  "post_visit",
  "shopify_order",
  "square_sale",
] as const;
export type TriggerEvent = (typeof TRIGGER_EVENTS)[number];

/** Map a trigger event to the connection provider it requires (or null). */
export const TRIGGER_PROVIDER: Record<TriggerEvent, string | null> = {
  manual: null,
  post_purchase: null,
  post_visit: null,
  shopify_order: "shopify",
  square_sale: "square",
};

export type SurveyAutomationRow = {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  triggerEvent: string;
  delayMinutes: number;
  status: string;
  updatedAt: Date;
};

/** Result of the automation write actions (defined here so the action file exports only actions). */
export type AutomationActionResult = { ok: true; id: string } | { ok: false; error: string };

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
export function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** List the org's automation rules. Fail-soft → []. */
export async function listSurveyAutomations(orgId: string): Promise<SurveyAutomationRow[]> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.surveyAutomation.findMany({
        orderBy: { updatedAt: "desc" },
        include: { campaign: { select: { name: true } } },
      });
      return rows.map((r) => ({
        id: r.id,
        campaignId: r.campaignId,
        campaignName: r.campaign?.name ?? null,
        triggerEvent: r.triggerEvent,
        delayMinutes: r.delayMinutes,
        status: r.status,
        updatedAt: r.updatedAt,
      }));
    });
  } catch (err) {
    if (!isMissingRelation(err)) {
      logger.warn({ orgId, error: String(err), event: "survey.automations.list_failed" });
    }
    return [];
  }
}
