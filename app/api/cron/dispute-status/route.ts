import { type NextRequest, NextResponse } from "next/server";
import { checkDisputeStatuses } from "@/lib/reviews/dispute-status-check";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/dispute-status — daily Vercel Cron entrypoint (Module 08).
 *
 * Polls Google for the outcome of each "Under Review" dispute. The check is an
 * env-gated adapter (GBP_DISPUTE_CHECK_ENABLED): with the flag unset or no
 * active Google connection it iterates and no-ops (zero external calls), so the
 * default path performs no live paid Google calls.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel) or `?key=` for local
 * testing — identical to sync-reviews.
 *
 * Schedule (vercel.json — registered serially): `0 14 * * *` (daily 14:00 UTC,
 * staggered after daily-digest's 13:00 slot).
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
    const summary = await checkDisputeStatuses();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      ...summary,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.dispute_status.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
