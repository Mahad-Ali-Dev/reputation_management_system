import { NextResponse } from "next/server";
import { assertQStashSignature } from "@/lib/jobs/queue";
import { sendAutopilotDigestForOrg } from "@/lib/autopilot/digest";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Job handler: build + send the Autopilot weekly digest for a single org.
 *
 * Enqueued by /api/cron/autopilot-weekly (QStash fan-out). One job per org so a
 * single slow org doesn't delay everyone. Idempotent via the AutopilotDigestRun
 * claim inside `sendAutopilotDigestForOrg`. Mirrors /api/jobs/digest-org.
 */
export async function POST(req: Request) {
  try {
    const payload = await assertQStashSignature(req);
    const { orgId, weekStart } = payload as unknown as { orgId: string; weekStart: string };
    if (!orgId) {
      return NextResponse.json({ error: "missing orgId" }, { status: 400 });
    }
    const result = await sendAutopilotDigestForOrg(orgId, new Date(weekStart));
    logger.info(
      {
        event: "job.autopilot-digest-org.complete",
        orgId,
        sent: result.sent,
        errors: result.errors.length,
      },
      "autopilot-digest-org job complete",
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "job.autopilot-digest-org.failed", error: msg });
    if (msg === "invalid_qstash_signature") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
