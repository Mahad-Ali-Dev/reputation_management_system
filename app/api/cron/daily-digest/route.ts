import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { sendDigestForOrg } from "@/lib/digest/actions";
import { enqueueJob, isQStashConfigured } from "@/lib/jobs/queue";
import { verifyCronRequest } from "@/lib/secrets";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min, for orgs with many recipients

/**
 * GET /api/cron/daily-digest
 *
 * Vercel-Cron-Secret protected. Configure in vercel.json:
 *   { "crons": [{ "path": "/api/cron/daily-digest", "schedule": "0 13 * * *" }] }
 *
 * Runs at 13:00 UTC = ~08:00 ET. v1 sends to every org regardless of their TZ;
 * later we shard by establishment timezone.
 *
 * For each active org (plan != "suspended", trial valid or pro), build & send
 * yesterday's digest. Errors are logged but don't abort the loop.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const orgs = await prisma.organization.findMany({
    where: {
      plan: { in: ["trial", "pro"] },
      deletedAt: null,
    },
    select: { id: true, name: true },
    take: 1000, // safety cap
  });

  let totalSent = 0;
  let orgsProcessed = 0;
  const errors: { orgId: string; error: string }[] = [];

  // If QStash is configured, fan out one job per org. If not (dev), run inline.
  const useQueue = isQStashConfigured();

  for (const org of orgs) {
    try {
      if (useQueue) {
        await enqueueJob({
          topic: "digest-org",
          payload: { orgId: org.id, day: yesterday.toISOString() },
          deduplicationId: `digest:${org.id}:${yesterday.toISOString().slice(0, 10)}`,
        });
        orgsProcessed++;
      } else {
        const result = await sendDigestForOrg(org.id, yesterday);
        totalSent += result.sent;
        orgsProcessed++;
        if (result.errors.length > 0) {
          for (const e of result.errors) {
            errors.push({ orgId: org.id, error: e });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ orgId: org.id, error: msg });
      logger.error({ event: "digest.org.failed", orgId: org.id, error: msg });
    }
  }

  logger.info(
    { event: "digest.cron.complete", totalSent, orgsProcessed, errorCount: errors.length },
    "Daily digest cron complete",
  );

  return NextResponse.json({
    ok: true,
    totalSent,
    orgsProcessed,
    errors: errors.slice(0, 20), // truncate response so we don't leak unbounded data
  });
}
