"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Social-post scheduling helper (Module 10, Wave 3d).
 *
 * The post creator uses its OWN durable queue rather than the generic Wave-0
 * `lib/scheduler` (which is keyed by abstract job `kind`): a `SocialPost` row IS
 * the queue entry — `status:"scheduled"` + `scheduledFor` — and the dedicated
 * per-minute `dispatch-social-posts` cron is the single drain. This keeps the
 * calendar/history reading one table and makes "Schedule" / "Bulk" / "Best
 * time" all flow through the same path.
 *
 * This module is the small, intention-revealing API the composer/bulk callers
 * use to transition an existing post into the scheduled state (creation itself
 * is in `post-actions.ts`). All writes are tenant-scoped; conditional on a
 * draft/scheduled status so a published/publishing/failed post can't be silently
 * re-queued.
 */

export type ScheduleResult = { ok: true; status: "scheduled" | "draft" } | { ok: false; reason: string };

/**
 * Schedule (or reschedule) an existing post for a time. A future time →
 * `scheduled` (cron will fire it); a past/now time → kept as `draft` (you don't
 * silently publish into the past). Only `draft`/`scheduled` rows move.
 */
export async function schedulePost(
  orgId: string,
  postId: string,
  when: Date,
): Promise<ScheduleResult> {
  const future = when.getTime() > Date.now();
  const nextStatus: "scheduled" | "draft" = future ? "scheduled" : "draft";
  try {
    const count = await withTenant(orgId, async (tx) => {
      const res = await tx.socialPost.updateMany({
        where: { id: postId, status: { in: ["draft", "scheduled"] } },
        data: { scheduledFor: when, status: nextStatus },
      });
      return res.count;
    });
    if (count === 0) return { ok: false, reason: "not_schedulable" };
    return { ok: true, status: nextStatus };
  } catch (err) {
    logger.warn({
      orgId,
      postId,
      event: "social.schedule.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "schedule_failed" };
  }
}

/**
 * Unschedule a post — move it back to `draft` and clear `scheduledFor` so the
 * cron won't pick it up. Only acts on a currently `scheduled` row.
 */
export async function unschedulePost(orgId: string, postId: string): Promise<ScheduleResult> {
  try {
    const count = await withTenant(orgId, async (tx) => {
      const res = await tx.socialPost.updateMany({
        where: { id: postId, status: "scheduled" },
        data: { status: "draft", scheduledFor: null },
      });
      return res.count;
    });
    if (count === 0) return { ok: false, reason: "not_scheduled" };
    return { ok: true, status: "draft" };
  } catch (err) {
    logger.warn({
      orgId,
      postId,
      event: "social.unschedule.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "unschedule_failed" };
  }
}
