import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkBudget } from "@/lib/ai/budget";
import { chatbotTurn } from "@/lib/ai/chatbot";
import { verifyVisitorJwt } from "@/lib/ai/widget-jwt";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return cors({ error: "missing_token" }, 401, req);
  }
  const token = auth.slice(7);

  // Find which widget key signed this JWT — we need to know the org first
  // The widget JWT payload tells us the public key; look up the secret and verify
  // We use jose to peek at the claims without verifying (just for public_key)
  let publicKey: string | null = null;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
        publicKey?: string;
      };
      publicKey = payload.publicKey ?? null;
    }
  } catch {
    return cors({ error: "bad_token" }, 401, req);
  }
  if (!publicKey) return cors({ error: "bad_token" }, 401, req);

  const widget = await prisma.widgetKey.findUnique({
    where: { publicKey },
    select: {
      organizationId: true,
      establishmentId: true,
      hmacSecret: true,
      originAllowlist: true,
      rateLimitWindowSec: true,
      rateLimitMaxMsgs: true,
      status: true,
    },
  });
  if (!widget || widget.status !== "active") {
    return cors({ error: "widget_revoked" }, 401, req);
  }

  // Verify JWT signature with this widget's secret
  let claims: Awaited<ReturnType<typeof verifyVisitorJwt>>;
  try {
    claims = await verifyVisitorJwt(widget.hmacSecret, token);
  } catch {
    return cors({ error: "invalid_token" }, 401, req);
  }

  // Origin check
  const origin = req.headers.get("origin");
  if (widget.originAllowlist.length > 0 && (!origin || !widget.originAllowlist.includes(origin))) {
    return cors({ error: "origin_not_allowed" }, 403, req);
  }
  // After this point we know the origin is in the widget's allowlist (or the
  // allowlist is empty, which means "any origin"). Either way, this origin is
  // OK to echo back in CORS headers.
  const allowOrigin = origin ?? undefined;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors({ error: "invalid_body" }, 400, req, allowOrigin);
  }

  // Per-visitor rate limit (cheap, runs before any AI call)
  const rl = await checkRateLimit("chatbot_turn", `${claims.orgId}:${claims.visitorId}`);
  if (!rl.success) {
    return cors(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds, message: "Slow down — try again in a moment." },
      429,
      req,
      allowOrigin,
    );
  }

  // Per-tenant daily AI cost cap
  const budget = await checkBudget(claims.orgId);
  if (!budget.ok) {
    logger.warn(
      { orgId: claims.orgId, spent: budget.spentMicros, cap: budget.capMicros, event: "chatbot.cap_exceeded" },
      "AI budget cap exceeded",
    );
    return cors(
      {
        error: "ai_budget_exceeded",
        message:
          "Sorry, this assistant is temporarily limited. Leave your contact and we'll follow up.",
      },
      429,
      req,
      allowOrigin,
    );
  }

  // Per-visitor sliding window rate limit.
  // AiMessage has no Prisma-level relation to AiConversation, so we fetch the
  // conversation IDs for this visitor first and filter via `conversationId IN (...)`.
  const windowMs = widget.rateLimitWindowSec * 1000;
  const since = new Date(Date.now() - windowMs);
  const { visitorMsgCount } = await withTenant(claims.orgId, async (tx) => {
    const visitorConversations = await tx.aiConversation.findMany({
      where: {
        organizationId: claims.orgId,
        visitorId: claims.visitorId,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (visitorConversations.length === 0) return { visitorMsgCount: 0 };
    const count = await tx.aiMessage.count({
      where: {
        organizationId: claims.orgId,
        purpose: "chatbot",
        role: "user",
        createdAt: { gte: since },
        conversationId: { in: visitorConversations.map((c) => c.id) },
      },
    });
    return { visitorMsgCount: count };
  });
  if (visitorMsgCount >= widget.rateLimitMaxMsgs) {
    return cors({ error: "rate_limited", message: "You're sending messages too quickly. Please wait a moment." }, 429, req, allowOrigin);
  }

  // Find or create the conversation
  let conversationId = parsed.data.conversationId;
  if (!conversationId) {
    const conv = await withTenant(claims.orgId, async (tx) =>
      tx.aiConversation.create({
        data: {
          organizationId: claims.orgId,
          establishmentId: claims.establishmentId ?? null,
          visitorId: claims.visitorId,
          channel: "webchat",
        },
      }),
    );
    conversationId = conv.id;
  } else {
    // Validate the conversation belongs to this visitor + org
    const conv = await withTenant(claims.orgId, async (tx) =>
      tx.aiConversation.findFirst({
        where: { id: conversationId, visitorId: claims.visitorId },
        select: { id: true },
      }),
    );
    if (!conv) return cors({ error: "invalid_conversation" }, 403, req, allowOrigin);
  }

  try {
    const result = await chatbotTurn({
      orgId: claims.orgId,
      establishmentId: claims.establishmentId ?? null,
      conversationId,
      userMessage: parsed.data.message,
    });
    return cors(
      {
        conversationId,
        answer: result.answer,
        confidence: result.confidence,
        fallback: result.fallback,
      },
      200,
      req,
      allowOrigin,
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ orgId: claims.orgId, error, event: "chatbot.turn_failed" });
    return cors({ error: "internal", message: "Something went wrong. Please try again." }, 500, req, allowOrigin);
  }
}

export async function OPTIONS(req: NextRequest) {
  // Preflight: browsers strip Authorization, so we can't authenticate the
  // calling widget here. We reflect the origin so the browser will fire the
  // real POST, which is then properly authenticated + origin-checked against
  // the widget's allowlist. Reflecting here grants no capability — it just
  // lets the actual request through to be validated.
  const origin = req.headers.get("origin");
  return cors({}, 204, req, origin ?? undefined);
}

function cors(body: unknown, status: number, req: NextRequest, allowOrigin?: string): NextResponse {
  const origin = req.headers.get("origin");
  const res =
    body && typeof body === "object" && Object.keys(body).length > 0
      ? NextResponse.json(body, { status })
      : new NextResponse(null, { status });
  // SECURITY: don't reflect arbitrary Origin. Only echo origin if it was
  // explicitly allowed by the widget's originAllowlist (set by the caller).
  // For preflights without a known widget we omit the header — the browser
  // will block the request, which is the safe default.
  if (origin && allowOrigin === origin) {
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    res.headers.set("access-control-allow-headers", "authorization, content-type");
    res.headers.set("vary", "origin");
  }
  return res;
}
