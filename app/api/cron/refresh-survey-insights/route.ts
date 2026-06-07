import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { verifyCronRequest } from "@/lib/secrets";
import { generateSurveyInsights } from "@/lib/surveys/insights";
import { insightsStaleness } from "@/lib/surveys/insights-queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/refresh-survey-insights
 *
 * Weekly (Sun 04:00 UTC) re-run of survey AI Insights for orgs whose cache is
 * stale (>7 days old, or never run with ≥10 responses; >20-new-responses is the
 * in-app trigger, not cron). Dual-auth via `verifyCronRequest`, `runtime=nodejs`.
 *
 * Cost control: env-gated (no `ANTHROPIC_API_KEY` → `generateSurveyInsights`
 * no-ops per org) and throttled to MAX_ORGS_PER_RUN. Each org runs in its own
 * tenant context inside the generator. Every step fail-soft on un-migrated
 * tables (treats as empty / skips) — never a 500.
 *
 * vercel.json: { "path": "/api/cron/refresh-survey-insights", "schedule": "0 4 * * 0" }
 */

const MAX_ORGS_PER_RUN = 25;

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // No key → nothing to do (adapter rule: zero paid calls without creds).
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "sk-ant-...") {
    logger.info({ event: "survey.insights.cron.skipped_no_key" });
    return NextResponse.json({ ok: true, skipped: "no_api_key", processed: 0 });
  }

  let orgs: { id: string }[] = [];
  try {
    orgs = await prisma.organization.findMany({
      where: { plan: { in: ["trial", "pro"] }, deletedAt: null },
      select: { id: true },
      take: 1000,
    });
  } catch (err) {
    logger.error({ event: "survey.insights.cron.org_query_failed", error: String(err) });
    return NextResponse.json({ ok: false, error: "org_query_failed" }, { status: 500 });
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { orgId: string; error: string }[] = [];

  for (const org of orgs) {
    if (processed >= MAX_ORGS_PER_RUN) break;
    try {
      const staleness = await insightsStaleness(org.id);
      // Cron only fires on age / never-run (the ">20 new responses" path is
      // handled in-app post-submit to keep cron cost bounded).
      if (!staleness.stale || staleness.reason === "new_responses") {
        skipped++;
        continue;
      }
      const result = await generateSurveyInsights(org.id);
      if (result.ok && !result.gated) {
        processed++;
      } else {
        skipped++;
      }
    } catch (err) {
      failed++;
      errors.push({ orgId: org.id, error: err instanceof Error ? err.message : String(err) });
      logger.error({
        orgId: org.id,
        event: "survey.insights.cron.org_failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info({ event: "survey.insights.cron.complete", processed, skipped, failed });
  return NextResponse.json({ ok: true, processed, skipped, failed, errors: errors.slice(0, 20) });
}
