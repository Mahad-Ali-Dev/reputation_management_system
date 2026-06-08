import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { signVisitorJwt } from "@/lib/ai/widget-jwt";
import { checkRateLimit } from "@/lib/ratelimit";
import {
  getWidgetConfig,
  resolveWidgetMode,
  toAppearance,
  type WidgetAiMode,
} from "@/lib/inbox/widget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai/widget/bootstrap?key=<publicKey>
 *
 * Called by the widget script on page load. Verifies the request Origin is in the tenant's
 * allowlist, then issues a per-visitor JWT (1h TTL).
 *
 * CORS: the response carries `Access-Control-Allow-Origin: <origin>` so the widget can fetch
 * from the embedding site.
 */
export async function GET(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get("key");
  if (!publicKey || publicKey.length > 200) {
    return jsonWithCors({ error: "missing_key" }, 400, null);
  }

  // Rate limit per IP — prevents enumeration / DoS
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit("widget_bootstrap", `${publicKey}:${ip}`);
  if (!rl.success) {
    return jsonWithCors({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, 429, null);
  }

  // `aiMode` ships via the Wave-0 delta but may not be migrated yet; select it
  // fail-soft so the deployed widget bootstrap can never 500 on a missing column.
  let widget:
    | {
        organizationId: string;
        establishmentId: string | null;
        hmacSecret: string;
        originAllowlist: string[];
        status: string;
        aiMode?: string;
      }
    | null = null;
  try {
    widget = await prisma.widgetKey.findUnique({
      where: { publicKey },
      select: {
        organizationId: true,
        establishmentId: true,
        hmacSecret: true,
        originAllowlist: true,
        status: true,
        aiMode: true,
      },
    });
  } catch {
    // Column not migrated → re-read without it (preserves today's behaviour).
    widget = await prisma.widgetKey.findUnique({
      where: { publicKey },
      select: {
        organizationId: true,
        establishmentId: true,
        hmacSecret: true,
        originAllowlist: true,
        status: true,
      },
    });
  }
  if (!widget || widget.status !== "active") {
    return jsonWithCors({ error: "invalid_key" }, 404, null);
  }

  const origin = req.headers.get("origin");
  const allowed = !widget.originAllowlist.length || (origin !== null && widget.originAllowlist.includes(origin));
  if (!allowed) {
    logger.warn({ origin, publicKey, event: "widget.origin_rejected" });
    return jsonWithCors({ error: "origin_not_allowed" }, 403, origin);
  }

  const visitorId = randomBytes(16).toString("base64url");
  const jwt = await signVisitorJwt(widget.hmacSecret, {
    orgId: widget.organizationId,
    establishmentId: widget.establishmentId ?? undefined,
    publicKey,
    visitorId,
  });

  // Real appearance + AI-mode signal (additive; fail-soft to defaults). The
  // widget renders colors/header from `config` and shows the SMS phone-capture
  // when `config.captureMode === "capture"`. Defaults preserve today's behaviour:
  // greeting present, brand color, AI always answers.
  const cfg = await getWidgetConfig(widget.organizationId);
  const appearance = toAppearance(cfg);
  const aiMode = (widget.aiMode as WidgetAiMode | undefined) ?? "always_on";
  const mode = resolveWidgetMode({
    aiMode,
    config: { businessHours: cfg.businessHours, smsHandoffEnabled: cfg.smsHandoffEnabled },
  });

  return jsonWithCors(
    {
      token: jwt,
      visitorId,
      // Widget UI config. `greeting` is preserved for byte-compat with the
      // existing widget; the rest is additive (older widget bundles ignore it).
      config: {
        greeting: appearance.greeting,
        brandColor: appearance.brandColor,
        headerText: appearance.headerText,
        avatarUrl: appearance.avatarUrl,
        position: appearance.position,
        agentPresence: appearance.agentPresence,
        // "ai" → bot answers; "capture" → ask for a phone (after-hours/handoff).
        captureMode: mode.decision,
        offerSmsHandoff: mode.offerSmsHandoff,
      },
    },
    200,
    origin,
  );
}

export async function OPTIONS(req: NextRequest) {
  return jsonWithCors({}, 204, req.headers.get("origin"));
}

function jsonWithCors(body: unknown, status: number, origin: string | null): NextResponse {
  const res = body && Object.keys(body).length > 0
    ? NextResponse.json(body, { status })
    : new NextResponse(null, { status });
  if (origin) {
    res.headers.set("access-control-allow-origin", origin);
    res.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
    res.headers.set("access-control-allow-headers", "authorization, content-type");
    res.headers.set("vary", "origin");
  }
  return res;
}
