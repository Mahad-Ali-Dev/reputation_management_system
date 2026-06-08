import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendAutopilotDigestForOrg } from "@/lib/autopilot/digest";
import { startOfWeek } from "@/lib/autopilot/queries";
import { enqueueJob, isQStashConfigured } from "@/lib/jobs/queue";
import { verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — fan out / process many orgs

/**
 * GET /api/cron/autopilot-weekly
 *
 * Vercel-Cron-Secret protected (dual-auth via verifyCronRequest). Registered in
 * vercel.json:
 *   { "path": "/api/cron/autopilot-weekly", "schedule": "0 14 * * 1" }  // Mon 14:00 UTC
 *
 * For each active org, build + send the Reputation Autopilot weekly digest for
 * the week that just ended (prior Mon–Sun). Only orgs whose AutopilotConfig is
 * enabled actually receive one — `buildAutopilotDigest` returns null otherwise,
 * so `sendAutopilotDigestForOrg` is a cheap skip for everyone else.
 *
 * Mirrors the daily-digest cron exactly: QStash fan-out (one job per org) when
 * configured, else inline. Idempotent via the AutopilotDigestRun claim.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The week that just ended: start of THIS week minus 7 days = last Monday 00:00 UTC.
  const weekStart = new Date(startOfWeek(new Date()).getTime() - 7 * 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    where: { plan: { in: ["trial", "pro"] }, deletedAt: null },
    select: { id: true },
    take: 1000, // safety cap
  });

  let totalSent = 0;
  let orgsProcessed = 0;
  const errors: { orgId: string; error: string }[] = [];
  const useQueue = isQStashConfigured();

  for (const org of orgs) {
    try {
      if (useQueue) {
        await enqueueJob({
          topic: "autopilot-digest-org",
          payload: { orgId: org.id, weekStart: weekStart.toISOString() },
          deduplicationId: `autopilot-digest:${org.id}:${weekStart.toISOString().slice(0, 10)}`,
        });
        orgsProcessed++;
      } else {
        const result = await sendAutopilotDigestForOrg(org.id, weekStart);
        totalSent += result.sent;
        orgsProcessed++;
        for (const e of result.errors) errors.push({ orgId: org.id, error: e });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ orgId: org.id, error: msg });
      logger.error({ event: "autopilot.digest.org.failed", orgId: org.id, error: msg });
    }
  }

  logger.info(
    { event: "autopilot.digest.cron.complete", totalSent, orgsProcessed, errorCount: errors.length },
    "Autopilot weekly digest cron complete",
  );

  return NextResponse.json({
    ok: true,
    totalSent,
    orgsProcessed,
    errors: errors.slice(0, 20),
  });
}
