import { type NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { recordUnsubscribe } from "@/lib/outreach/suppression";
import { verifyTwilioSignature } from "@/lib/outreach/twilio";
import { isProductionRuntime } from "@/lib/secrets";
import { handleIdempotent } from "@/lib/webhooks/idempotency";
import { isMissingRelation } from "@/lib/inbox/fail-soft";
import { HANDOFF_NUMBER_TAG } from "@/lib/inbox/widget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/twilio/inbound-sms  (Module 09 — Inbox, Wave 3c-B)
 *
 * The reply leg of SMS handoff. After a live-chat visitor leaves and we text
 * them (lib/inbox/sms-handoff), their replies land here (Twilio posts the
 * inbound message to the per-number SmsUrl we set at provision time). We:
 *   - verify the Twilio signature (fail-closed when configured / in prod)
 *   - resolve the destination number (`To`) → our handoff `PhoneNumber` → org
 *   - honour STOP keywords (record unsubscribe; don't append)
 *   - append the inbound text to the matching `sms` InboxThread (keyed by the
 *     visitor's `From` phone) so the agent sees it in Conversations
 *   - fire contact auto-capture
 *
 * GUARDRAIL: env-gated. With Twilio unconfigured AND not in production this is a
 * 200 no-op (no creds → the handler can't do anything meaningful anyway, and we
 * never expose the endpoint's behaviour before it's wired). Idempotent on the
 * Twilio MessageSid.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;

  const twilioConfigured = Boolean(process.env.TWILIO_AUTH_TOKEN);

  // Env gate: nothing configured + not prod → accept + no-op (never 500).
  if (!twilioConfigured && !isProductionRuntime()) {
    return NextResponse.json({ skipped: "twilio_not_configured" }, { status: 200 });
  }

  // Signature verify (rebuild the public URL behind the proxy, like sms-status).
  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(/:$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const url = `${proto}://${host}${req.nextUrl.pathname}`;
  let verified = false;
  try {
    verified = await verifyTwilioSignature({ url, params, signature });
  } catch {
    // verifyTwilioSignature throws when creds are absent; treat as unverified.
    verified = false;
  }
  if (!verified && (twilioConfigured || isProductionRuntime())) {
    logger.warn({ event: "webhook.twilio.inbound_sms.bad_signature", url });
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }

  const messageSid = params.MessageSid ?? params.SmsMessageSid;
  const from = params.From;
  const to = params.To;
  const body = (params.Body ?? "").trim();
  if (!messageSid || !from || !to) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const result = await handleIdempotent("twilio_inbound_sms", messageSid, rawBody, async () => {
    await processInbound({ from, to, body, messageSid });
  });

  return NextResponse.json({ received: true, idempotent: result === "replay" });
}

const STOP_KEYWORDS = /^(stop|stopall|unsubscribe|cancel|end|quit)$/i;

async function processInbound(args: {
  from: string;
  to: string;
  body: string;
  messageSid: string;
}): Promise<void> {
  // Resolve the destination handoff number → org. Fail-soft when phone_numbers
  // (or the friendlyName tag) isn't present.
  let owner: { organizationId: string } | null = null;
  try {
    owner = await prisma.phoneNumber.findFirst({
      where: { phoneE164: args.to, friendlyName: HANDOFF_NUMBER_TAG },
      select: { organizationId: true },
    });
  } catch (err) {
    if (!isMissingRelation(err)) throw err;
  }
  if (!owner) {
    logger.warn({ event: "inbox.inbound_sms.orphan", to: args.to });
    return; // not one of our handoff numbers → ignore
  }
  const orgId = owner.organizationId;

  // STOP handling — record unsubscribe; do not append a thread message.
  if (STOP_KEYWORDS.test(args.body)) {
    await recordUnsubscribe({
      channel: "sms",
      recipient: args.from,
      organizationId: orgId,
      source: "sms_stop",
    }).catch(() => {});
    logger.info({ event: "inbox.inbound_sms.stop", orgId, from: args.from });
    return;
  }

  // Append the inbound text to the matching sms thread (keyed by visitor phone).
  const externalThreadId = `sms-handoff:${args.from}`;
  try {
    await withTenant(orgId, async (tx) => {
      const now = new Date();
      let thread = await tx.inboxThread.findFirst({
        where: { channel: "sms", externalThreadId },
        select: { id: true },
      });
      if (!thread) {
        // Visitor replied to a number we own but no thread exists (e.g. handoff
        // row pruned). Create a thread so the message is never lost.
        const created = await tx.inboxThread.create({
          data: {
            organizationId: orgId,
            channel: "sms",
            externalThreadId,
            subject: "SMS",
            participant: { phone: args.from, startedViaWidget: true } as Prisma.InputJsonValue,
            status: "open",
            lastMessageAt: now,
            unreadCount: 0,
          },
          select: { id: true },
        });
        thread = created;
      }

      // Dedupe on the Twilio MessageSid.
      const dup = await tx.inboxMessage.findFirst({
        where: { threadId: thread.id, externalId: `sms:${args.messageSid}` },
        select: { id: true },
      });
      if (!dup) {
        await tx.inboxMessage.create({
          data: {
            threadId: thread.id,
            organizationId: orgId,
            direction: "inbound",
            body: args.body.slice(0, 8000),
            externalId: `sms:${args.messageSid}`,
            sentAt: now,
          },
        });
        await tx.inboxThread.update({
          where: { id: thread.id },
          data: {
            // Reopen if the agent had resolved it and the visitor wrote back.
            status: "open",
            lastMessageAt: now,
            lastMessageBody: args.body.slice(0, 500),
            lastMessageDirection: "inbound",
            unreadCount: { increment: 1 },
          },
        });
      }
    });
  } catch (err) {
    if (!isMissingRelation(err)) throw err;
    logger.warn({ event: "inbox.inbound_sms.not_migrated", orgId });
    return;
  }

  // Contact auto-capture (fail-soft, fire-and-forget).
  captureContactInBackground({
    orgId,
    source: "sms",
    phone: args.from,
    activity: {
      title: "Replied via SMS",
      externalRef: `sms-inbound:${args.messageSid}`,
    },
  });

  logger.info({ event: "inbox.inbound_sms.appended", orgId, from: args.from });
}
