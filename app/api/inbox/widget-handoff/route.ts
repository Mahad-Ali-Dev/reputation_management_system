import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { verifyVisitorJwt } from "@/lib/ai/widget-jwt";
import { checkRateLimit } from "@/lib/ratelimit";
import { startSmsHandoff } from "@/lib/inbox/sms-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/inbox/widget-handoff  (Module 09 — Inbox, Wave 3c-B)
 *
 * The widget's "leave your number and we'll text you" capture endpoint. Called
 * by the embedded widget (authed via the per-visitor JWT, NOT an app session)
 * when a visitor submits their phone for SMS handoff — either because the org is
 * after-hours / in human-handoff mode, or the visitor chose it.
 *
 * Verifies the visitor JWT against the widget key's HMAC secret (same scheme as
 * /api/ai/chatbot/converse), then calls `startSmsHandoff` (entitlement-gated +
 * env-gated; creates the sms thread even when Twilio is absent so nothing drops).
 *
 * CORS: echoes the embedding origin only when it's in the widget allowlist
 * (mirrors the converse route).
 */

const Body = z.object({
  phone: z.string().min(5).max(32),
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
  conversationId: z.string().uuid().optional(),
  message: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return cors({ error: "missing_token" }, 401, req);
  }
  const token = auth.slice(7);

  // Peek the public key from the JWT (unverified), look up the secret, verify.
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
    select: { organizationId: true, hmacSecret: true, originAllowlist: true, status: true },
  });
  if (!widget || widget.status !== "active") {
    return cors({ error: "widget_revoked" }, 401, req);
  }

  let claims: Awaited<ReturnType<typeof verifyVisitorJwt>>;
  try {
    claims = await verifyVisitorJwt(widget.hmacSecret, token);
  } catch {
    return cors({ error: "invalid_token" }, 401, req);
  }

  // Origin check + allowlist echo.
  const origin = req.headers.get("origin");
  if (widget.originAllowlist.length > 0 && (!origin || !widget.originAllowlist.includes(origin))) {
    return cors({ error: "origin_not_allowed" }, 403, req);
  }
  const allowOrigin = origin ?? undefined;

  // Rate limit per visitor (this writes + may send an SMS). Reuses the
  // per-visitor chatbot limiter (same widget surface) — no new limiter name.
  const rl = await checkRateLimit("chatbot_turn", `handoff:${claims.orgId}:${claims.visitorId}`);
  if (!rl.success) {
    return cors({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, 429, req, allowOrigin);
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors({ error: "invalid_body" }, 400, req, allowOrigin);
  }

  try {
    const result = await startSmsHandoff({
      orgId: claims.orgId,
      conversationId: parsed.data.conversationId ?? null,
      visitorPhone: parsed.data.phone,
      visitorName: parsed.data.name ?? null,
      visitorEmail: parsed.data.email ?? null,
      firstMessage: parsed.data.message,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });

    if (!result.ok) {
      // Map the few user-facing reasons; everything else is a generic 400.
      const status = result.error === "not_entitled" ? 402 : 400;
      return cors({ error: result.error }, status, req, allowOrigin);
    }
    return cors(
      {
        ok: true,
        smsSent: result.smsSent,
        // Don't leak the org's handoff number to the visitor; just confirm.
        message: result.smsSent
          ? "Thanks! We'll text you shortly."
          : "Thanks! We've saved your number and will reach out.",
      },
      200,
      req,
      allowOrigin,
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ orgId: claims.orgId, error, event: "inbox.widget_handoff.failed" });
    return cors({ error: "internal" }, 500, req, allowOrigin);
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  return cors({}, 204, req, origin ?? undefined);
}

function cors(body: unknown, status: number, req: NextRequest, allowOrigin?: string): NextResponse {
  const origin = req.headers.get("origin");
  const res =
    body && typeof body === "object" && Object.keys(body).length > 0
      ? NextResponse.json(body, { status })
      : new NextResponse(null, { status });
  if (origin && allowOrigin === origin) {
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("access-control-allow-methods", "POST, OPTIONS");
    res.headers.set("access-control-allow-headers", "authorization, content-type");
    res.headers.set("vary", "origin");
  }
  return res;
}
