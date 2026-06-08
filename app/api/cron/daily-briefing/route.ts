import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { buildBriefingForOrg } from "@/lib/dashboard/briefing";
import { verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — generates a briefing per active org

/**
 * GET /api/cron/daily-briefing
 *
 * Dual-auth via `verifyCronRequest` (lib/secrets) — fail-closed in prod.
 * Configured in vercel.json:
 *   { "path": "/api/cron/daily-briefing", "schedule": "0 12 * * *" }
 * (12:00 UTC — runs before the 13:00 daily-digest so the morning briefing is
 * fresh.)
 *
 * For each active org (plan in [trial, pro], not deleted) it computes the AI
 * daily briefing from the org's last-24h review data and UPSERTS it into the
 * `dashboard_briefings` cache (keyed on org+day) so the dashboard reads it back
 * without recomputing. Generation is env-gated: without ANTHROPIC_API_KEY (or
 * for un-entitled / over-budget orgs) it produces the deterministic template —
 * no paid call. Persistence is fail-soft inside `buildBriefingForOrg` (a
 * not-yet-migrated table is a silent no-op), and per-org errors are logged,
 * never fatal to the loop.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();

  let orgs: { id: string; name: string }[] = [];
  try {
    orgs = await prisma.organization.findMany({
      where: { plan: { in: ["trial", "pro"] }, deletedAt: null },
      select: { id: true, name: true },
      take: 1000, // safety cap
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "briefing.cron.orgs_failed", error: msg });
    return NextResponse.json({ ok: false, error: "org_query_failed" }, { status: 500 });
  }

  let orgsProcessed = 0;
  let aiGenerated = 0;
  const errors: { orgId: string; error: string }[] = [];

  for (const org of orgs) {
    try {
      const result = await buildBriefingForOrg(org.id, today, org.name.split(" ")[0]);
      orgsProcessed++;
      if (result.model) aiGenerated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ orgId: org.id, error: msg });
      logger.error({ event: "briefing.org.failed", orgId: org.id, error: msg });
    }
  }

  logger.info(
    { event: "briefing.cron.complete", orgsProcessed, aiGenerated, errorCount: errors.length },
    "Daily briefing cron complete",
  );

  return NextResponse.json({
    ok: true,
    orgsProcessed,
    aiGenerated,
    errors: errors.slice(0, 20),
  });
}
