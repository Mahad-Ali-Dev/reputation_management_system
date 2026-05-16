import { type NextRequest, NextResponse } from "next/server";
import { syncAllActiveConnections } from "@/lib/reviews/google-fetch";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/sync-reviews — Vercel Cron entrypoint.
 *
 * Vercel sends a `Authorization: Bearer ${CRON_SECRET}` header per the cron secret env var.
 * For local testing, also accept a `?key=...` query.
 *
 * Schedule (vercel.json): every 15 minutes.
 */
export async function GET(req: NextRequest) {
  // verifyCronRequest throws if CRON_SECRET is missing in prod (fail-closed).
  // In dev with no secret, it returns true and we skip the query-key path too.
  const headerOk = verifyCronRequest(req.headers.get("authorization"));
  const cronSecret = getCronSecret(); // null only in dev with no secret
  const queryOk = cronSecret !== null && req.nextUrl.searchParams.get("key") === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    const summary = await syncAllActiveConnections();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      ...summary,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.reviews.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
