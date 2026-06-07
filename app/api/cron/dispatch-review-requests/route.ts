import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { dispatchReviewRequest } from "@/lib/outreach/dispatch";
import { verifyCronRequest } from "@/lib/secrets";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/dispatch-review-requests
 *
 * Runs every minute. Claims and sends all DUE review requests — the single
 * delivery path for:
 *   - scheduled sends ("Send in 1 hour / 3 days …"),
 *   - bulk sends with a delay,
 *   - automation-delayed sends (Shopify order → scheduled ReviewRequest).
 *
 * Before this worker existed, any row with `scheduleHours > 0` was inserted as
 * `status:"scheduled"` and NEVER sent — this closes that gap.
 *
 * Race-safety: two concurrent cron ticks can read the same due rows, so each row
 * is claimed with a conditional UPDATE (queued/scheduled → sending). Only the
 * winner sends; double-send is impossible (TCPA-safe), matching the pattern in
 * `dispatch-outbound`.
 *
 * Vercel cron (registered serially in vercel.json):
 *   { "path": "/api/cron/dispatch-review-requests", "schedule": "* * * * *" }
 */
export async function GET(req: NextRequest) {
  // Fail-closed in production: verifyCronRequest throws if CRON_SECRET unset in prod.
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Cross-tenant scan of due rows. New tables/columns aren't migrated in this
  // build, but review_requests is a long-existing table — still, fail soft if
  // the relation/columns are somehow absent (42P01/42703) so a pre-migration
  // deploy can't 500 the cron.
  let due: Array<{ id: string; organizationId: string }>;
  try {
    due = await prisma.reviewRequest.findMany({
      where: {
        status: { in: ["queued", "scheduled"] },
        scheduledFor: { lte: now },
      },
      orderBy: { scheduledFor: "asc" },
      take: 200,
      select: { id: true, organizationId: true },
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      return NextResponse.json({ ok: true, skipped: "table_not_ready", dispatched: 0, failed: 0 });
    }
    throw err;
  }

  let dispatched = 0;
  let failed = 0;

  for (const row of due) {
    try {
      // Race-safe claim: only the worker that flips queued/scheduled → sending
      // proceeds. count===0 means another tick already claimed it.
      const claimed = await withTenant(row.organizationId, (tx) =>
        tx.reviewRequest.updateMany({
          where: { id: row.id, status: { in: ["queued", "scheduled"] } },
          data: { status: "sending" },
        }),
      );
      if (claimed.count === 0) continue;

      const outcome = await dispatchReviewRequest(row.id, row.organizationId);
      if (outcome.dispatched) dispatched++;
      else failed++;
    } catch (err) {
      failed++;
      const error = err instanceof Error ? err.message : String(err);
      // Best-effort: mark the row failed so it isn't stuck in "sending".
      try {
        await withTenant(row.organizationId, (tx) =>
          tx.reviewRequest.update({ where: { id: row.id }, data: { status: "failed", error } }),
        );
      } catch {
        /* swallow — already logged below */
      }
      logger.error({
        event: "review_request.cron_dispatch_failed",
        reviewRequestId: row.id,
        orgId: row.organizationId,
        error,
      });
    }
  }

  return NextResponse.json({ ok: true, dispatched, failed, scanned: due.length });
}

/** Postgres "relation does not exist" (42P01) / "column does not exist" (42703). */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022" || code === "42P01" || code === "42703";
}
