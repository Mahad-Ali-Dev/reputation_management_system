import { type NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { logger } from "@/lib/logger";
import { recordUnsubscribe } from "@/lib/outreach/suppression";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click email unsubscribe (RFC 8058).
 *
 * Format: /u?t=<base64url(orgId|channel|recipient)>&s=<hmac-sha256>
 *
 * Supports both GET (browser click) and POST (Gmail one-click unsubscribe).
 */
async function handle(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  const s = req.nextUrl.searchParams.get("s");
  if (!t || !s) {
    return new NextResponse("Bad request", { status: 400 });
  }

  let payload: string;
  try {
    payload = Buffer.from(t, "base64url").toString("utf8");
  } catch {
    return new NextResponse("Bad token", { status: 400 });
  }

  const secret = process.env.AUTH_SECRET ?? "fallback-secret-do-not-use";
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (expected !== s) {
    return new NextResponse("Bad signature", { status: 400 });
  }

  const [orgId, channel, recipient] = payload.split("|");
  if (!orgId || !channel || !recipient || !["sms", "email"].includes(channel)) {
    return new NextResponse("Bad payload", { status: 400 });
  }

  await recordUnsubscribe({
    channel: channel as "sms" | "email",
    recipient,
    organizationId: orgId,
    source: "one_click_email",
  });

  logger.info({ orgId, channel, recipient, event: "unsubscribe.one_click" });

  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:48px;">
      <h1>Unsubscribed</h1>
      <p>You won't receive ${channel} from this sender anymore.</p>
    </body></html>`,
    { headers: { "content-type": "text/html" } },
  );
}

export const GET = handle;
export const POST = handle;
