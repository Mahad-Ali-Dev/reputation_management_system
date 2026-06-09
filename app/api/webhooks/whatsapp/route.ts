import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { ingestInbound } from "@/lib/inbox/ingest";
import {
  type WhatsAppWebhookPayload,
  parseWhatsAppPayload,
  whatsappDeliveryId,
} from "@/lib/inbox/whatsapp-parse";
import { logger } from "@/lib/logger";
import { isProductionRuntime } from "@/lib/secrets";
import { handleIdempotent } from "@/lib/webhooks/idempotency";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * WhatsApp Business (Cloud API) webhook — a first-class Unified-Inbox channel.
 *
 * Mirrors the Meta (Facebook/Instagram) webhook exactly — same Meta app secret,
 * same `X-Hub-Signature-256` HMAC, same env-gate + fail-soft + idempotency:
 *
 *   GET  — Meta's subscription verification handshake. Echoes `hub.challenge`
 *          when `hub.mode=subscribe` and `hub.verify_token` matches our
 *          `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (falls back to the shared
 *          `META_WEBHOOK_VERIFY_TOKEN`). 403 on mismatch; 404 when unconfigured.
 *
 *   POST — Inbound events. We:
 *     1. Read the RAW body (required for the HMAC).
 *     2. **Env-gate.** No app secret → 200 `{skipped:"whatsapp_not_configured"}`
 *        with NO ingest (no live-path side effects before configuration).
 *     3. **Verify `X-Hub-Signature-256`** — constant-time HMAC-SHA256 of the raw
 *        body with the Meta app secret. Fail CLOSED (401) when configured.
 *     4. **Idempotent** on the first `wamid` (replayed delivery → no-op).
 *     5. For each `entry[].changes[].value`: resolve the org from
 *        `metadata.phone_number_id` (stored on the WhatsApp `Connection.externalId`
 *        at connect time — exactly how the Meta webhook maps page-id → org), then
 *        ingest each `messages[]` on channel `"whatsapp"` (text from
 *        `text.body`; non-text types become a `[image]`-style placeholder).
 *
 * Always 200 for delivered-but-skipped so Meta doesn't retry-storm. The pure
 * payload → normalised-message mapping lives in `lib/inbox/whatsapp-parse.ts`.
 */

/** App secret: a dedicated WhatsApp secret, else the shared Meta app secret. */
function whatsappAppSecret(): string | undefined {
  return process.env.WHATSAPP_WEBHOOK_SECRET || process.env.META_WEBHOOK_SECRET || undefined;
}

/** Verify token: dedicated WhatsApp token, else the shared Meta verify token. */
function whatsappVerifyToken(): string | undefined {
  return (
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || undefined
  );
}

export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const verifyToken = whatsappVerifyToken();
  // Not configured → don't reveal the endpoint exists/behaves.
  if (!verifyToken) {
    return new NextResponse("not_found", { status: 404 });
  }
  if (mode === "subscribe" && token && challenge && safeEqualStr(token, verifyToken)) {
    // Meta requires the bare challenge string echoed back with 200.
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const secret = whatsappAppSecret();
  // Env-gate: not configured → graceful no-op, NO ingest (proves no side effects).
  if (!secret) {
    if (isProductionRuntime()) {
      logger.warn({ event: "webhook.whatsapp.not_configured" });
    }
    return NextResponse.json({ ok: true, skipped: "whatsapp_not_configured" });
  }

  // Verify X-Hub-Signature-256 (fail closed — the app IS configured).
  const sigHeader =
    req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256");
  if (!sigHeader || !verifyMetaSignature(rawBody, sigHeader, secret)) {
    logger.warn({ event: "webhook.whatsapp.bad_signature" });
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const deliveryId = whatsappDeliveryId(payload, rawBody);

  let summary: { messages: number; skipped?: string } = { messages: 0 };

  const idem = await handleIdempotent("whatsapp", deliveryId, rawBody, async () => {
    summary = await processWhatsAppPayload(payload);
  });

  return NextResponse.json({
    ok: true,
    idempotent: idem === "replay",
    ...(idem === "replay" ? {} : summary),
  });
}

// ===========================================================================
// Processing — resolve org per phone_number_id, ingest each message
// ===========================================================================

async function processWhatsAppPayload(
  payload: WhatsAppWebhookPayload,
): Promise<{ messages: number; skipped?: string }> {
  const parsed = parseWhatsAppPayload(payload);
  if (parsed.length === 0) return { messages: 0, skipped: "no_messages" };

  // Cache org lookups per phone_number_id (a delivery can batch many messages
  // on the same business number).
  const orgByPnid = new Map<string, string | null>();
  let messages = 0;

  for (const { phoneNumberId, message } of parsed) {
    let orgId = orgByPnid.get(phoneNumberId);
    if (orgId === undefined) {
      orgId = await resolveOrgForWhatsApp(phoneNumberId);
      orgByPnid.set(phoneNumberId, orgId);
    }
    if (!orgId) continue; // no connection for this business number → skip silently

    const res = await ingestInbound(orgId, message);
    if (res.ok && res.messageInserted) messages++;
  }

  return { messages };
}

/**
 * Resolve the org for a WhatsApp `phone_number_id`. The connect flow persists a
 * `Connection(provider:"whatsapp")` with `externalId` = the business phone number
 * id — mirroring how the Meta webhook resolves a page id via `externalId`. We
 * reuse the existing `externalId` slot rather than adding schema. Cross-tenant
 * lookup (a webhook has no session). Fail-soft: any DB error → null (skip).
 */
async function resolveOrgForWhatsApp(phoneNumberId: string): Promise<string | null> {
  if (!phoneNumberId) return null;
  try {
    const conn = await prisma.connection.findFirst({
      where: { provider: "whatsapp", status: "active", externalId: phoneNumberId },
      select: { organizationId: true },
    });
    return conn?.organizationId ?? null;
  } catch (err) {
    logger.warn({
      event: "webhook.whatsapp.connection_lookup_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ===========================================================================
// Signature verification (identical to the Meta webhook — Meta app secret)
// ===========================================================================

/**
 * Constant-time verify of Meta's `X-Hub-Signature-256: sha256=<hex>` over the
 * raw request body using the app secret. Returns false on any malformed input.
 */
function verifyMetaSignature(rawBody: string, header: string, secret: string): boolean {
  const provided = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Constant-time string compare for the verify-token handshake. */
function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
