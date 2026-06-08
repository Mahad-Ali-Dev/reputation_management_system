import { NextResponse, type NextRequest } from "next/server";
import { refreshAllOrgs } from "@/lib/ai/kb-refresh";
import { logger } from "@/lib/logger";
import { verifyCronRequest } from "@/lib/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // weekly re-scan can touch many orgs

/**
 * GET /api/cron/ai-kb-refresh
 *
 * Weekly Auto-Updater (Module 05). Dual-auth via verifyCronRequest. Configure
 * in vercel.json:
 *   { "path": "/api/cron/ai-kb-refresh", "schedule": "0 6 * * 1" }  // Mon 06:00 UTC
 *
 * For each entitled org with a tracked AiTrainingProfile.sourceUrl, re-crawls
 * the site, extracts a fresh profile, diffs vs stored, and on change auto-
 * updates the profile + re-ingests the source doc + emails the owner. Orgs
 * without a sourceUrl short-circuit (no paid call). Per-org errors are logged
 * but never abort the loop. Email no-ops cleanly when RESEND_API_KEY is unset.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshAllOrgs();
    return NextResponse.json({
      ok: true,
      orgsProcessed: result.orgsProcessed,
      changed: result.changed,
      emailed: result.emailed,
      errors: result.errors.slice(0, 20),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ event: "kb.refresh.cron_failed", error });
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
