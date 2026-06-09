/**
 * Handler: `scheduled_post` — owner module **10_post_creator** (Wave 3d).
 *
 * Publishes a `SocialPost` to its target connected platform(s) at the scheduled
 * time. The payload carries the post id (and any per-tick options the composer
 * stored when it called `schedule(...)`).
 *
 * FOUNDATION STUB — DOES NOT PUBLISH. This generic-queue handler was never
 * wired to a real publish path. The actual, working social publish path is the
 * SEPARATE `SocialPost` queue: a row with `status:"scheduled"` + `scheduledFor`,
 * drained by the per-minute `dispatch-social-posts` cron via
 * `dispatchDuePost(postId, orgId)` (`lib/social/dispatch.ts`). That path acts on
 * a concrete `SocialPost` row — which a generic `scheduled_post` job payload
 * does not carry — so it cannot be reused here without a `postId`.
 *
 * The former geo-grid "Schedule geo-post" flow used to enqueue jobs here and
 * report SUCCESS to the user, even though this handler never published anything
 * (silent dead-end). That flow was changed to save a real `SocialPost` DRAFT
 * instead (see `lib/seo/actions.ts#scheduleGeoPost`), so nothing enqueues this
 * kind in production anymore.
 *
 * We therefore WARN (not info) if a job ever reaches here: it means something
 * re-introduced a `scheduled_post` enqueue against an unwired handler, and that
 * job will NOT be published. `ok:false` surfaces it in `lastError` rather than
 * silently reporting green success for work that never happens.
 *
 *   TODO(10_post_creator): if/when this queue is adopted, the payload must carry
 *   `postId`; load the SocialPost, claim it (`status:"publishing"`), and call
 *   `dispatchDuePost(postId, orgId)` — idempotent + fail-soft already.
 */

import { logger } from "@/lib/logger";
import type { ScheduledHandlerJob } from "./index";

export async function handleScheduledPost(
  job: ScheduledHandlerJob,
): Promise<{ ok: boolean; detail?: string }> {
  logger.warn(
    {
      orgId: job.orgId,
      jobId: job.id,
      event: "scheduler.handler.scheduled_post.unwired",
    },
    "scheduled_post handler is not wired to a real publish path — this job will NOT be published",
  );
  return { ok: false, detail: "scheduled_post handler not wired — not published" };
}
