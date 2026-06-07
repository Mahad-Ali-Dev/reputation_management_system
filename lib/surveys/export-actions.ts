"use server";

import { requireRole } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { isMissingRelation } from "./automations";
import { buildResponsesCsv, type ExportResult } from "./export";

/**
 * `"use server"` wrapper for the Responses-tab "Export CSV" button (Module 11).
 * `member` tier (a read/export, not a write). Returns `{ filename, csv }` to the
 * client, which triggers a Blob download. Fail-soft on un-migrated tables → an
 * empty (header-only) export rather than a 500.
 *
 * This file exports ONLY the async action; the `ExportResult` type and the
 * `isMissingRelation` helper live in plain modules (`./export`, `./automations`).
 */
export async function exportResponsesCsv(campaignId?: string): Promise<ExportResult> {
  const { orgId } = await requireRole("member");
  try {
    const csv = await buildResponsesCsv(orgId, campaignId);
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = campaignId
      ? `survey-responses-${campaignId.slice(0, 8)}-${stamp}.csv`
      : `survey-responses-${stamp}.csv`;
    return { ok: true, filename, csv };
  } catch (err) {
    if (isMissingRelation(err)) {
      return {
        ok: true,
        filename: `survey-responses-${new Date().toISOString().slice(0, 10)}.csv`,
        csv: "Response ID,Campaign,Recipient,NPS (0-10),Rating,Comment,Routing,Submitted At",
      };
    }
    logger.error({ orgId, error: String(err), event: "survey.export.failed" });
    return { ok: false, error: "Export failed. Please try again." };
  }
}
