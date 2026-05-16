/**
 * AI phone receptionist brain.
 *
 * Architecture:
 *   - Caller speaks → Twilio transcribes (built-in STT via <Gather input="speech">)
 *   - We get the SpeechResult in the webhook
 *   - We load conversation history + business context + assistant config
 *   - Call Claude Haiku (low latency) with structured output
 *   - Return TwiML <Say> + nested <Gather> for the next turn
 *   - Loop until end-of-call signal
 *
 * Why Haiku not Sonnet:
 *   - Phone conversations need <2s response latency. Haiku averages ~1.5s.
 *   - Sonnet is 3-5s. That's painful on a phone line.
 *
 * Cost: ~$0.001 per turn (Haiku ~500 input + ~80 output tokens).
 */

import { anthropic, MODELS } from "@/lib/ai/client";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { retrieveChunks } from "@/lib/ai/ingest";

const RESPONSE_TOOL = {
  name: "respond_to_caller",
  description:
    "Decide how to respond to the caller. Return what to say + whether to keep listening, hand off to a human, or end the call.",
  input_schema: {
    type: "object" as const,
    properties: {
      response: {
        type: "string",
        description:
          "The exact phrase to say back to the caller. Keep it short — 1-2 sentences max. No greetings after the first turn.",
      },
      next_action: {
        type: "string",
        enum: ["continue", "handoff_to_human", "end_call", "collect_contact"],
        description: "What to do after speaking.",
      },
      detected_intent: {
        type: "string",
        description: "Caller's apparent goal: 'booking', 'pricing', 'hours', 'complaint', 'general', etc.",
      },
      lead_name: { type: "string", description: "If caller stated their name." },
      lead_phone: { type: "string", description: "If caller stated a callback number." },
      lead_email: { type: "string", description: "If caller stated an email." },
    },
    required: ["response", "next_action"],
  },
};

export type BrainResponse = {
  response: string;
  next_action: "continue" | "handoff_to_human" | "end_call" | "collect_contact";
  detected_intent?: string;
  lead_name?: string;
  lead_phone?: string;
  lead_email?: string;
  costMicros: number;
  latencyMs: number;
};

function escapeForXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build the Claude system prompt from org's training profile + assistant config.
 */
async function buildSystemPrompt(orgId: string): Promise<string> {
  const [org, training, assistant] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.organization.findUnique({
        where: { id: orgId },
        select: { name: true, businessDescription: true, country: true },
      }),
      tx.aiTrainingProfile.findUnique({ where: { organizationId: orgId } }),
      tx.phoneAssistant.findUnique({ where: { organizationId: orgId } }),
    ]),
  );

  const businessName = org?.name ?? "this business";
  const description = org?.businessDescription ?? training?.businessOverview ?? "";
  const services = training?.servicesProducts ?? "";
  const pricing = training?.pricingDetails ?? "";
  const hours = training?.operatingHours
    ? `Operating hours: ${JSON.stringify(training.operatingHours)}`
    : "";
  const customInstructions = assistant?.customInstructions ?? training?.customPrompt ?? "";
  const personality = training?.aiPersonalityStyle ?? "friendly";

  return `You are a phone receptionist for "${businessName}". Your tone is ${personality}.

${description ? `BUSINESS:\n${description}\n` : ""}
${services ? `SERVICES:\n${services}\n` : ""}
${pricing ? `PRICING:\n${pricing}\n` : ""}
${hours ? hours + "\n" : ""}
${customInstructions ? `CUSTOM RULES:\n${customInstructions}\n` : ""}

CRITICAL CONVERSATIONAL RULES (phone is different from text):
- Respond in 1-2 sentences. No more.
- Never use markdown, bullet points, or list syntax.
- Spell out numbers ("five hundred dollars" not "$500") for clearer text-to-speech.
- Don't say "Hi" or "Hello" except on the very first turn.
- If the caller asks something you don't know, say so honestly and offer to take a message.
- If the caller asks for a human, set next_action="handoff_to_human".
- If the caller says goodbye or seems done, set next_action="end_call".
- If you collect a name, phone, or email, include it in the structured output so we can save it.

Use the respond_to_caller tool. Don't include reasoning — just the structured output.`;
}

