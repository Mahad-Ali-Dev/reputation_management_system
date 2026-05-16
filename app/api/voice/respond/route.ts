import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { buildTwiml, generateBrainResponse, renderSpeechForTurn } from "@/lib/phone/brain";
import { parseAndVerifyTwilio } from "@/lib/phone/twilio-verify";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // Twilio gives us ~15s; we cap at 30 for safety

/**
 * POST /api/voice/respond?callSid=... — Twilio posts the caller's speech here.
 *
 * Twilio sends `SpeechResult` (transcript) + `Confidence`. We:
 *   1. Load call + history
 *   2. Call Claude brain
 *   3. Log both turns
 *   4. Return TwiML for next interaction (or hang up)
 */
export async function POST(req: NextRequest) {
  const verified = await parseAndVerifyTwilio(req);
  if (!verified.ok) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Forbidden.</Say><Hangup/></Response>', {
      status: 403,
      headers: { "content-type": "text/xml" },
    });
  }
  const speechResult = (verified.params.SpeechResult ?? "").trim();
  const confidence = parseFloat(verified.params.Confidence ?? "0");
  const callSid = req.nextUrl.searchParams.get("callSid");

  if (!callSid) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>Configuration error. Goodbye.</Say>\n  <Hangup/>\n</Response>',
      { headers: { "content-type": "text/xml" } },
    );
  }

  // Look up the call
  const call = await prisma.phoneCall.findUnique({
    where: { twilioCallSid: callSid },
    select: {
      id: true,
      organizationId: true,
      aiTotalTurns: true,
    },
  });

  if (!call) {
    logger.warn({ event: "voice.respond.unknown_call", callSid });
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>I lost track of this call. Goodbye.</Say>\n  <Hangup/>\n</Response>',
      { headers: { "content-type": "text/xml" } },
    );
  }

  // Empty speech → caller silent. End politely.
  if (!speechResult) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>I didn\'t catch anything. Have a good day.</Say>\n  <Hangup/>\n</Response>',
      { headers: { "content-type": "text/xml" } },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;

  // Load assistant config + history
  const [assistant, turns] = await withTenant(call.organizationId, async (tx) =>
    Promise.all([
      tx.phoneAssistant.findUnique({ where: { organizationId: call.organizationId } }),
      tx.phoneCallTurn.findMany({
        where: { callId: call.id },
        orderBy: { turnNumber: "asc" },
        select: { role: true, text: true },
      }),
    ]),
  );

  const voice = assistant?.voice ?? "alice";
  const language = assistant?.language ?? "en-US";
  const maxTurns = assistant?.maxTurns ?? 12;

  // Save caller's turn FIRST so it's in the log even if AI call fails
  const callerTurnNumber = call.aiTotalTurns + 1;
  await withTenant(call.organizationId, async (tx) => {
    await tx.phoneCallTurn.create({
      data: {
        callId: call.id,
        organizationId: call.organizationId,
        turnNumber: callerTurnNumber,
        role: "caller",
        text: speechResult,
        confidence: Number.isFinite(confidence) ? confidence : null,
      },
    });
  });

  // Force end if we've exceeded max turns
  if (callerTurnNumber >= maxTurns * 2) {
    await endCall(call.id, call.organizationId, "max_turns");
    return new NextResponse(
      buildTwiml({
        say: "Thanks so much for calling. We've recorded everything you mentioned. Goodbye.",
        voice,
        language,
        callbackUrl: "",
        hangup: true,
      }),
      { headers: { "content-type": "text/xml" } },
    );
  }

  // Generate brain response
  let brain;
  try {
    brain = await generateBrainResponse({
      orgId: call.organizationId,
      callId: call.id,
      callerText: speechResult,
      history: turns.map((t) => ({
        role: t.role === "caller" ? ("caller" as const) : ("assistant" as const),
        text: t.text,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "voice.respond.brain_failed", error: msg, callSid });
    return new NextResponse(
      buildTwiml({
        say: "I'm having trouble understanding right now. Let me hand you off to our team.",
        voice,
        language,
        callbackUrl: "",
        dialNumber: assistant?.handoffNumber ?? undefined,
        hangup: !assistant?.handoffNumber,
      }),
      { headers: { "content-type": "text/xml" } },
    );
  }

  // Save assistant's turn + cost
  await withTenant(call.organizationId, async (tx) => {
    await tx.phoneCallTurn.create({
      data: {
        callId: call.id,
        organizationId: call.organizationId,
        turnNumber: callerTurnNumber + 1,
        role: "assistant",
        text: brain.response,
        costMicros: brain.costMicros,
        latencyMs: brain.latencyMs,
      },
    });
    await tx.phoneCall.update({
      where: { id: call.id },
      data: {
        aiTotalTurns: { increment: 2 },
        aiCostMicros: { increment: brain.costMicros },
        leadName: brain.lead_name ?? undefined,
        leadEmail: brain.lead_email ?? undefined,
        leadPhone: brain.lead_phone ?? undefined,
        intent: brain.detected_intent ?? undefined,
      },
    });
  });

  // Render audio (ElevenLabs) if configured, otherwise fall back to Twilio Say
  const audioUrl = await renderSpeechForTurn({
    text: brain.response,
    voiceProvider: assistant?.voiceProvider ?? "twilio",
    elevenlabsVoiceId: assistant?.elevenlabsVoiceId ?? null,
    elevenlabsModel: assistant?.elevenlabsModel ?? null,
  });

  // Decide next TwiML based on the brain's next_action
  switch (brain.next_action) {
    case "handoff_to_human":
      await endCall(call.id, call.organizationId, "forwarded");
      return new NextResponse(
        buildTwiml({
          say: brain.response,
          voice,
          language,
          callbackUrl: "",
          dialNumber: assistant?.handoffNumber ?? undefined,
          hangup: !assistant?.handoffNumber,
          audioUrl: audioUrl ?? undefined,
        }),
        { headers: { "content-type": "text/xml" } },
      );

    case "end_call":
      await endCall(call.id, call.organizationId, "completed");
      return new NextResponse(
        buildTwiml({
          say: brain.response, voice, language, callbackUrl: "", hangup: true,
          audioUrl: audioUrl ?? undefined,
        }),
        { headers: { "content-type": "text/xml" } },
      );

    default: {
      const respondUrl = `${appUrl}/api/voice/respond?callSid=${encodeURIComponent(callSid)}`;
      return new NextResponse(
        buildTwiml({
          say: brain.response, voice, language, callbackUrl: respondUrl,
          audioUrl: audioUrl ?? undefined,
        }),
        { headers: { "content-type": "text/xml" } },
      );
    }
  }
}

async function endCall(callId: string, orgId: string, reason: string): Promise<void> {
  await withTenant(orgId, async (tx) => {
    await tx.phoneCall.update({
      where: { id: callId },
      data: {
        status: reason === "forwarded" ? "forwarded" : "completed",
        endedAt: new Date(),
      },
    });
  });
}
