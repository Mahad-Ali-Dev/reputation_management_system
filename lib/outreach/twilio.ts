/**
 * Twilio SMS sender — wraps the Twilio REST API directly (no SDK to keep deps light).
 *
 * Mandatory: every outbound SMS includes the STOP-instructions footer required by TCPA + CTIA.
 * The first message to a new recipient gets the full disclosure; follow-ups can use the short form.
 *
 * STOP keyword handling: Twilio fires `inbound message` webhook → /api/webhooks/twilio/sms-status
 * which writes to `unsubscribes`.
 */

const TWILIO_API = "https://api.twilio.com/2010-04-01";

export type SmsSendResult =
  | { ok: true; messageSid: string }
  | { ok: false; error: string };

function getCreds() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    throw new Error("Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)");
  }
  return { sid, token, from };
}

/**
 * Send an SMS via Twilio. Returns the MessageSid for tracking.
 * Caller is responsible for TCPA consent check + unsubscribe check BEFORE calling.
 */
export async function sendSms(args: {
  to: string;            // E.164: +1...
  body: string;
  isFirstMessage?: boolean;
}): Promise<SmsSendResult> {
  // Read creds gracefully: an unconfigured Twilio must return {ok:false} like a
  // network failure does, NOT throw. A throw here propagates uncaught through
  // dispatch → enqueue → the send action's catch-all, surfacing the generic
  // "Could not send the request. Try again." instead of a specific reason.
  let sid: string;
  let token: string;
  let from: string;
  try {
    ({ sid, token, from } = getCreds());
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "twilio_not_configured" };
  }

  // Compose body with mandatory STOP footer
  const stopText = args.isFirstMessage
    ? "\n\nReply STOP to unsubscribe. Msg & data rates may apply."
    : "\n\nReply STOP to opt out.";
  const fullBody = args.body + stopText;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({
    To: args.to,
    From: from,
    Body: fullBody,
  });

  // Bound the request — Twilio is normally <1s; if it hangs, don't burn the
  // whole serverless function budget.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${TWILIO_API}/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: params,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const e = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `twilio_fetch_failed: ${e.slice(0, 200)}` };
  }
  clearTimeout(timer);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `twilio_${res.status}: ${text.slice(0, 200)}` };
  }

  const data = (await res.json()) as { sid?: string };
  if (!data.sid) return { ok: false, error: "twilio_no_sid" };
  return { ok: true, messageSid: data.sid };
}

/**
 * Verify a Twilio webhook signature (HMAC-SHA1).
 * See INFRASTRUCTURE.md §5.9.
 *
 * Twilio signs: url + sorted POST params concatenated.
 */
export async function verifyTwilioSignature(args: {
  url: string;
  params: Record<string, string>;
  signature: string;
}): Promise<boolean> {
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const { token } = getCreds();

  // Sort keys, concatenate key+value
  const sorted = Object.keys(args.params)
    .sort()
    .map((k) => `${k}${args.params[k]}`)
    .join("");
  const payload = args.url + sorted;

  const expected = createHmac("sha1", token).update(payload).digest("base64");

  if (expected.length !== args.signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(args.signature));
  } catch {
    return false;
  }
}
