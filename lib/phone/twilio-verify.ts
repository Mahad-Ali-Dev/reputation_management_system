import { logger } from "@/lib/logger";
import { verifyTwilioSignature } from "@/lib/outreach/twilio";
import { isProductionRuntime } from "@/lib/secrets";
import type { NextRequest } from "next/server";

/**
 * Parse Twilio's form-encoded body AND verify the X-Twilio-Signature header
 * in a single pass.
 *
 * Returns `{ ok: false }` if:
 *   - TWILIO_AUTH_TOKEN is set AND signature header is missing
 *   - TWILIO_AUTH_TOKEN is set AND HMAC doesn't match
 *
 * Dev mode (no env): allows the request through, since the handler can't
 * functionally do anything without a Twilio account anyway.
 *
 * The verification is INDEPENDENT of NODE_ENV — once you set
 * TWILIO_AUTH_TOKEN in any environment, signatures are enforced.
 */
export async function parseAndVerifyTwilio(
  req: NextRequest,
): Promise<
  { ok: true; params: Record<string, string>; formData: FormData } | { ok: false; reason: string }
> {
  // Twilio sends application/x-www-form-urlencoded
  const formData = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") params[k] = v;
  }

  // No token configured. In production this is a misconfiguration and we MUST
  // fail closed — otherwise every voice endpoint accepts arbitrary unsigned
  // POSTs (fake call turns, AI/TTS cost amplification, forged statuses). Only a
  // pure-dev box may skip the check (the Twilio client won't work without creds
  // there anyway).
  if (!process.env.TWILIO_AUTH_TOKEN) {
    if (isProductionRuntime()) {
      logger.error({ event: "twilio.verify.token_missing_in_prod", url: req.url });
      return { ok: false, reason: "twilio_token_missing_in_prod" };
    }
    return { ok: true, params, formData };
  }

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    logger.warn({ event: "twilio.verify.missing_signature", url: req.url });
    return { ok: false, reason: "missing_signature" };
  }

  // Twilio computes the signature over the FULL public URL it dialed. Behind
  // Nginx the bare Host header is the internal bind host, so prefer the
  // forwarded host (same convention as the middleware redirect/rewrite fixes).
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  const fullUrl = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const valid = await verifyTwilioSignature({ url: fullUrl, params, signature });
  if (!valid) {
    logger.warn({ event: "twilio.verify.signature_mismatch", url: fullUrl });
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true, params, formData };
}
