import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";
import {
  type InboundNormalized,
  type NormalizedComment,
  ingestComment,
  ingestInbound,
} from "@/lib/inbox/ingest";
import { logger } from "@/lib/logger";
import { isProductionRuntime } from "@/lib/secrets";
import { handleIdempotent } from "@/lib/webhooks/idempotency";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta (Facebook Messenger + Instagram) webhook.
 *
 *   GET  — Meta's subscription verification handshake. Echoes `hub.challenge`
 *          when `hub.mode=subscribe` and `hub.verify_token` matches our
 *          `META_WEBHOOK_VERIFY_TOKEN`. Returns 403 otherwise. When no verify
 *          token is configured, 404 (the integration isn't enabled).
 *
 *   POST — Inbound events. We:
 *     1. Read the RAW body (required for the HMAC).
 *     2. **Env-gate.** No `META_WEBHOOK_SECRET` → 200 `{skipped:"meta_not_configured"}`
 *        with NO ingest. Per guardrail: the endpoint must never expose behaviour
 *        before it's configured, and must never make live-path side effects in
 *        default code paths.
 *     3. **Verify `X-Hub-Signature-256`** — constant-time HMAC-SHA256 (hex,
 *        `sha256=` prefixed) of the raw body with the app secret. Fail CLOSED
 *        (401) when the secret IS configured.
 *     4. **Idempotent** on a per-event id (replayed delivery → no-op).
 *     5. **Resolve the org** from the page / IG-business id → `Connection`
 *        (provider:"meta"). No connection → 200 `{skipped:"no_connection"}`.
 *     6. Normalise → `ingestInbound` (DMs) / `ingestComment` (comments).
 *
 * Always 200 for delivered-but-skipped so Meta doesn't retry-storm.
 * Rides on Step-15 Meta OAuth (`Connection(provider:"meta")`). Until that lands
 * for a given org, the resolve no-ops.
 */

export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
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

  const secret = process.env.META_WEBHOOK_SECRET;
  // Env-gate: not configured → graceful no-op, NO ingest (proves no side effects).
  if (!secret) {
    if (isProductionRuntime()) {
      logger.warn({ event: "webhook.meta.not_configured" });
    }
    return NextResponse.json({ ok: true, skipped: "meta_not_configured" });
  }

  // Verify X-Hub-Signature-256 (fail closed — the app IS configured).
  const sigHeader =
    req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256");
  if (!sigHeader || !verifyMetaSignature(rawBody, sigHeader, secret)) {
    logger.warn({ event: "webhook.meta.bad_signature" });
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // A single delivery can carry multiple entries (pages / IG accounts). Use the
  // top-level delivery fingerprint for idempotency so a full replay is a no-op;
  // per-message idempotency is additionally enforced inside ingest.
  const deliveryId = metaDeliveryId(payload, rawBody);

  let summary: { messages: number; comments: number; skipped?: string } = {
    messages: 0,
    comments: 0,
  };

  const idem = await handleIdempotent("meta", deliveryId, rawBody, async () => {
    summary = await processMetaPayload(payload);
  });

  return NextResponse.json({
    ok: true,
    idempotent: idem === "replay",
    ...(idem === "replay" ? {} : summary),
  });
}

// ===========================================================================
// Processing — resolve org per entry, normalise, ingest
// ===========================================================================

async function processMetaPayload(
  payload: MetaWebhookPayload,
): Promise<{ messages: number; comments: number; skipped?: string }> {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  if (entries.length === 0) return { messages: 0, comments: 0, skipped: "no_entry" };

  // `payload.object` distinguishes the product: "page" (FB Messenger/comments)
  // vs "instagram" (IG DMs/comments). Default channel mapping derives from it.
  const isInstagram = payload.object === "instagram";

  let messages = 0;
  let comments = 0;

  for (const entry of entries) {
    // The recipient/business id that received the event — the key we resolve the
    // org by. For FB pages it's the page id; for IG it's the IG business id.
    const businessId = String(entry.id ?? "");
    const orgId = await resolveOrgForMeta(businessId);
    if (!orgId) continue; // no connection for this page/IG account → skip silently

    // --- DMs (Messenger / IG direct) ---
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const m of messaging) {
      const normalized = normalizeMetaMessage(m, isInstagram, businessId);
      if (!normalized) continue;
      const res = await ingestInbound(orgId, normalized);
      if (res.ok && res.messageInserted) messages++;
    }

    // --- Comments (feed changes) ---
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const c of changes) {
      const normalized = normalizeMetaComment(c, isInstagram);
      if (!normalized) continue;
      const res = await ingestComment(orgId, normalized);
      if (res.ok && res.commentInserted) comments++;
    }
  }

  return { messages, comments };
}

