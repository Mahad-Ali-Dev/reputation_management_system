import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { recordUnsubscribe } from "@/lib/outreach/suppression";
import { handleIdempotent } from "@/lib/webhooks/idempotency";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/resend
 *
 * Resend email-event webhook → advances the EMAIL half of Sent-History statuses
 * (the SMS half already works via the Twilio webhook). Events:
 *   email.delivered  → status:"delivered" + deliveredAt
 *   email.opened     → status:"opened"    + openedAt
 *   email.clicked    → status:"clicked"   + clickedAt
 *   email.bounced    → status:"bounced"   + error  (+ unsubscribe)
 *   email.complained → status:"bounced"   + error  (+ unsubscribe)
 *
 * Trust + guardrails (env-gated):
 *   - HMAC verify (Svix / StandardWebhooks style) with `RESEND_WEBHOOK_SECRET`,
 *     constant-time, with a 5-minute replay window. Mirrors the verify approach
 *     in `resend-inbound/route.ts`.
 *   - No-op with 200 when the secret is UNSET (graceful — not exposed by default).
 *   - Maps events to a `ReviewRequest` by `providerMessageId` (the Resend message
 *     id stored at send). Idempotent on the event id.
 *   - bounced/complained → `recordUnsubscribe({ source:"api" })` (verifier fix #5).
 */

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  // No secret configured → graceful no-op so production isn't exposed and dev
  // doesn't need it. (Mirrors the env-gated-off default the spec asks for.)
  if (!secret) {
    return NextResponse.json({ ok: true, skipped: "resend_webhook_not_configured" });
  }

  const signature =
    req.headers.get("resend-signature") ??
    req.headers.get("svix-signature") ??
    req.headers.get("webhook-signature") ??
    "";
  const timestamp =
    req.headers.get("resend-timestamp") ??
    req.headers.get("svix-timestamp") ??
    req.headers.get("webhook-timestamp") ??
    "";
  const svixId =
    req.headers.get("svix-id") ?? req.headers.get("webhook-id") ?? "";

  const verified = verifyResendSignature({ rawBody, signature, timestamp, secret, svixId });
  if (!verified.ok) {
    logger.warn({ event: "webhook.resend.signature_invalid", reason: verified.reason });
    // 401 → Resend stops retrying this dead delivery (5xx would loop forever).
    return NextResponse.json({ error: verified.reason }, { status: 401 });
  }

  let payload: ResendEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const type = payload.type ?? "";
  if (!type.startsWith("email.")) {
    // Non-email event (or misconfig) — ACK without processing.
    return NextResponse.json({ ok: true, skipped: "non_email_event" });
  }

  const messageId = payload.data?.email_id ?? payload.data?.message_id ?? null;
  if (!messageId) {
    return NextResponse.json({ ok: true, skipped: "no_message_id" });
  }

  // Idempotency key: prefer the Svix id, else type+messageId+timestamp.
  const eventId = svixId || `${type}:${messageId}:${timestamp}`;

  const idem = await handleIdempotent("resend", eventId, rawBody, async () => {
    await applyEmailEvent(type, messageId);
  });

  return NextResponse.json({ ok: true, idempotent: idem === "replay" });
}

/** Update the matching ReviewRequest (by providerMessageId) for the event. */
async function applyEmailEvent(type: string, messageId: string): Promise<void> {
  const now = new Date();

  const update: {
    status?: string;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    error?: string;
  } = {};
  let suppress = false;

  switch (type) {
    case "email.delivered":
      update.status = "delivered";
      update.deliveredAt = now;
      break;
    case "email.opened":
      update.status = "opened";
      update.openedAt = now;
      break;
    case "email.clicked":
      update.status = "clicked";
      update.clickedAt = now;
      break;
    case "email.bounced":
      update.status = "bounced";
      update.error = "bounced";
      suppress = true;
      break;
    case "email.complained":
      update.status = "bounced";
      update.error = "complained";
      suppress = true;
      break;
    default:
      // email.sent / email.delivery_delayed etc. — ignore.
      return;
  }

  // Cross-tenant lookup (webhook has no session). Find the row so we know its
  // org for the suppression write.
  const rows = await prisma.reviewRequest.findMany({
    where: { providerMessageId: messageId },
    select: { id: true, organizationId: true, recipient: true },
    take: 5,
  });
  if (rows.length === 0) {
    logger.info({ event: "webhook.resend.no_match", messageId, type });
    return;
  }

  await prisma.reviewRequest.updateMany({
    where: { providerMessageId: messageId },
    data: update,
  });

  if (suppress) {
    for (const r of rows) {
      // verifier fix #5: bounce/complaint suppression uses source:"api".
      await recordUnsubscribe({
        channel: "email",
        recipient: r.recipient,
        organizationId: r.organizationId,
        source: "api",
      });
    }
  }

  logger.info({ event: "webhook.resend.applied", type, messageId, matched: rows.length });
}

type ResendEvent = {
  type?: string;
  data?: {
    email_id?: string;
    message_id?: string;
    to?: string[];
  };
};

type Verification =
  | { ok: true }
  | { ok: false; reason: "no_signature" | "timestamp_too_old" | "bad_signature" };

/**
 * Verify a Resend/Svix webhook signature.
 *
 * Svix signs `${id}.${timestamp}.${rawBody}` with the base64 secret (often
 * prefixed `whsec_`), producing a base64 HMAC in a space-separated `v1,<b64>`
 * header. We ALSO accept the simpler `${timestamp}.${rawBody}` hex form (the
 * shape `resend-inbound` already verifies) for forward-compat.
 */
function verifyResendSignature(args: {
  rawBody: string;
  signature: string;
  timestamp: string;
  secret: string;
  svixId: string;
}): Verification {
  if (!args.signature || !args.timestamp) return { ok: false, reason: "no_signature" };

  // Replay window.
  const tsMs = Number(args.timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, reason: "timestamp_too_old" };
  }

  // Candidate 1: Svix base64 scheme over `${id}.${ts}.${body}`.
  const secretBytes = args.secret.startsWith("whsec_")
    ? Buffer.from(args.secret.slice(6), "base64")
    : Buffer.from(args.secret);
  const svixSigned = `${args.svixId}.${args.timestamp}.${args.rawBody}`;
  const svixExpectedB64 = createHmac("sha256", secretBytes).update(svixSigned).digest("base64");

  // Candidate 2: hex HMAC over `${ts}.${body}` (resend-inbound style).
  const hexExpected = createHmac("sha256", args.secret)
    .update(`${args.timestamp}.${args.rawBody}`)
    .digest("hex");

  // The header may contain multiple space-separated `v1,<sig>` pairs.
  const provided = args.signature.split(" ").map((p) => p.includes(",") ? p.split(",")[1] ?? "" : p);
  for (const sig of provided) {
    const s = sig.trim();
    if (!s) continue;
    if (constantTimeEqual(s, svixExpectedB64)) return { ok: true };
    if (/^[0-9a-f]{64}$/i.test(s) && constantTimeEqual(s, hexExpected)) return { ok: true };
  }
  return { ok: false, reason: "bad_signature" };
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
