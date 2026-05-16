import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { anthropic, MODELS } from "@/lib/ai/client";
import { getOrgContext } from "@/lib/auth/org-context";
import { checkBudget } from "@/lib/ai/budget";
import { checkRateLimit } from "@/lib/ratelimit";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/assistant
 *
 * In-app "Ask AI" help assistant. NOT the customer-facing chatbot — this is
 * the help bot for the operator (the dashboard user) so they can ask
 * "how do I X" without leaving the page.
 *
 * Auth: session cookie (operator must be logged in).
 * Rate limit: 20 turns / 5 min / user.
 * Budget: rolls up into the org's daily AI cap.
 *
 * Body: { messages: [{role, content}, ...] }
 * Returns: { answer: string }
 */

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(20),
});

const SYSTEM_PROMPT = `You are "repulabs Assistant", an in-app help bot for repulabs — a reputation-management SaaS for local businesses.

WHAT THE PRODUCT DOES
- Aggregates reviews from Google Business Profile (primary), Facebook, and other channels.
- Drafts AI replies that match the operator's brand voice. Operator approves before publish.
- Sends review requests via SMS + email (TCPA-compliant, with consent + unsubscribe).
- Runs NPS-style customer surveys with smart-routing (promoters → review request, detractors → internal alert).
- Manages QR review stands (hardware) — each device has a short slug like /r/ABC123 that signs and redirects to the Google review URL.
- AI Phone Receptionist: answers calls with a cloned voice, books appointments via Cal.com.
- Social Studio: schedules posts to Facebook/Instagram, monitors comments.
- Dispute service: helps remove fake/abusive Google reviews.

KEY UI LOCATIONS
- /dashboard — KPIs (rating, reviews/7d, requests, response rate), live review feed, queue, activity.
- /reviews — review inbox + AI reply approval queue. Filter by rating, source, has-reply.
- /reviews/dispute — file Google dispute tickets.
- /establishments — locations, connect Google Business Profile here.
- /connections — OAuth links to Google, Facebook, etc.
- /qr-codes and /hardware — physical review stands, activate via printed code.
- /outreach — send single or bulk review requests; templates.
- /support/comments — social comment inbox.
- /support/inbox — unified DM inbox.
- /surveys — NPS campaigns + responses.
- /phone — AI receptionist, voicemails, campaigns.
- /ai/training — feed business knowledge to the AI for better replies.
- /analytics — trend charts, sentiment, channel mix.
- /settings/account — profile, team, security, workspace info.
- /settings/subscription — billing, plan, cancel.

PLANS
- Free: 1 location, 50 review requests/mo, basic features.
- Pro: $89/mo per location — unlimited requests, AI replies in brand voice, AI phone (200 min), premium dispute, priority support.
- Scale: custom — SSO, multi-brand, dedicated CSM.

STYLE
- Be concise. 1-3 short paragraphs max. Use bullet points only if listing >3 items.
- Speak as the product owner ("you can..."). Never invent features that aren't in this brief.
- If asked something you don't know, say "I'm not sure — try the docs or support@repulabs.com" instead of making it up.
- If the user asks how to do something, give the EXACT menu path (e.g. "Settings → Subscription → Cancel").
- Don't repeat the product description unless the user asks "what is repulabs".`;

export async function POST(req: NextRequest) {
  const { orgId, userId } = await getOrgContext();

  const rl = await checkRateLimit("ai_assistant", `${orgId}:${userId}`);
  if (!rl.success) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "You're asking faster than I can think. Try again in a moment.",
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  const budget = await checkBudget(orgId);
  if (!budget.ok) {
    return NextResponse.json(
      {
        error: "ai_budget_exceeded",
        message:
          "Your daily AI usage cap has been hit. The cap resets at midnight UTC.",
      },
      { status: 429 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await anthropic.messages.create({
      model: MODELS.HAIKU,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: parsed.data.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const answer = result.content
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("\n")
      .trim();

    logger.info(
      {
        event: "ai.assistant.turn",
        orgId,
        userId,
        inputTokens: result.usage.input_tokens,
        outputTokens: result.usage.output_tokens,
      },
      "ask-ai turn completed",
    );

    return NextResponse.json({ answer });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ orgId, userId, error, event: "ai.assistant.failed" });
    return NextResponse.json(
      { error: "internal", message: "Something went wrong. Try again in a moment." },
      { status: 500 },
    );
  }
}
