import { createHmac, timingSafeEqual } from "node:crypto";
import { ingestInboundEmail } from "@/lib/inbound-email/route-and-ingest";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/resend-inbound
 *
 * Receives Airbnb (and later Booking.com) review notification emails that
 * a host has forwarded to `reviews-<orgSlug>@inbound.repulabs.com`. Resend's
 * inbound parsing service POSTs the parsed email payload here.
 *
 * Trust model. The internet can hit this endpoint. We defend against forgery
 * three ways:
 *   1. **HMAC signature verification** — Resend signs every webhook with
 *      `RESEND_INBOUND_WEBHOOK_SECRET`. We recompute the HMAC over the raw
 *      body and constant-time-compare against the `Resend-Signature` header.
 *      Reject with 401 if it doesn't match. This is the primary defense.
 *   2. **Rate limit per source IP** — even if signature verification fails,
 *      a sustained attack would burn through our rate-limit budget and we'd
 *      stop processing. We use the same `scan_redirect` limiter but with a
 *      `webhook:resend` key.
 *   3. **Replay window** — Resend signs the timestamp too. We reject any
 *      delivery with a `timestamp` older than 5 minutes. Prevents a captured
 *      payload from being replayed weeks later.
 *
 * Failure handling. We return 200 even when our parser fails — the email
 * row is still inserted with `parse_error` set so ops can manually triage.
 * We only return non-2xx for genuinely retriable failures (DB down,
 * signature missing because Resend misconfigured). Returning 5xx to Resend
 * triggers their retry loop, which would just hammer us with the same bad
 * payload forever.
 */

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // Rate-limit before doing any HMAC work — cheap defense against
  // someone trying to brute-force the signature space.
  const rl = await checkRateLimit("widget_bootstrap", `inbound:${ip}`);
  if (!rl.success) {
    return new NextResponse("rate_limited", {
      status: 429,
      headers: { "retry-after": String(rl.retryAfterSeconds) },
    });
  }

  // Read the raw body BEFORE parsing JSON — HMAC verification requires
  // the exact byte sequence Resend signed. JSON.stringify-roundtrip would
  // re-order keys and break the signature.
  const rawBody = await req.text();
  const signature = req.headers.get("resend-signature") ?? req.headers.get("svix-signature") ?? "";
  const timestamp = req.headers.get("resend-timestamp") ?? req.headers.get("svix-timestamp") ?? "";

  const verification = verifyResendSignature({
    rawBody,
    signature,
    timestamp,
    secret: process.env.RESEND_INBOUND_WEBHOOK_SECRET,
  });

  if (!verification.ok) {
    logger.warn(
      { ip, reason: verification.reason, event: "inbound.webhook.signature_invalid" },
      "rejected inbound email webhook",
    );
    // Return 401 — Resend interprets this as "stop retrying, this delivery
    // is dead." 5xx would loop forever.
    return new NextResponse(verification.reason, { status: 401 });
  }

  let payload: ResendInboundPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("invalid_json", { status: 400 });
  }

  const parsed = normalizeResendPayload(payload);
  if (!parsed) {
    // Resend's `event` types include things like "email.sent" (outbound
    // tracking) — those legitimately hit this endpoint if the webhook is
    // misconfigured. ACK with 200 and a log so we don't retry pointlessly.
    logger.info(
      { event: "inbound.webhook.non_inbound_event", type: payload.type },
      "ignored non-inbound event on resend-inbound webhook",
    );
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const result = await ingestInboundEmail(parsed);
    return NextResponse.json({
      ok: true,
      status: result.status,
      reviewId: result.reviewId,
      inboundEmailId: result.inboundEmailId,
    });
  } catch (err) {
    // Genuinely-retriable failure (DB down, transaction conflict). Return
    // 503 so Resend retries with backoff. We do NOT return 500 because
    // that's our "stop retrying" signal — and a DB outage is retriable.
    logger.error(
      {
        err: err instanceof Error ? err.message : String(err),
        event: "inbound.webhook.ingest_failed",
      },
      "inbound ingest threw",
    );
    return new NextResponse("ingest_failed", { status: 503 });
  }
}

// =========================================================================
// Signature verification
// =========================================================================

type Verification =
  | { ok: true }
  | { ok: false; reason: "no_secret" | "no_signature" | "timestamp_too_old" | "bad_signature" };

function verifyResendSignature(args: {
  rawBody: string;
  signature: string;
  timestamp: string;
  secret: string | undefined;
}): Verification {
  if (!args.secret) {
    // Treat a missing secret as a hard failure. Better to lose inbound
    // deliveries than to accept un-verified webhooks silently.
    return { ok: false, reason: "no_secret" };
  }
  if (!args.signature || !args.timestamp) {
    return { ok: false, reason: "no_signature" };
  }

  // Replay window — reject anything older than 5 minutes.
  const tsMs = Number(args.timestamp) * 1000;
  if (Number.isFinite(tsMs)) {
    const skew = Math.abs(Date.now() - tsMs);
    if (skew > MAX_CLOCK_SKEW_MS) {
      return { ok: false, reason: "timestamp_too_old" };
    }
  } else {
    return { ok: false, reason: "timestamp_too_old" };
  }

  // Resend uses an HMAC-SHA256 over `<timestamp>.<rawBody>`. The header
  // format is `t=<unix>,v1=<hex>` — we accept either the bare hex or the
  // structured form (Svix/StandardWebhooks style).
  const expected = createHmac("sha256", args.secret)
    .update(`${args.timestamp}.${args.rawBody}`)
    .digest("hex");

  const provided = extractSignatureHex(args.signature);
  if (!provided) return { ok: false, reason: "bad_signature" };

  const ok = constantTimeEqualHex(expected, provided);
  return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
}

function extractSignatureHex(header: string): string | null {
  // Structured form: `t=...,v1=<hex>` — pick the v1.
  const v1 = header.split(",").find((p) => p.trim().startsWith("v1="));
  if (v1) {
    const hex = v1.split("=")[1]?.trim();
    return /^[0-9a-f]{64}$/i.test(hex ?? "") ? (hex ?? null) : null;
  }
  // Bare hex.
  return /^[0-9a-f]{64}$/i.test(header.trim()) ? header.trim() : null;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// =========================================================================
// Resend payload shapes
// =========================================================================

interface ResendInboundPayload {
  type?: string;
  // Resend documents `email.received` for inbound parsing. Fields below
  // are what Resend sends — a subset relevant to us.
  data?: {
    message_id?: string;
    from?: { email?: string; name?: string };
    to?: Array<{ email?: string; name?: string }>;
    subject?: string;
    html?: string | null;
    text?: string | null;
    date?: string; // RFC 2822
  };
}

function normalizeResendPayload(
  payload: ResendInboundPayload,
): Parameters<typeof ingestInboundEmail>[0] | null {
  if (payload.type && !payload.type.startsWith("email.received")) {
    return null;
  }
  const d = payload.data;
  if (!d || !d.from || !d.from.email || !d.to || d.to.length === 0) {
    return null;
  }
  const to = d.to[0]?.email;
  if (!to) return null;

  const receivedAt = d.date ? new Date(d.date) : new Date();
  return {
    providerMessageId: d.message_id ?? null,
    from: d.from.email,
    to,
    subject: d.subject ?? "",
    htmlBody: d.html ?? null,
    textBody: d.text ?? null,
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
  };
}