export async function generateBrainResponse(args: {
  orgId: string;
  callId: string;
  callerText: string;
  history: Array<{ role: "caller" | "assistant"; text: string }>;
}): Promise<BrainResponse> {
  const systemPrompt = await buildSystemPrompt(args.orgId);

  // Optional RAG: pull top-3 chunks from KB for caller's query
  const chunks = await withTenant(args.orgId, async () =>
    retrieveChunks({
      organizationId: args.orgId,
      establishmentId: null,
      query: args.callerText,
      topK: 3,
    }).catch(() => []),
  );

  const docsBlock = chunks.length > 0
    ? "\n\nRelevant info from our knowledge base:\n" +
      chunks.map((c, i) => `[chunk ${i + 1}] ${c.chunkText.slice(0, 400)}`).join("\n")
    : "";

  // Build messages: history + current turn
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const h of args.history) {
    messages.push({
      role: h.role === "caller" ? "user" : "assistant",
      content: h.text,
    });
  }
  messages.push({
    role: "user",
    content: args.callerText + docsBlock,
  });

  const t0 = Date.now();
  const response = await anthropic.messages.create({
    model: MODELS.HAIKU,
    max_tokens: 300,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    tools: [RESPONSE_TOOL],
    tool_choice: { type: "tool", name: "respond_to_caller" },
    messages,
  });
  const latencyMs = Date.now() - t0;

  const tool = response.content.find((c) => c.type === "tool_use");
  if (!tool || tool.type !== "tool_use") {
    // Fallback: degrade gracefully
    return {
      response: "I'm sorry, I didn't catch that. Could you say it again?",
      next_action: "continue",
      costMicros: 0,
      latencyMs,
    };
  }
  const parsed = tool.input as BrainResponse;

  const costMicros = Math.round(
    response.usage.input_tokens * 1 + response.usage.output_tokens * 5,
  );

  return {
    response: parsed.response,
    next_action: parsed.next_action,
    detected_intent: parsed.detected_intent,
    lead_name: parsed.lead_name,
    lead_phone: parsed.lead_phone,
    lead_email: parsed.lead_email,
    costMicros,
    latencyMs,
  };
}

/**
 * Build a TwiML response for the next conversational turn.
 *
 * Voice rendering:
 *   - audioUrl set → use <Play> (ElevenLabs / custom voice)
 *   - audioUrl not set → use <Say> (Twilio built-in voices)
 *
 * <Gather input="speech"> waits for the caller to speak, then POSTs the
 * transcript to the action URL.
 */
export function buildTwiml(args: {
  say: string;
  voice: string;
  language: string;
  callbackUrl: string;
  hangup?: boolean;
  dialNumber?: string;
  audioUrl?: string;  // when set, use <Play> instead of <Say> (ElevenLabs)
}): string {
  const escapedSay = escapeForXml(args.say);
  const escapedVoice = escapeForXml(args.voice);
  const escapedLang = escapeForXml(args.language);

  const speech = args.audioUrl
    ? `<Play>${escapeForXml(args.audioUrl)}</Play>`
    : `<Say voice="${escapedVoice}" language="${escapedLang}">${escapedSay}</Say>`;

  if (args.dialNumber) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech}
  <Dial>${escapeForXml(args.dialNumber)}</Dial>
</Response>`;
  }

  if (args.hangup) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${speech}
  <Hangup/>
</Response>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeForXml(args.callbackUrl)}" method="POST" speechTimeout="auto" speechModel="phone_call" language="${escapedLang}">
    ${speech}
  </Gather>
  <Say voice="${escapedVoice}" language="${escapedLang}">I didn't catch anything. Goodbye for now.</Say>
  <Hangup/>
</Response>`;
}

/**
 * Render speech for a turn. Returns ElevenLabs audio URL if assistant is
 * configured for it, null otherwise (caller falls back to Twilio <Say>).
 */
export async function renderSpeechForTurn(args: {
  text: string;
  voiceProvider: string;
  elevenlabsVoiceId: string | null;
  elevenlabsModel: string | null;
}): Promise<string | null> {
  if (args.voiceProvider !== "elevenlabs" || !args.elevenlabsVoiceId) return null;
  try {
    const { synthesizeAndCache } = await import("./elevenlabs");
    const result = await synthesizeAndCache({
      text: args.text,
      voiceId: args.elevenlabsVoiceId,
      model: args.elevenlabsModel ?? "eleven_turbo_v2_5",
    });
    return result.url;
  } catch {
    return null;
  }
}
