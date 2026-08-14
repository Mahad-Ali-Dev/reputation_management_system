import { checkBudget } from "@/lib/ai/budget";
import { MODELS, anthropic } from "@/lib/ai/client";
import { getOrgContext } from "@/lib/auth/org-context";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { PRO_PRICE_AUD } from "@/lib/billing/plans";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
 * Body: { messages: [{role, content}, ...], mode?: "help" | "dashboard" }
 * Returns: { answer: string }
 *
 * Modes:
 *   - "help" (default): generic in-app product help. Byte-identical to the
 *     original behavior — back-compat for `components/ask-ai.tsx`.
 *   - "dashboard": the dashboard's "ask anything about your business" surface.
 *     Prepends an org-scoped context block (recent review snippets + KB doc
 *     titles, read via `withTenant`) so answers reference the operator's own
 *     data. Same entitlement / rate / budget gates as help mode.
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
  mode: z.enum(["help", "dashboard"]).default("help"),
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
- /ai — feed business knowledge to the AI for better replies.
- /analytics — trend charts, sentiment, channel mix.
- /settings — profile, team, brand, notifications, security, API, data export.
- /subscription — billing, plan, cancel.

PLANS
- Free: 1 location, 50 review requests/mo, basic features.
- Pro: A$${PRO_PRICE_AUD}/mo per location — unlimited requests, AI replies in brand voice, AI phone (200 min), premium dispute, priority support.
- Scale: custom — SSO, multi-brand, dedicated CSM.

STYLE
- Be concise. 1-3 short paragraphs max. Use bullet points only if listing >3 items.
- Speak as the product owner ("you can..."). Never invent features that aren't in this brief.
- If asked something you don't know, say "I'm not sure — try the docs or info@repulabs.com" instead of making it up.
- If the user asks how to do something, give the EXACT menu path (e.g. "Settings → Subscription → Cancel").
- Don't repeat the product description unless the user asks "what is repulabs".`;

/**
 * Build an org-scoped context block for `mode: "dashboard"`. Reads a compact
 * snapshot of THIS org's data — a few recent review snippets and the titles of
 * indexed AI knowledge-base docs — via `withTenant` so the assistant can answer
 * about the operator's own business, not just generic product help.
 *
 * Fail-soft: any query error (incl. a missing table — 42P01/42703 on an org that
 * predates these models) degrades to an empty string, so the dashboard assistant
 * simply falls back to generic help rather than erroring.
 */
async function buildOrgContext(orgId: string): Promise<string> {
  try {
    const { reviews, docs } = await withTenant(orgId, async (tx) => {
      const [reviews, docs] = await Promise.all([
        tx.review.findMany({
          where: { body: { not: null } },
          select: { rating: true, reviewerName: true, body: true, source: true },
          orderBy: { postedAt: "desc" },
          take: 6,
        }),
        tx.aiDocument.findMany({
          where: { status: "indexed" },
          select: { title: true },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
      ]);
      return { reviews, docs };
    });

    const lines: string[] = [];

    if (reviews.length > 0) {
      lines.push("RECENT REVIEWS (most recent first):");
      for (const r of reviews) {
        const who = r.reviewerName?.trim() || "Anonymous";
        const snippet = (r.body ?? "").replace(/\s+/g, " ").trim().slice(0, 180);
        lines.push(`- ${r.rating}★ (${r.source}) ${who}: "${snippet}"`);
      }
    }

    if (docs.length > 0) {
      if (lines.length > 0) lines.push("");
      lines.push("KNOWLEDGE BASE DOCUMENTS (titles only):");
      for (const d of docs) lines.push(`- ${d.title}`);
    }

    if (lines.length === 0) return "";

    return `\n\nBUSINESS CONTEXT — the operator is asking about THEIR OWN business. Ground answers in the data below; cite specifics (a reviewer, a rating, a recurring topic) where relevant. If the question needs data not shown here, say what you can see and point them to the right page. Do NOT fabricate reviews or numbers.\n\n${lines.join("\n")}`;
  } catch (err) {
    logger.warn({
      orgId,
      error: err instanceof Error ? err.message : String(err),
      event: "ai.assistant.org_context_failed",
    });
    return "";
  }
}

/**
 * GET /api/ai/assistant — entitlement check only, no model call.
 *
 * The floating launcher (components/ask-ai.tsx) always opens for a signed-in
 * user, but the chat area itself is Pro-gated: this lets the panel know
 * up-front (on mount) whether to blur the chat with an upgrade message,
 * rather than only finding out after the visitor types a question and the
 * POST comes back 402.
 */
export async function GET() {
  const { orgId } = await getOrgContext();
  return NextResponse.json({ entitled: await isOrgEntitled(orgId) });
}

export async function POST(req: NextRequest) {
  const { orgId, userId } = await getOrgContext();

  // AI features are paid — block lapsed/free orgs (past_due, suspended, free,
  // expired trial). Active + in-trial orgs pass.
  if (!(await isOrgEntitled(orgId))) {
    return NextResponse.json(
      {
        error: "plan_inactive",
        message:
          "AI features aren't included on your current plan. Upgrade in Settings → Subscription.",
      },
      { status: 402 },
    );
  }

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
        message: "Your daily AI usage cap has been hit. The cap resets at midnight UTC.",
      },
      { status: 429 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Dashboard mode mixes in an org-scoped context block; help mode is unchanged.
  const system =
    parsed.data.mode === "dashboard"
      ? `${SYSTEM_PROMPT}${await buildOrgContext(orgId)}`
      : SYSTEM_PROMPT;

  try {
    const result = await anthropic.messages.create({
      model: MODELS.HAIKU,
      max_tokens: 600,
      system,
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
