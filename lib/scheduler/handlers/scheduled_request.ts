/**
 * Handler: `scheduled_request` — owner module **07_review_requests** (Wave 2).
 *
 * Sends a review-request message (email/SMS) at the scheduled time. The payload
 * carries the request/recipient identifiers the outreach dispatch needs.
 *
 * FOUNDATION STUB: returns `{ok:true, detail:"noop"}` so the consolidated
 * dispatch cron stays green before Step 07 lands. Step 07 replaces the body with
 * the real send call:
 *
 *   TODO(07_review_requests): inside `withTenant(orgId)`, resolve the recipient +
 *   template from `payload` (e.g. {recipientId, templateId, channel}), render the
 *   merge-tag template (`lib/merge-tags`), enforce the frequency cap, and send via
 *   the outreach dispatcher (env-gated Resend/Twilio adapters that no-op without
 *   creds). Must be idempotent (dedupeKey on the target) and fail-soft on
 *   42P01/42703 pre-migration.
 */

import { logger } from "@/lib/logger";
import type { ScheduledHandlerJob } from "./index";

export async function handleScheduledRequest(
  job: ScheduledHandlerJob,
): Promise<{ ok: boolean; detail?: string }> {
  logger.info(
    {
      orgId: job.orgId,
      jobId: job.id,
      event: "scheduler.handler.scheduled_request.noop",
    },
    "scheduled_request handler stub — module 07 not yet wired",
  );
  return { ok: true, detail: "noop" };
}