/**
 * Resolve the org for a Meta page / IG-business id. The Meta OAuth (Step 15)
 * persists a single `Connection(provider:"meta")` with `externalId` = the FB
 * page id; the linked IG business id is stored in the account label/metadata, so
 * we match `externalId` first and fall back to a metadata probe. Cross-tenant
 * lookup (a webhook has no session). Fail-soft: any DB error → null (skip).
 */
async function resolveOrgForMeta(businessId: string): Promise<string | null> {
  if (!businessId) return null;
  try {
    const conn = await prisma.connection.findFirst({
      where: { provider: "meta", status: "active", externalId: businessId },
      select: { organizationId: true },
    });
    return conn?.organizationId ?? null;
  } catch (err) {
    logger.warn({
      event: "webhook.meta.connection_lookup_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ===========================================================================
// Normalisation (inline adapter — additive, self-contained)
// ===========================================================================

function normalizeMetaMessage(
  m: MetaMessaging,
  isInstagram: boolean,
  businessId: string,
): InboundNormalized | null {
  const text = m.message?.text;
  // Skip echoes (messages WE sent, reflected back), reactions, read receipts,
  // and anything without a stable message id or body.
  if (m.message?.is_echo) return null;
  const externalId = m.message?.mid;
  if (!externalId || typeof text !== "string" || text.length === 0) return null;

  const senderId = m.sender?.id ?? null;
  // Thread = the conversation with this sender on this business account.
  const externalThreadId = senderId ? `${businessId}:${senderId}` : externalId;

  const attachments =
    Array.isArray(m.message?.attachments) && m.message.attachments.length > 0
      ? m.message.attachments
      : undefined;

  return {
    channel: isInstagram ? "instagram_dm" : "facebook_msg",
    externalThreadId,
    externalId,
    body: text,
    direction: "inbound",
    sentAt: m.timestamp ? new Date(m.timestamp) : new Date(),
    attachments,
    participant: senderId ? { externalId: senderId } : null,
  };
}

function normalizeMetaComment(c: MetaChange, isInstagram: boolean): NormalizedComment | null {
  if (c.field !== "feed" && c.field !== "comments") return null;
  const v = c.value;
  if (!v) return null;
  // Only handle actual comment adds (not likes/edits/removes for the MVP).
  if (v.item && v.item !== "comment") return null;
  if (v.verb && v.verb !== "add") return null;
  const externalId = v.comment_id ?? v.id;
  const body = v.message ?? v.text;
  if (!externalId || typeof body !== "string" || body.length === 0) return null;

  return {
    platform: isInstagram ? "instagram" : "facebook",
    externalId,
    externalPostId: v.post_id ?? v.parent_id ?? null,
    body,
    authorName: v.from?.name ?? null,
    authorExternalId: v.from?.id ?? null,
    postedAt: v.created_time
      ? new Date(typeof v.created_time === "number" ? v.created_time * 1000 : v.created_time)
      : new Date(),
  };
}

// ===========================================================================
// Signature verification
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

/**
 * Derive a stable idempotency id for the whole delivery. Prefer the first
 * message/comment id (so retries of the same event collapse); fall back to a
 * sha of the raw body via the idempotency helper's own hashing if absent.
 */
function metaDeliveryId(payload: MetaWebhookPayload, rawBody: string): string {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const e of entries) {
    const mid = e.messaging?.[0]?.message?.mid;
    if (mid) return `mid:${mid}`;
    const cid = e.changes?.[0]?.value?.comment_id ?? e.changes?.[0]?.value?.id;
    if (cid) return `cid:${cid}`;
    if (e.time && e.id) return `evt:${e.id}:${e.time}`;
  }
  // Last resort: a length+prefix marker. The idempotency layer additionally
  // hashes the full raw body, so distinct payloads with no id still differ.
  return `raw:${rawBody.length}:${rawBody.slice(0, 32)}`;
}

// ===========================================================================
// Payload shapes (a relevant subset of the Graph webhook schema)
// ===========================================================================

interface MetaWebhookPayload {
  object?: string; // "page" | "instagram"
  entry?: MetaEntry[];
}

interface MetaEntry {
  id?: string | number;
  time?: number;
  messaging?: MetaMessaging[];
  changes?: MetaChange[];
}

interface MetaMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: unknown[];
  };
}

interface MetaChange {
  field?: string; // "feed" | "comments"
  value?: {
    item?: string; // "comment" | "like" | ...
    verb?: string; // "add" | "edited" | "remove"
    comment_id?: string;
    id?: string;
    post_id?: string;
    parent_id?: string;
    message?: string;
    text?: string;
    created_time?: number | string;
    from?: { id?: string; name?: string };
  };
}
