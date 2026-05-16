/**
 * Twilio REST client wrapper for outbound calling.
 *
 * Uses Basic auth (AccountSID + AuthToken). We don't pull in the full Twilio
 * SDK (~3 MB) — direct HTTP fetch is sufficient for the 2 endpoints we need:
 *   POST /Accounts/{Sid}/Calls.json        — start an outbound call
 *   POST /Accounts/{Sid}/Calls/{Sid}.json  — update a live call (e.g., end it)
 *
 * AccountSID + AuthToken come from process.env at module load.
 */

import { logger } from "@/lib/logger";

// Don't hold a serverless function open if Twilio's REST API hangs. 15 s is
// well above their normal latency (a few hundred ms) while still bailing
// before our Vercel function timeout.
const TWILIO_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TWILIO_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type TwilioConfig = {
  accountSid: string;
  authToken: string;
};

function getConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
}

export function isTwilioConfigured(): boolean {
  return !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
}

/**
 * Initiate an outbound call.
 *
 * Twilio dials `to` from `from`, then POSTs to `webhookUrl` to fetch the
 * initial TwiML. Status callbacks land at `statusCallbackUrl`.
 */
export async function placeOutboundCall(args: {
  to: string;          // E.164
  from: string;        // E.164 (your Twilio number)
  webhookUrl: string;  // returns TwiML when Twilio connects
  statusCallbackUrl?: string;
  record?: boolean;
  machineDetection?: "Enable" | "DetectMessageEnd";
}): Promise<{ callSid: string; status: string }> {
  const config = getConfig();
  if (!config) throw new Error("twilio_not_configured");

  const body = new URLSearchParams({
    To: args.to,
    From: args.from,
    Url: args.webhookUrl,
  });
  if (args.statusCallbackUrl) {
    body.set("StatusCallback", args.statusCallbackUrl);
    body.set("StatusCallbackMethod", "POST");
    body.set("StatusCallbackEvent", "initiated ringing answered completed");
  }
  if (args.record) body.set("Record", "true");
  if (args.machineDetection) body.set("MachineDetection", args.machineDetection);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    logger.error({ event: "twilio.outbound.create_failed", status: res.status, error: err.slice(0, 300) });
    throw new Error(`twilio_outbound_failed_${res.status}`);
  }
  const data = (await res.json()) as { sid?: string; status?: string };
  return {
    callSid: data.sid ?? "",
    status: data.status ?? "queued",
  };
}

/**
 * End an in-progress call.
 */
export async function endCall(callSid: string): Promise<void> {
  const config = getConfig();
  if (!config) return;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls/${callSid}.json`;
  await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      authorization: "Basic " + Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64"),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ Status: "completed" }).toString(),
  });
}
