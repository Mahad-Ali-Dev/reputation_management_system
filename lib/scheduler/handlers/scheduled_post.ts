/**
 * Handler: `scheduled_post` — owner module **10_post_creator** (Wave 3d).
 *
 * Publishes a `SocialPost` to its target connected platform(s) at the scheduled
 * time. The payload carries the post id (and any per-tick options the composer
 * stored when it called `schedule(...)`).
 *
 * FOUNDATION STUB: returns `{ok:true, detail:"noop"}` so the consolidated
 * dispatch cron stays green before Step 10 lands. Step 10 replaces the body with
 * the real publish call:
 *
 *   TODO(10_post_creator): inside `withTenant(orgId)`, load the SocialPost by
 *   `payload.postId`, resolve its provider connection via
 *   `lib/social/connections.ts`, push via the env-gated platform adapter
 *   (no-op without creds), then mark the post `posted` / store `externalIds`.
 *   Must be idempotent on the post row (re-running a claimed job must not
 *   double-publish) and fail-soft on 42P01/42703 pre-migration.
 */

import { logger } from "@/lib/logger";
import type { ScheduledHandlerJob } from "./index";

export async function handleScheduledPost(
  job: ScheduledHandlerJob,
): Promise<{ ok: boolean; detail?: string }> {
  logger.info(
    {
      orgId: job.orgId,
      jobId: job.id,
      event: "scheduler.handler.scheduled_post.noop",
    },
    "scheduled_post handler stub — module 10 not yet wired",
  );
  return { ok: true, detail: "noop" };
}
