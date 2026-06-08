import { NextResponse, type NextRequest } from "next/server";
import { refreshSeoForDueOrgs } from "@/lib/seo/refresh";
import { verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/seo-refresh
 *
 * Weekly (Mon 06:00 UTC) — registered in vercel.json as `0 6 * * 1`.
 *
 * Runs `refreshSeoForDueOrgs`: for each stale org that completed SEO onboarding,
 * pull GA4 / GBP / PageSpeed / rank-tracker adapters (EACH no-op-safe without
 * creds), write KeywordRank / GeoGridSnapshot / CitationAudit, recompute the
 * reputation score, refresh the exec summary, and upsert a SeoSnapshot.
 *
 * Env-gated end-to-end: with no provider creds, each org's adapters no-op and
 * the snapshot still updates the reputation-only score. Cost-throttled via the
 * per-run org cap inside `refreshSeoForDueOrgs`. Dual-auth via
 * `verifyCronRequest` (Bearer CRON_SECRET or Vercel cron header). Mirrors
 * `app/api/cron/extract-topics/route.ts` exactly.
 *
 * The on-demand "Generate now" refresh from the UI reuses the same `refresh.ts`
 * code (per-org) via the `requestSeoRefresh` server action — not this route.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshSeoForDueOrgs({ limit: 25 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "seo.refresh.cron.failed", error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
