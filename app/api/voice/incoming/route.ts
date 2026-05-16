import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { buildTwiml, renderSpeechForTurn } from "@/lib/phone/brain";
import { parseAndVerifyTwilio } from "@/lib/phone/twilio-verify";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/incoming — Twilio hits this on every inbound call.
 *
 * Twilio sends: CallSid, From, To, CallStatus, AccountSid, plus geo data
 * (CallerCity, CallerCountry, CallerState).
 *
 * We:
 *   1. Match the `To` number to our `phone_numbers` table → resolve org
 *   2. Insert a `phone_calls` row
 *   3. Return TwiML with greeting + <Gather> for first turn
 */
export async function POST(req: NextRequest) {
  // Verify Twilio HMAC signature + parse form body in one pass
  const verified = await parseAndVerifyTwilio(req);
  if (!verified.ok) {
    return new NextResponse(`<Response><Say>Forbidden.</Say><Hangup/></Response>`, {
      status: 403,
      headers: { "content-type": "text/xml" },
    });
  }
  const { params } = verified;
  const callSid = params.CallSid ?? null;
  const from = params.From ?? null;
  const to = params.To ?? null;
  const callerCountry = params.CallerCountry ?? null;
  const callerState = params.CallerState ?? null;

  if (!callSid || !from || !to) {
    logger.warn({ event: "voice.incoming.missing_params" });
    return new NextResponse("<Response><Say>Configuration error. Goodbye.</Say><Hangup/></Response>", {
      headers: { "content-type": "text/xml" },
    });
  }

  // Look up which org owns this number
  const phoneNumber = await prisma.phoneNumber.findUnique({
    where: { phoneE164: to },
    select: {
      id: true,
      organizationId: true,
      status: true,
      forwardToE164: true,
    },
  });

  if (!phoneNumber || phoneNumber.status !== "active") {
    logger.warn({ event: "voice.incoming.unknown_number", to });
    return new NextResponse(
      "<Response><Say>This number isn't currently in service. Goodbye.</Say><Hangup/></Response>",
      { headers: { "content-type": "text/xml" } },
    );
  }

  // Insert the call record
  let assistant;
  try {
    const result = await withTenant(phoneNumber.organizationId, async (tx) => {
      const call = await tx.phoneCall.create({
        data: {
          organizationId: phoneNumber.organizationId,
          phoneNumberId: phoneNumber.id,
          twilioCallSid: callSid,
          fromE164: from,
          toE164: to,
          direction: "inbound",
          status: "in-progress",
          callerCountry: callerCountry ?? null,
          callerState: callerState ?? null,
        },
      });
      const a = await tx.phoneAssistant.findUnique({
        where: { organizationId: phoneNumber.organizationId },
      });
      return { callId: call.id, assistant: a };
    });
    assistant = result.assistant;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "voice.incoming.db_failed", error: msg, callSid });
    return new NextResponse(
      "<Response><Say>Sorry, our system is having trouble. Please call back shortly.</Say><Hangup/></Response>",
      { headers: { "content-type": "text/xml" } },
    );
  }

  // Forward immediately if the assistant isn't enabled
  if (!assistant?.enabled) {
    if (phoneNumber.forwardToE164) {
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Dial>${phoneNumber.forwardToE164}</Dial>\n</Response>`,
        { headers: { "content-type": "text/xml" } },
      );
    }
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>Thanks for calling. We\'re not available right now. Please try again later.</Say>\n  <Hangup/>\n</Response>',
      { headers: { "content-type": "text/xml" } },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const respondUrl = `${appUrl}/api/voice/respond?callSid=${encodeURIComponent(callSid)}`;

  const greeting = assistant.greeting ?? "Hi, thanks for calling. How can I help you today?";
  const voice = assistant.voice ?? "alice";
  const language = assistant.language ?? "en-US";

  const audioUrl = await renderSpeechForTurn({
    text: greeting,
    voiceProvider: assistant.voiceProvider ?? "twilio",
    elevenlabsVoiceId: assistant.elevenlabsVoiceId ?? null,
    elevenlabsModel: assistant.elevenlabsModel ?? null,
  });

  const twiml = buildTwiml({
    say: greeting,
    voice,
    language,
    callbackUrl: respondUrl,
    audioUrl: audioUrl ?? undefined,
  });

  logger.info({ event: "voice.incoming.greeted", callSid, orgId: phoneNumber.organizationId });

  return new NextResponse(twiml, { headers: { "content-type": "text/xml" } });
}
