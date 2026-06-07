import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkBudget } from "@/lib/ai/budget";
import { chatbotTurn } from "@/lib/ai/chatbot";
import { recordKnowledgeGap } from "@/lib/ai/confidence";
import { getOrgContext } from "@/lib/auth/org-context";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/kb-test — the in-app "Test AI" tester (Module 05).
 *
 * Session-gated (owner must be logged in) + entitlement-gated + rate-limited.
 * Kept SEPARATE from the public widget converse route so widget security
 * (origin/HMAC) is untouched; this route shares the chatbotTurn service, not
 * the route. Uses a synthetic owner visitorId so test turns don't pollute real
 * visitor analytics.
 *
 * Two actions:
 *   { question, establishmentId? } → run a turn, return {answer,confidence,citations}.
 *   { feedback: "down", question }  → owner thumbs-down → record a knowledge gap.
 */

const TurnBody = z.object({
  question: z.string().min(1).max(4000),
  establishmentId: z.string().uuid().nullish(),
  conversationId: z.string().uuid().nullish(),
});

const FeedbackBody = z.object({
  feedback: z.literal("down"),
  question: z.string().min(1).max(4000),
  answer: z.string().max(8000).optional(),
  establishmentId: z.string().uuid().nullish(),
  aiMessageId: z.string().uuid().nullish(),
});

export async function POST(req: NextRequest) {
  const { orgId, userId } = await getOrgContext();

  if (!(await isOrgEntitled(orgId))) {
    return NextResponse.json(
      { error: "plan_inactive", message: "AI features aren't included on your current plan." },
      { status: 402 },
    );
  }

  const raw = await req.json().catch(() => null);

  // Thumbs-down feedback path — record a gap, no model call.
  const fb = FeedbackBody.safeParse(raw);
  if (fb.success) {
    try {
      await recordKnowledgeGap({
        orgId,
        question: fb.data.question,
        source: "owner_test",
        purpose: "chatbot",
        confidence: 0, // owner explicitly flagged it as wrong/insufficient
        aiMessageId: fb.data.aiMessageId ?? null,
        establishmentId: fb.data.establishmentId ?? null,
      });
    } catch (err) {
      logger.warn({ event: "kb_test.feedback_failed", orgId, error: err instanceof Error ? err.message : String(err) });
    }
    return NextResponse.json({ ok: true });
  }

  const parsed = TurnBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rl = await checkRateLimit("chatbot_turn", `${orgId}:owner-test:${userId}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds, message: "Slow down — try again in a moment." },
      { status: 429 },
    );
  }

  const budget = await checkBudget(orgId);
  if (!budget.ok) {
    return NextResponse.json(
      { error: "ai_budget_exceeded", message: "Your daily AI usage cap has been hit. Resets at midnight UTC." },
      { status: 429 },
    );
  }

  const establishmentId = parsed.data.establishmentId ?? null;
  const visitorId = `owner-test:${userId}`;

  // Find or create the owner's private test conversation.
  let conversationId = parsed.data.conversationId ?? null;
  try {
    if (conversationId) {
      const conv = await withTenant(orgId, async (tx) =>
        tx.aiConversation.findFirst({
          where: { id: conversationId as string, visitorId, organizationId: orgId },
          select: { id: true },
        }),
      );
      if (!conv) conversationId = null;
    }
    if (!conversationId) {
      const conv = await withTenant(orgId, async (tx) =>
        tx.aiConversation.create({
          data: { organizationId: orgId, establishmentId, visitorId, channel: "webchat" },
        }),
      );
      conversationId = conv.id;
    }
  } catch (err) {
    logger.error({ event: "kb_test.conversation_failed", orgId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  try {
    const result = await chatbotTurn({
      orgId,
      establishmentId,
      conversationId: conversationId as string,
      userMessage: parsed.data.question,
    });

    // chatbotTurn already routes confidence into the gap queue (source "widget").
    // No extra recordConfidence here to avoid double-counting the same turn.

    return NextResponse.json({
      conversationId,
      answer: result.answer,
      confidence: result.confidence,
      citations: result.citations,
      fallback: result.fallback,
      aiMessageId: result.aiMessageId,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ event: "kb_test.turn_failed", orgId, error });
    return NextResponse.json({ error: "internal", message: "Something went wrong. Try again." }, { status: 500 });
  }
}
