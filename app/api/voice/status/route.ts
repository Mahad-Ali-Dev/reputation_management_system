import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { parseAndVerifyTwilio } from "@/lib/phone/twilio-verify";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/status — Twilio call status updates.
 *
 * Configure in Twilio: Status Callback URL = https://app.repuboost.io/api/voice/status
 * Events: completed, no-answer, busy, failed
 *
 * Writes the final duration + status to the phone_calls row.
 */
export async function POST(req: NextRequest) {
  const verified = await parseAndVerifyTwilio(req);
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { params } = verified;
  const callSid = params.CallSid ?? null;
  const status = params.CallStatus ?? null;
  const duration = parseInt(params.CallDuration ?? "0", 10);
  const recordingUrl = params.RecordingUrl ?? null;

  if (!callSid) {
    return NextResponse.json({ ok: false, error: "missing CallSid" }, { status: 400 });
  }

  const call = await prisma.phoneCall.findUnique({
    where: { twilioCallSid: callSid },
    select: { id: true, organizationId: true },
  });
  if (!call) {
    logger.warn({ event: "voice.status.unknown_call", callSid });
    return NextResponse.json({ ok: true, ignored: true });
  }

  await withTenant(call.organizationId, async (tx) => {
    await tx.phoneCall.update({
      where: { id: call.id },
      data: {
        status: status ?? "completed",
        endedAt: new Date(),
        durationSeconds: Number.isFinite(duration) ? duration : null,
        recordingUrl: recordingUrl ?? undefined,
      },
    });
  });

  logger.info({ event: "voice.status.updated", callSid, status, duration });
  return NextResponse.json({ ok: true });
}
