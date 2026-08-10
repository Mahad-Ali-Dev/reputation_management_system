import { logger } from "@/lib/logger";
import { syncAllActiveConnections } from "@/lib/reviews/google-fetch";
import { isHasDataEnabled, syncAllViaHasData } from "@/lib/reviews/hasdata-fetch";
import { getCronSecret, verifyCronRequest } from "@/lib/secrets";
import { type NextRequest, NextResponse } from "next/server";

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
    // Two independent sources, both safe to run in the same pass:
    //   - GBP OAuth  → establishments whose googlePlaceId is a resource name
    //                  ("accounts/…/locations/…"), needs Google's allow-listing.
    //   - HasData    → establishments whose googlePlaceId is a public Place ID,
    //                  needs only HASDATA_API_KEY.
    // They select disjoint establishments (see `looksLikePlaceId`), and both
    // upsert on (establishment, source, external_id), so there's no double-write.
    // A failure in one must not lose the other's results.
    const [gbp, hasdata] = await Promise.allSettled([
      syncAllActiveConnections(),
      isHasDataEnabled() ? syncAllViaHasData() : Promise.resolve({ total: 0, results: [] }),
    ]);

    if (gbp.status === "rejected") {
      logger.error({
        event: "cron.reviews.gbp_failed",
        error: gbp.reason instanceof Error ? gbp.reason.message : String(gbp.reason),
      });
    }
    if (hasdata.status === "rejected") {
      logger.error({
        event: "cron.reviews.hasdata_failed",
        error: hasdata.reason instanceof Error ? hasdata.reason.message : String(hasdata.reason),
      });
    }

    const gbpSummary = gbp.status === "fulfilled" ? gbp.value : { total: 0, results: [] };
    const hasdataSummary =
      hasdata.status === "fulfilled" ? hasdata.value : { total: 0, results: [] };

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - t0,
      total: gbpSummary.total + hasdataSummary.total,
      hasDataEnabled: isHasDataEnabled(),
      gbp: gbpSummary,
      hasdata: hasdataSummary,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ error, event: "cron.reviews.failed" });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
