import { NextResponse } from "next/server";
import { assertQStashSignature } from "@/lib/jobs/queue";
import { sendDigestForOrg } from "@/lib/digest/actions";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job handler: build + send the daily digest for a single org.
 *
 * Enqueued by /api/cron/daily-digest (or manually for testing). Fan-out
 * one job per org so a single slow org doesn't delay everyone else.
 */
export async function POST(req: Request) {
  try {
    const payload = await assertQStashSignature(req);
    const { orgId, day } = payload as unknown as { orgId: string; day: string };
    if (!orgId) {
      return NextResponse.json({ error: "missing orgId" }, { status: 400 });
    }
    const result = await sendDigestForOrg(orgId, new Date(day));
    logger.info(
      { event: "job.digest-org.complete", orgId, sent: result.sent, errors: result.errors.length },
      "digest-org job complete",
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "job.digest-org.failed", error: msg });
    if (msg === "invalid_qstash_signature") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
