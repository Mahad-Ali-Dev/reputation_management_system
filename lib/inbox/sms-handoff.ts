/**
 * SMS-handoff engine (Module 09, Wave 3c — phase 3). The "Podium-killer":
 * when a live-chat visitor needs a human and leaves the website, we continue the
 * conversation over SMS so it never drops.
 *
 * `startSmsHandoff` is the entry point (called from the widget phone-capture →
 * `/api/inbox/widget-handoff`, and from the agent "Move to SMS" action). It:
 *   1. asserts the org is entitled (paid) + the visitor isn't unsubscribed
 *   2. ensures a handoff `PhoneNumber` exists (env-gated provisioning; no-op +
 *      "number not provisioned" when Twilio is absent — the thread is still
 *      created so the conversation is preserved)
 *   3. creates (or reuses) an `sms` `InboxThread` keyed by the visitor phone,
 *      tagged `startedViaWidget:true`, and copies the recent webchat transcript
 *      in as the opening messages
 *   4. records TCPA consent (the visitor explicitly gave their number) and sends
 *      the FIRST SMS via `sendSms` (env-gated; skipped when Twilio absent)
 *   5. marks the originating `AiConversation.handedOffAt`
 *   6. fires the contact auto-capture hook (fail-soft)
 *
 * All `withTenant`. Fail-soft: a missing Twilio config degrades gracefully
 * (`smsSent:false`, `numberProvisioned:false`) rather than throwing — the agent
 * still gets a thread to work, and the founder can enable Twilio later.
 */

import type { Prisma } from "@prisma/client";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { sendSms } from "@/lib/outreach/twilio";
import { isUnsubscribed, recordSmsConsent } from "@/lib/outreach/suppression";
import { isTwilioConfigured } from "@/lib/phone/twilio-client";
import { provisionHandoffNumber } from "@/lib/phone/provision-number";
import { getSessionTranscript } from "./livechat";
import { softInbox } from "./fail-soft";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;

/** Normalize toward E.164 (strip separators). Returns null when implausible. */
export function normalizeE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (PHONE_RE.test(cleaned)) return cleaned;
  // Bare 10-digit US number → +1.
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export type StartSmsHandoffInput = {
  orgId: string;
  /** The widget AiConversation id this handoff continues from (optional). */
  conversationId?: string | null;
  /** The InboxThread id this handoff continues from (optional, for agent path). */
  fromThreadId?: string | null;
  visitorPhone: string;
  visitorName?: string | null;
  visitorEmail?: string | null;
  /** Optional first message to send (else a default "we'll text you" line). */
  firstMessage?: string;
  /** For consent provenance. */
  ip?: string | null;
  userAgent?: string | null;
  /** Skip the entitlement check (internal/system callers). Default false. */
  skipEntitlement?: boolean;
};

export type StartSmsHandoffResult =
  | {
      ok: true;
      threadId: string;
      smsSent: boolean;
      numberProvisioned: boolean;
      handoffNumber: string | null;
      reason?: string;
    }
  | { ok: false; error: string };

const DEFAULT_FIRST_SMS =
  "Thanks for chatting with us! A team member will follow up here over text. Reply anytime.";

/**
 * Begin (or resume) an SMS handoff for a visitor. See module doc.
 */
