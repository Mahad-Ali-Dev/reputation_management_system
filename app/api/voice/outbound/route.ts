import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { buildTwiml, renderSpeechForTurn } from "@/lib/phone/brain";
import { parseAndVerifyTwilio } from "@/lib/phone/twilio-verify";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice/outbound?campaignId=...&targetId=...
 *
 * Twilio hits this when an outbound call connects (recipient answered).
 * We return the opening TwiML — the AI's script for this campaign.
 *
 * Subsequent turns use the same /api/voice/respond as inbound calls.
 *
 * Note on AMD (Answering Machine Detection): if Twilio detected a machine,
 * it sends `AnsweredBy=machine_start`. We could leave a voicemail in TwiML
 * via <Pause> + <Say>, but v1 just hangs up.
 */
export async function POST(req: NextRequest) {
  const verified = await parseAndVerifyTwilio(req);
  if (!verified.ok) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Forbidden.</Say><Hangup/></Response>',
      { status: 403, headers: { "content-type": "text/xml" } },
    );
  }
  const { params } = verified;
  const callSid = params.CallSid ?? null;
  const answeredBy = params.AnsweredBy ?? null;
  const campaignId = req.nextUrl.searchParams.get("campaignId");

  if (!callSid || !campaignId) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
      { headers: { "content-type": "text/xml" } },
    );
  }

  // If machine picked up, hang up. v2 we'll leave a voicemail.
  if (answeredBy === "machine_start" || answeredBy === "fax") {
    logger.info({ event: "phone.outbound.machine_detected", callSid, answeredBy });
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
      { headers: { "content-type": "text/xml" } },
    );
  }

  // Load campaign script + assistant config
  const campaign = await prisma.phoneCampaign.findUnique({
    where: { id: campaignId },
    select: { organizationId: true, script: true, name: true, purpose: true },
  });
  if (!campaign) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
      { headers: { "content-type": "text/xml" } },
    );
  }

  const assistant = await withTenant(campaign.organizationId, async (tx) =>
    tx.phoneAssistant.findUnique({ where: { organizationId: campaign.organizationId } }),
  );

  const opening = campaign.script ?? buildDefaultScript(campaign.purpose);
  const voice = assistant?.voice ?? "alice";
  const language = assistant?.language ?? "en-US";

  const audioUrl = await renderSpeechForTurn({
    text: opening,
    voiceProvider: assistant?.voiceProvider ?? "twilio",
    elevenlabsVoiceId: assistant?.elevenlabsVoiceId ?? null,
    elevenlabsModel: assistant?.elevenlabsModel ?? null,
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const respondUrl = `${appUrl}/api/voice/respond?callSid=${encodeURIComponent(callSid)}`;

  // Update the call status to in-progress
  await prisma.phoneCall.updateMany({
    where: { twilioCallSid: callSid },
    data: { status: "in-progress" },
  });

  const twiml = buildTwiml({
    say: opening,
    voice,
    language,
    callbackUrl: respondUrl,
    audioUrl: audioUrl ?? undefined,
  });

  return new NextResponse(twiml, { headers: { "content-type": "text/xml" } });
}

function buildDefaultScript(purpose: string): string {
  switch (purpose) {
    case "review_request":
      return "Hi! I'm calling from your local business. We hope you had a great experience — would you take a quick moment to share a review? It really helps small businesses like ours.";
    case "nps_survey":
      return "Hi! We're calling because we'd love your honest feedback. On a scale of zero to ten, how likely are you to recommend us to a friend?";
    case "win_back":
      return "Hi! We've missed you — it's been a while since your last visit. We'd love to have you back. Got a quick minute?";
    default:
      return "Hi! We're calling from your local business. Got a quick minute?";
  }
}
