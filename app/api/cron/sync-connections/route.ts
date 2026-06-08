import { syncAllDueConnections } from "@/lib/connections/sync";
import { logger } from "@/lib/logger";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sync-connections — Vercel Cron entrypoint (every 15 min).
 *
 * Pulls last-30-days customers from each active contact-syncing connection into
 * the Contact directory (Step 12), which the Review Requests engine (Step 7)
 * then processes. Adapter-gated: connections whose adapter has no creds are
 * skipped — NO paid calls on a default code path. Writes a ConnectionSyncLog
 * per run, each inside `withTenant`.
 *
 * Dual-auth (identical to sync-reviews): `Authorization: Bearer ${CRON_SECRET}`
 * header (fail-closed in prod via verifyCronRequest), or a dev `?key=` fallback.
 */
export async function GET(req: NextRequest) {
  const headerOk = verifyCronRequest(req.headers.get("authorization"));
  const cronSecret = getCronSecret(); // null only in dev with no secret
  const queryOk = cronSecret !== null && req.nextUrl.searchParams.get("key") === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const summary = await syncAllDueConnections();
    // NB: summary.ok is a numeric count of successful syncs. Spread it first and
    // expose the request-level success flag as `success` so the two don't collide
    // (the catch path below still returns `ok: false` for the failure case).
    return NextResponse.json({
      success: true,
      durationMs: Date.now() - t0,
      ...summary,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.connections.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
