import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyVisitorJwt } from "@/lib/ai/widget-jwt";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { softInbox } from "@/lib/inbox/fail-soft";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";

/**
 * POST /api/widget/meeting-request
 *
 * Public capture endpoint for the chat widget's "request a meeting" flow
 * (ReviewBoost parity). A website visitor submits their name + (optional)
 * contact + preferred time and the row lands in the operator queue at
 * /support/meetings.
 *
 * AUTH — identical model to /api/ai/chatbot/converse: the request carries the
 * per-visitor `Authorization: Bearer <jwt>` minted by /api/ai/widget/bootstrap.
 * We peek the publicKey from the (unverified) payload to find which WidgetKey
 * signed it, then VERIFY the JWT with that key's per-tenant HMAC secret. The org
 * id comes from the VERIFIED claims — never from the request body — so a visitor
 * can only ever insert into the org that issued their token. Origin is checked
 * against the key's allowlist, and we rate-limit per visitor.
 *
 * Fail-soft: insert degrades to a no-op (202) on a not-yet-migrated DB so the
 * widget never sees a 500 while the meeting_requests SQL is pending.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
  preferredTime: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return cors({ error: "missing_token" }, 401, req);
  }
  const token = auth.slice(7);

  // Peek the publicKey from the (unverified) payload — just enough to find the
  // WidgetKey whose secret we verify the JWT against.
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

  const widget = await prisma.widgetKey
    .findUnique({
      where: { publicKey },
      select: { hmacSecret: true, originAllowlist: true, status: true },
    })
    .catch(() => null);
  if (!widget || widget.status !== "active") {
    return cors({ error: "widget_revoked" }, 401, req);
  }

  // Verify JWT signature with this widget's secret → trustworthy orgId.
  let claims: Awaited<ReturnType<typeof verifyVisitorJwt>>;
  try {
    claims = await verifyVisitorJwt(widget.hmacSecret, token);
  } catch {
    return cors({ error: "invalid_token" }, 401, req);
  }

  // Origin check (same contract as converse): if the key has an allowlist, the
  // request Origin must be in it. Echo only an allowed origin back in CORS.
  const origin = req.headers.get("origin");
  if (widget.originAllowlist.length > 0 && (!origin || !widget.originAllowlist.includes(origin))) {
    return cors({ error: "origin_not_allowed" }, 403, req);
  }
  const allowOrigin = origin ?? undefined;

  // Per-visitor rate limit — bounds spam from a single embedded widget session.
  const rl = await checkRateLimit("widget_meeting", `${claims.orgId}:${claims.visitorId}`);
  if (!rl.success) {
    return cors(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds, message: "Please wait a moment before submitting again." },
      429,
      req,
      allowOrigin,
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return cors({ error: "invalid_body" }, 400, req, allowOrigin);
  }
  const { name, email, phone, message, preferredTime } = parsed.data;
  const clean = (v: string | undefined) => {
    const t = (v ?? "").trim();
    return t.length > 0 ? t : null;
  };

  // Insert via an org-scoped withTenant write — RLS scopes the row to the org
  // from the VERIFIED claims, not raw input. Fail-soft on a pre-migration DB.
  const created = await softInbox(
    () =>
      withTenant(claims.orgId, async (tx) =>
        tx.meetingRequest.create({
          data: {
            organizationId: claims.orgId,
            establishmentId: claims.establishmentId ?? null,
            name,
            email: clean(email),
            phone: clean(phone),
            message: clean(message),
            preferredTime: clean(preferredTime),
            source: "chat",
            status: "new",
          },
          select: { id: true },
        }),
      ),
    null,
    { event: "inbox.meeting_request.insert_failed", context: { orgId: claims.orgId } },
  );

  if (!created) {
    // Pre-migration (table absent) → accept-but-no-op so the widget UX still
    // confirms. Logged above; nothing reaches the queue until the SQL is applied.
    logger.warn({ event: "inbox.meeting_request.not_persisted", orgId: claims.orgId });
    return cors({ ok: true, persisted: false }, 202, req, allowOrigin);
  }

  return cors({ ok: true, id: created.id }, 200, req, allowOrigin);
}

export async function OPTIONS(req: NextRequest) {
  // Preflight: browsers strip Authorization, so we can't authenticate here.
  // Reflect the origin so the real POST fires and is then properly authenticated
  // + origin-checked. Reflecting here grants no capability.
  const origin = req.headers.get("origin");
  return cors({}, 204, req, origin ?? undefined);
}

function cors(body: unknown, status: number, req: NextRequest, allowOrigin?: string): NextResponse {
  const origin = req.headers.get("origin");
  const res =
    body && typeof body === "object" && Object.keys(body).length > 0
      ? NextResponse.json(body, { status })
      : new NextResponse(null, { status });
  // SECURITY: only echo the origin when it was explicitly allowed by the caller.
  if (origin && allowOrigin === origin) {
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("access-control-allow-methods", "POST, OPTIONS");
    res.headers.set("access-control-allow-headers", "authorization, content-type");
    res.headers.set("vary", "origin");
  }
  return res;
}
