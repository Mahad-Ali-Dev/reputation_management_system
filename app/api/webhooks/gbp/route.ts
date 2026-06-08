import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { type InboundNormalized, ingestInbound } from "@/lib/inbox/ingest";
import { logger } from "@/lib/logger";
import { isProductionRuntime } from "@/lib/secrets";
import { handleIdempotent } from "@/lib/webhooks/idempotency";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google Business Messages (GBP) webhook.
 *
 * Google Business Messages delivers consumer messages to your configured webhook
 * as JSON. The integration is authenticated by a **`clientToken`** you set in the
 * Business Communications console — Google includes it in the body of every
 * delivery (and in the one-time webhook-verification handshake), and the partner
 * MUST reject any request whose token doesn't match. We treat that token as the
 * env-gated secret `GBP_WEBHOOK_SECRET`.
 *
 *   GET  — one-time verification handshake. Google sends `?secret=<clientToken>`
 *          and expects the partner to echo it back. We compare constant-time
 *          against `GBP_WEBHOOK_SECRET`. 404 when not configured.
 *
 *   POST — inbound message events. We:
 *     1. **Env-gate.** No `GBP_WEBHOOK_SECRET` → 200 `{skipped:"gbp_not_configured"}`
 *        with NO ingest (never a live-path side effect in default code).
 *     2. **Verify the `clientToken`** in the body (constant-time). Fail CLOSED
 *        (401) when the secret IS configured.
 *     3. **Idempotent** on the GBP `messageId` (replayed delivery → no-op).
 *     4. **Resolve the org** from the GBP agent / brand id → `Connection`. No
 *        connection → 200 `{skipped:"no_connection"}`.
 *     5. Normalise → `ingestInbound` (channel:"gbp_qa").
 *
 * Always 200 for delivered-but-skipped so Google doesn't retry-storm.
 * NB: GBP *reviews* are reply-only and are NOT handled here — only Business
 * *Messages* flow through this webhook.
 */

export function GET(req: NextRequest) {
  const secret = process.env.GBP_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse("not_found", { status: 404 });
  }
  // Google's webhook integrity check sends the configured clientToken and expects
  // it echoed. Accept it under either of the documented param names.
  const provided =
    req.nextUrl.searchParams.get("secret") ?? req.nextUrl.searchParams.get("clientToken");
  if (provided && safeEqualStr(provided, secret)) {
    return new NextResponse(provided, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const secret = process.env.GBP_WEBHOOK_SECRET;
  // Env-gate: not configured → graceful no-op, NO ingest.
  if (!secret) {
    if (isProductionRuntime()) {
      logger.warn({ event: "webhook.gbp.not_configured" });
    }
    return NextResponse.json({ ok: true, skipped: "gbp_not_configured" });
  }

  let payload: GbpWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Verify the clientToken Google embeds in every delivery (fail closed).
  const token = payload.clientToken ?? "";
  if (!token || !safeEqualStr(token, secret)) {
    logger.warn({ event: "webhook.gbp.bad_token" });
    return NextResponse.json({ error: "bad_token" }, { status: 401 });
  }

  const normalized = normalizeGbpMessage(payload);
  if (!normalized) {
    // Non-message events (typing, receipts, suggestion taps) → ACK no-op.
    return NextResponse.json({ ok: true, skipped: "non_message" });
  }

  // Resolve org from the GBP agent/brand id.
  const agentId = gbpAgentId(payload);
  const orgId = await resolveOrgForGbp(agentId);
  if (!orgId) {
    return NextResponse.json({ ok: true, skipped: "no_connection" });
  }

  let result: Awaited<ReturnType<typeof ingestInbound>> | undefined;
  const idem = await handleIdempotent("gbp", normalized.externalId, rawBody, async () => {
    result = await ingestInbound(orgId, normalized);
  });

  return NextResponse.json({
    ok: true,
    idempotent: idem === "replay",
    ...(result ? { messageInserted: result.messageInserted ?? false } : {}),
  });
}

// ===========================================================================
// Org resolution
// ===========================================================================

/**
 * Resolve the org for a GBP agent/brand id. When GBP is wired via the
 * connections layer, a `Connection` carries the agent id in `externalId`.
 * Cross-tenant lookup (webhook has no session). Fail-soft: DB error → null.
 *
 * `provider` is matched permissively across the names GBP could be stored under
 * ("gbp" | "google_business" | "google_business_messages") so this keeps working
 * regardless of how Step-14/15 ultimately labels the connection.
 */
async function resolveOrgForGbp(agentId: string | null): Promise<string | null> {
  if (!agentId) return null;
  try {
    const conn = await prisma.connection.findFirst({
      where: {
        provider: { in: ["gbp", "google_business", "google_business_messages"] },
        status: "active",
        externalId: agentId,
      },
      select: { organizationId: true },
    });
    return conn?.organizationId ?? null;
  } catch (err) {
    logger.warn({
      event: "webhook.gbp.connection_lookup_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ===========================================================================
// Normalisation (inline adapter — additive, self-contained)
// ===========================================================================

function normalizeGbpMessage(payload: GbpWebhookPayload): InboundNormalized | null {
  const msg = payload.message;
  const conversationId = payload.conversationId;
  if (!msg || !conversationId) return null;
  const externalId = msg.messageId ?? msg.name;
  const text = msg.text;
  if (!externalId || typeof text !== "string" || text.length === 0) return null;

  const senderName = payload.context?.userInfo?.displayName ?? null;

  return {
    channel: "gbp_qa",
    externalThreadId: conversationId,
    externalId,
    body: text,
    direction: "inbound",
    sentAt: msg.createTime ? new Date(msg.createTime) : new Date(),
    participant: {
      externalId: conversationId,
      name: senderName,
    },
    subject: payload.context?.entryPoint ?? null,
  };
}

/** The brand/agent identifier Google includes for routing. */
function gbpAgentId(payload: GbpWebhookPayload): string | null {
  return payload.agent ?? payload.context?.placeId ?? null;
}

// ===========================================================================
// Helpers
// ===========================================================================

function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

// ===========================================================================
// Payload shapes (a relevant subset of the Business Messages schema)
// ===========================================================================

interface GbpWebhookPayload {
  /** The partner-configured token Google echoes on every delivery. */
  clientToken?: string;
  /** Brand/agent resource name used to route to the right business. */
  agent?: string;
  conversationId?: string;
  message?: {
    name?: string;
    messageId?: string;
    text?: string;
    createTime?: string;
  };
  context?: {
    entryPoint?: string;
    placeId?: string;
    userInfo?: { displayName?: string };
  };
}
