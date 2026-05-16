import type { NextRequest } from "next/server";
import { verifyTwilioSignature } from "@/lib/outreach/twilio";
import { logger } from "@/lib/logger";

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
export async function parseAndVerifyTwilio(req: NextRequest): Promise<
  | { ok: true; params: Record<string, string>; formData: FormData }
  | { ok: false; reason: string }
> {
  // Twilio sends application/x-www-form-urlencoded
  const formData = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") params[k] = v;
  }

  // No env → dev mode; let it through. The Twilio API client won't work
  // without TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN, so this is harmless in dev.
  if (!process.env.TWILIO_AUTH_TOKEN) {
    return { ok: true, params, formData };
  }

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    logger.warn({ event: "twilio.verify.missing_signature", url: req.url });
    return { ok: false, reason: "missing_signature" };
  }

  // Twilio computes the signature over the FULL URL it dialed.
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? new URL(req.url).host;
  const fullUrl = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`;

  const valid = await verifyTwilioSignature({ url: fullUrl, params, signature });
  if (!valid) {
    logger.warn({ event: "twilio.verify.signature_mismatch", url: fullUrl });
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true, params, formData };
}
