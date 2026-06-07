/**
 * Handler: `scheduled_reply` — owner module **06_review_feed** (Wave 1).
 *
 * Publishes a previously-drafted review reply at the scheduled time. This is the
 * NEW-queue path; the existing auto-reply publish flow
 * (`lib/auto-reply/executor.ts#publishDueAutoReplies`, derived-window) is left
 * UNCHANGED for Step 6's existing behaviour (see 00_foundation.md A7). This
 * handler exists so any *new* delayed-reply feature Step 6 opts into can ride the
 * durable `ScheduledJob` queue.
 *
 * Reuse note: publishing a reply already has a self-contained, tenant-scoped,
 * fail-soft entry point — `publishReplyFromCron(orgId, reviewId)` — so when the
 * payload carries a `reviewId` we route straight to it (trivial reuse, no new
 * publish plumbing). If Step 6 needs richer payloads it replaces this body.
 *
 *   TODO(06_review_feed): if the new queue carries more than {reviewId}
 *   (e.g. {replyId} or scheduling metadata), resolve and publish accordingly.
 */

import { logger } from "@/lib/logger";
import type { ScheduledHandlerJob } from "./index";

export async function handleScheduledReply(
  job: ScheduledHandlerJob,
): Promise<{ ok: boolean; detail?: string }> {
  const reviewId = typeof job.payload?.reviewId === "string" ? job.payload.reviewId : null;

  if (!reviewId) {
    // No reviewId yet (e.g. a future payload shape) → no-op success so the cron
    // stays green; Step 6 fills in the richer routing when it adopts the queue.
    logger.info(
      {
        orgId: job.orgId,
        jobId: job.id,
        event: "scheduler.handler.scheduled_reply.noop",
      },
      "scheduled_reply handler stub — no reviewId in payload",
    );
    return { ok: true, detail: "noop" };
  }

  try {
    // Reuse the existing, fail-soft, tenant-scoped cron publish path. It returns
    // false (rather than throwing) when the reply is missing / already published
    // / not publishable — which we surface as a soft failure detail, not a retry
    // storm, since re-running would not change the outcome.
    const { publishReplyFromCron } = await import("@/lib/reviews/actions-cron");
    const published = await publishReplyFromCron(job.orgId, reviewId);
    if (published) {
      return { ok: true, detail: "published" };
    }
    return { ok: false, detail: "not_publishable" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error(
      {
        orgId: job.orgId,
        jobId: job.id,
        reviewId,
        error: detail,
        event: "scheduler.handler.scheduled_reply.failed",
      },
      "scheduled_reply publish failed",
    );
    return { ok: false, detail };
  }
}
