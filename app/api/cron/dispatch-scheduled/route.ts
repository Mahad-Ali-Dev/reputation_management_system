import { drainDueScheduledJobs } from "@/lib/scheduler/dispatch";
import { logger } from "@/lib/logger";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/dispatch-scheduled
 *
 * Runs every 1 minute. The ONE consolidated dispatcher for the
 * `scheduled_jobs` queue — drains due `pending` rows and routes each to its
 * per-`kind` handler (scheduled_post / scheduled_request / scheduled_reply).
 * This single job replaces the three separately-planned minute-jobs
 * (dispatch-scheduled-replies / -posts / -review-requests); see
 * 00_foundation.md §A7 + §D.
 *
 * NOT folded in (intentionally): `dispatch-outbound` (TCPA call-window logic,
 * separate queue) and `auto-reply-publish` (working safety-gated derived-window
 * path) — both remain their own crons.
 *
 * Auth: same dual auth as the other cron routes — Bearer header for Vercel cron,
 * `?key=` for ad-hoc manual fires from an authorized box. Fail-closed in prod:
 * `verifyCronRequest`/`getCronSecret` throw if `CRON_SECRET` is unset in prod, so
 * an unconfigured prod deploy returns 401 rather than running publicly.
 *
 * Vercel cron config (vercel.json):
 *   { "path": "/api/cron/dispatch-scheduled", "schedule": "* * * * *" }
 */
export async function GET(req: NextRequest) {
  const headerOk = verifyCronRequest(req.headers.get("authorization"));
  const cronSecret = getCronSecret();
  const queryOk = cronSecret !== null && req.nextUrl.searchParams.get("key") === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const summary = await drainDueScheduledJobs();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      ...summary,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.dispatch_scheduled.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
