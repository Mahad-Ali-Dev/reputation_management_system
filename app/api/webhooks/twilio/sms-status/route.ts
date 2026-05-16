import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { recordUnsubscribe } from "@/lib/outreach/suppression";
import { verifyTwilioSignature } from "@/lib/outreach/twilio";
import { handleIdempotent } from "@/lib/webhooks/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/sms-status
 *
 * Twilio sends two kinds of events to this URL:
 *   - Outbound status: MessageStatus = queued | sent | delivered | failed | undelivered
 *   - Inbound messages: From = customer phone, Body = their reply (e.g., "STOP")
 *
 * We use the same URL for both — distinguished by whether MessageStatus or Body is present.
 *
 * STOP keyword (or HELP, UNSUBSCRIBE, CANCEL, QUIT, END) → record unsubscribe.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  // The URL Twilio signed is the public URL we configured. For local dev with stripe listen / ngrok,
  // this would be the ngrok URL. For now we accept the request URL itself.
  const url = `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`;
  const verified = await verifyTwilioSignature({ url, params, signature });
  // Fail-closed whenever Twilio is configured (any env). Only skip in pure
  // dev when TWILIO_AUTH_TOKEN is absent.
  if (!verified && process.env.TWILIO_AUTH_TOKEN) {
    logger.warn({ event: "webhook.twilio.bad_signature", url });
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  // Idempotency key: MessageSid OR (smsMessageSid for inbound)
  const messageSid = params.MessageSid ?? params.SmsMessageSid;
  if (!messageSid) {
    return NextResponse.json({ error: "missing_message_sid" }, { status: 400 });
  }

  const result = await handleIdempotent("twilio", messageSid, rawBody, async () => {
    await processTwilioEvent(params);
  });

  return NextResponse.json({ received: true, idempotent: result === "replay" });
}

const STOP_KEYWORDS = /^(stop|stopall|unsubscribe|cancel|end|quit)$/i;

async function processTwilioEvent(params: Record<string, string>) {
  // Inbound message (customer replying to us)
  if (params.Body && params.From) {
    const body = params.Body.trim();
    const from = params.From;

    if (STOP_KEYWORDS.test(body)) {
      // Find which org this number belongs to (look up via review_requests)
      const recent = await prisma.reviewRequest.findFirst({
        where: { recipient: from, channel: "sms" },
        orderBy: { createdAt: "desc" },
        select: { organizationId: true },
      });
      if (!recent?.organizationId) {
        logger.warn({ from, event: "sms.stop_orphan" }, "STOP received but no org context");
        return;
      }
      const orgId = recent.organizationId;
      await recordUnsubscribe({
        channel: "sms",
        recipient: from,
        organizationId: orgId,
        source: "sms_stop",
      });
      // Mark recent queued/sent review requests as unsubscribed
      await prisma.reviewRequest.updateMany({
        where: {
          recipient: from,
          channel: "sms",
          status: { in: ["queued", "sent"] },
          organizationId: orgId,
        },
        data: { status: "unsubscribed" },
      });
      logger.info({ from, orgId, event: "sms.unsubscribed" }, "SMS STOP received");
    }
    return;
  }

  // Outbound status update
  if (params.MessageStatus && params.MessageSid) {
    const status = params.MessageStatus;
    const map: Record<string, string> = {
      queued: "queued",
      sent: "sent",
      delivered: "delivered",
      failed: "failed",
      undelivered: "failed",
    };
    const ourStatus = map[status];
    if (!ourStatus) return;

    const update: {
      status: string;
      deliveredAt?: Date;
      sentAt?: Date;
      error?: string;
    } = { status: ourStatus };
    if (status === "delivered") update.deliveredAt = new Date();
    if (status === "sent") update.sentAt = new Date();
    if (status === "failed" || status === "undelivered") {
      update.error = params.ErrorCode ?? "twilio_failed";
    }

    await prisma.reviewRequest.updateMany({
      where: { providerMessageId: params.MessageSid },
      data: update,
    });
    logger.info(
      { messageSid: params.MessageSid, status, event: "sms.status_updated" },
      "twilio status update",
    );
  }
}
