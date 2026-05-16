import { anthropic, MODELS } from "./client";

/**
 * AI-generate a review-request body in the org's brand voice.
 *
 * Returns plain text suitable for SMS (≤320 chars) or email body
 * (with paragraphs). The caller picks which channel to send to.
 *
 * Cost: ~$0.0008 per call (Haiku, ~300 input + ~100 output tokens).
 */
const SYSTEM_PROMPT = `You write short, warm review-request messages for local businesses.

Rules:
- Be concise — under 600 characters for SMS, under 1200 for email.
- Sound like a real person, not a corporate brand.
- Always include a clear ask + the review link placeholder {{reviewLink}}.
- Use the customer's first name when provided via {{customerName}}.
- Mention the business by name once (use {{businessName}}).
- Never invent specific details about the customer's visit.
- No exclamation marks beyond one. No emojis unless tone = "playful".

Return only the message body — no headers, signoffs, or commentary.`;

const TONE_DIRECTIVES: Record<string, string> = {
  friendly: "Warm and conversational. Use contractions.",
  formal: "Polished and respectful. No contractions. Address by name.",
  brief: "Three short sentences max. Direct and to the point.",
  warm: "Express genuine gratitude. Mention you'd love to hear honest feedback.",
  playful: "Slightly cheeky tone. One emoji at the start is acceptable.",
};

export type RequestTone = "friendly" | "formal" | "brief" | "warm" | "playful";

export async function generateReviewRequestBody(args: {
  businessName: string;
  channel: "sms" | "email";
  tone: RequestTone;
  context?: string;  // Optional: "first-time customer", "purchased X", etc.
}): Promise<{ body: string; costMicros: number }> {
  const directive = TONE_DIRECTIVES[args.tone] ?? TONE_DIRECTIVES.friendly;
  const userMsg = `Write a ${args.channel} review request for ${args.businessName}.

Tone: ${args.tone}. ${directive}

${args.context ? `Context: ${args.context}` : ""}

Use placeholders {{customerName}}, {{businessName}}, {{reviewLink}}. Return just the message.`;

  const response = await anthropic.messages.create({
    model: MODELS.HAIKU,
    max_tokens: 400,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMsg }],
  });

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("ai_generate_no_text");
  }
  const body = textBlock.text.trim();

  const costMicros = Math.round(
    response.usage.input_tokens * 1 + response.usage.output_tokens * 5,
  );

  return { body, costMicros };
}
