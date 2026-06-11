/**
 * Handler: `scheduled_request` — UNUSED. Scheduled review-request sends ship via
 * the OTHER path: `ReviewRequest.status="scheduled"` + `scheduledFor`, drained by
 * `/api/cron/dispatch-review-requests` (see lib/outreach/actions.ts). Nothing in
 * the codebase enqueues this job kind; `lib/phone/voice-review.ts` explicitly
 * bypasses it for the same reason.
 *
 * The handler stays registered because the HANDLERS registry is exhaustive over
 * job kinds and the onboarding flow shares this dispatcher — but it must FAIL,
 * not succeed: the original foundation stub returned `{ok:true, detail:"noop"}`,
 * which would CLAIM any future row and mark it done without sending — a silent
 * data-loss trap (no retry, no failed status, no lastError). Returning ok:false
 * lets the dispatcher retry and ultimately park the row in status:"failed" where
 * it's visible. If a future module needs this kind, implement the real send here
 * (withTenant, merge-tags, frequency cap, idempotent dedupeKey) — or better, use
 * the ReviewRequest.scheduled path like everything else.
 */

import { logger } from "@/lib/logger";
import type { ScheduledHandlerJob } from "./index";

export async function handleScheduledRequest(
  job: ScheduledHandlerJob,
): Promise<{ ok: boolean; detail?: string }> {
  logger.error(
    {
      orgId: job.orgId,
      jobId: job.id,
      event: "scheduler.handler.scheduled_request.unimplemented",
    },
    "scheduled_request job enqueued but the handler is not implemented — use ReviewRequest.status=scheduled instead",
  );
  return {
    ok: false,
    detail:
      "scheduled_request handler not implemented — route scheduled sends through ReviewRequest.status=scheduled + dispatch-review-requests",
  };
}
