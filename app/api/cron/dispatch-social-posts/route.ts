import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { dispatchDuePost } from "@/lib/social/dispatch";
import { verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/dispatch-social-posts
 *
 * Runs every 1 minute. The single delivery path for composer-scheduled, bulk,
 * and best-time posts: claims due `SocialPost` rows and publishes them via
 * `lib/social/dispatch.ts` → `lib/social/publish.ts`.
 *
 * Hazards handled (see _build-order Wave-3d notes):
 *  - **Backlog flush.** Nothing was ever published before this module shipped,
 *    so the FIRST run could see a large backlog. Bounded by `take: 200`.
 *  - **Stale skip.** Posts whose `scheduledFor` is far in the past (> STALE_DAYS)
 *    are NOT blasted out — they're marked `failed:"stale_skipped"` so an old
 *    backlog doesn't noisily publish weeks-late. (Default publish path is
 *    `not_configured` anyway, so this can never make a paid call.)
 *  - **Race-safe claim.** A conditional `updateMany(scheduled → publishing)`;
 *    two concurrent cron ticks can read the same rows but only one wins the
 *    UPDATE (count === 1). The loser skips. No double-publish.
 *  - **Idempotent.** `dispatchDuePost` only acts on `publishing`.
 *  - **Dual-auth.** `verifyCronRequest` (fail-closed in prod).
 *  - **Fail-soft 42P01.** If `social_posts` isn't migrated, return a clean
 *    `{ skipped }` instead of 500.
 *
 * Vercel cron config: { "path": "/api/cron/dispatch-social-posts", "schedule": "* * * * *" }
 */

const TAKE = 200;
const STALE_DAYS = 7;

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column). */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

export async function GET(req: NextRequest) {
  // Fail-closed in production: verifyCronRequest throws if CRON_SECRET unset in prod.
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Cross-tenant read (like dispatch-outbound): the cron has no single org, so
  // it queries the base table and then re-enters each org's tenant context to
  // claim + write.
  let due: Array<{ id: string; organizationId: string; scheduledFor: Date | null }>;
  try {
    due = await prisma.socialPost.findMany({
      where: { status: "scheduled", scheduledFor: { lte: now } },
      orderBy: { scheduledFor: "asc" },
      take: TAKE,
      select: { id: true, organizationId: true, scheduledFor: true },
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      return NextResponse.json({ ok: true, skipped: "not_migrated" });
    }
    logger.error({
      event: "social.dispatch_cron.query_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  let dispatched = 0;
  let failed = 0;
  let stale = 0;
  let skipped = 0;

  for (const row of due) {
    const orgId = row.organizationId;

    // Stale guard: expire instead of publishing weeks-late.
    if (row.scheduledFor && row.scheduledFor.getTime() < staleBefore.getTime()) {
      try {
        const claimed = await withTenant(orgId, async (tx) =>
          tx.socialPost.updateMany({
            where: { id: row.id, status: "scheduled" },
            data: { status: "failed", error: "stale_skipped" },
          }),
        );
        if (claimed.count > 0) stale++;
      } catch (err) {
        logger.warn({
          orgId,
          postId: row.id,
          event: "social.dispatch_cron.stale_mark_failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    // Race-safe claim: scheduled → publishing. Only the winner proceeds.
    let claimedCount = 0;
    try {
      const claimed = await withTenant(orgId, async (tx) =>
        tx.socialPost.updateMany({
          where: { id: row.id, status: "scheduled" },
          data: { status: "publishing" },
        }),
      );
      claimedCount = claimed.count;
    } catch (err) {
      logger.warn({
        orgId,
        postId: row.id,
        event: "social.dispatch_cron.claim_failed",
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    if (claimedCount === 0) {
      // Another tick already claimed it.
      skipped++;
      continue;
    }

    try {
      const result = await dispatchDuePost(row.id, orgId);
      if (result.status === "published") dispatched++;
      else if (result.status === "failed") failed++;
      else skipped++;
    } catch (err) {
      // dispatchDuePost is fail-soft, but belt-and-braces: never let one post
      // abort the drain.
      failed++;
      logger.error({
        orgId,
        postId: row.id,
        event: "social.dispatch_cron.dispatch_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, scanned: due.length, dispatched, failed, stale, skipped });
}