export async function startSmsHandoff(
  input: StartSmsHandoffInput,
): Promise<StartSmsHandoffResult> {
  const phone = normalizeE164(input.visitorPhone);
  if (!phone) return { ok: false, error: "invalid_phone" };

  // Paid feature gate (visitor SMS continuation). System callers can skip.
  if (!input.skipEntitlement) {
    try {
      await assertEntitled(input.orgId);
    } catch {
      return { ok: false, error: "not_entitled" };
    }
  }

  // TCPA suppression check — never text an opted-out number.
  const suppressed = await isUnsubscribed({
    channel: "sms",
    recipient: phone,
    organizationId: input.orgId,
  }).catch(() => false);
  if (suppressed) {
    return { ok: false, error: "recipient_unsubscribed" };
  }

  // 1. Ensure a handoff number (env-gated; no-op when Twilio absent).
  const provision = await provisionHandoffNumber({ orgId: input.orgId });
  const numberProvisioned = provision.provisioned;
  const handoffNumber = provision.provisioned ? provision.phoneE164 : null;

  // 2. Pull the recent transcript to seed the SMS thread (best-effort).
  const transcript = input.conversationId
    ? await getSessionTranscript({ orgId: input.orgId, conversationId: input.conversationId })
    : [];

  // 3. Create / reuse the sms InboxThread + copy transcript. Fail-soft.
  const threadId = await softInbox(
    () =>
      withTenant(input.orgId, async (tx) => {
        const externalThreadId = `sms-handoff:${phone}`;
        const now = new Date();

        let thread = await tx.inboxThread.findFirst({
          where: { channel: "sms", externalThreadId },
          select: { id: true, participant: true },
        });

        const participant: Record<string, unknown> = {
          phone,
          startedViaWidget: true,
          ...(input.visitorName ? { name: input.visitorName } : {}),
          ...(input.visitorEmail ? { email: input.visitorEmail } : {}),
          ...(input.conversationId ? { sourceConversationId: input.conversationId } : {}),
          ...(handoffNumber ? { handoffNumber } : {}),
        };

        if (!thread) {
          const created = await tx.inboxThread.create({
            data: {
              organizationId: input.orgId,
              channel: "sms",
              externalThreadId,
              subject: "SMS (started via website chat)",
              participant: participant as Prisma.InputJsonValue,
              status: "open",
              lastMessageAt: now,
              unreadCount: 0,
            },
            select: { id: true, participant: true },
          });
          thread = created;

          // Copy the recent transcript in as the opening messages (cap 20).
          const recent = transcript.slice(-20);
          let idx = 0;
          for (const m of recent) {
            await tx.inboxMessage.create({
              data: {
                threadId: created.id,
                organizationId: input.orgId,
                direction: m.role === "user" ? "inbound" : "outbound",
                body: m.content.slice(0, 8000),
                externalId: `transcript:${m.id}`,
                sentAt: new Date(now.getTime() + idx),
              },
            });
            idx++;
          }
        } else {
          // Merge new identity into the existing thread.
          const prev =
            thread.participant && typeof thread.participant === "object"
              ? (thread.participant as Record<string, unknown>)
              : {};
          await tx.inboxThread.update({
            where: { id: thread.id },
            data: { participant: { ...prev, ...participant } as Prisma.InputJsonValue },
          });
        }

        return thread.id;
      }),
    null,
    { event: "inbox.smsHandoff.createThread.failed", context: { orgId: input.orgId } },
  );

  if (!threadId) return { ok: false, error: "thread_create_failed" };

  // 4. Mark the originating AiConversation handed off (fail-soft).
  if (input.conversationId) {
    await softInbox(
      () =>
        withTenant(input.orgId, async (tx) => {
          await tx.aiConversation.updateMany({
            where: { id: input.conversationId as string },
            data: { handedOffAt: new Date(), terminatedReason: "sms_handoff" },
          });
          return true;
        }),
      false,
      { event: "inbox.smsHandoff.markConversation.failed", context: { orgId: input.orgId } },
    );
  }

  // 5. Fire-and-forget contact capture (the visitor gave us a phone).
  captureContactInBackground({
    orgId: input.orgId,
    source: "sms",
    phone,
    name: input.visitorName ?? null,
    email: input.visitorEmail ?? null,
    activity: {
      title: "Started SMS handoff from website chat",
      externalRef: `sms-handoff:${threadId}`,
    },
  });

  // 6. Send the first SMS (env-gated). Record consent first (visitor gave #).
  const firstBody = (input.firstMessage?.trim() || DEFAULT_FIRST_SMS).slice(0, 1200);
  let smsSent = false;
  let reason: string | undefined;

  if (isTwilioConfigured() && numberProvisioned) {
    // Record express consent — the visitor explicitly submitted their number to
    // be texted (the capture UI carries the disclosure that becomes consentText).
    await recordSmsConsent({
      organizationId: input.orgId,
      phoneE164: phone,
      consentText:
        "Visitor submitted their phone number in the website chat widget to continue the conversation via SMS.",
      source: "web_form",
      ip: input.ip ?? undefined,
      userAgent: input.userAgent ?? undefined,
    }).catch(() => {
      /* consent record best-effort; do not block */
    });

    const res = await sendSms({ to: phone, body: firstBody, isFirstMessage: true });
    if (res.ok) {
      smsSent = true;
      // Persist the outbound first message on the thread.
      await softInbox(
        () =>
          withTenant(input.orgId, async (tx) => {
            const now = new Date();
            await tx.inboxMessage.create({
              data: {
                threadId,
                organizationId: input.orgId,
                direction: "outbound",
                body: firstBody,
                externalId: `sms:${res.messageSid}`,
                sentAt: now,
              },
            });
            await tx.inboxThread.update({
              where: { id: threadId },
              data: {
                lastMessageAt: now,
                lastMessageBody: firstBody.slice(0, 500),
                lastMessageDirection: "outbound",
              },
            });
            return true;
          }),
        false,
        { event: "inbox.smsHandoff.persistFirstSms.failed", context: { orgId: input.orgId } },
      );
    } else {
      reason = res.error;
      logger.warn({
        event: "inbox.smsHandoff.send_failed",
        orgId: input.orgId,
        error: res.error,
      });
    }
  } else {
    reason = numberProvisioned ? "twilio_not_configured" : "number_not_provisioned";
  }

  logger.info({
    event: "inbox.smsHandoff.started",
    orgId: input.orgId,
    threadId,
    smsSent,
    numberProvisioned,
  });

  return { ok: true, threadId, smsSent, numberProvisioned, handoffNumber, reason };
}
