/**
 * Conversations write logic (Module 09, Wave 3c — phase 1).
 *
 * The plumbing behind the Conversations tab + the `/api/inbox/*` routes:
 * appending messages, internal notes, status toggle, assignment, and blocking a
 * participant — all `withTenant`, all fail-soft on not-yet-migrated schema.
 *
 * Sending an OUTBOUND message also fires the contact auto-capture hook
 * (`upsertContactFromInteraction`) so the person on the other end lands in the
 * Contact directory. That call is leaf-level + self-contained by design (module
 * 12) and is invoked fire-and-forget so it can never block or fail the send.
 *
 * Channel dispatch (actually delivering to Meta/GBP/SMS) is phase 3 — this phase
 * is store-only ("send" persists the message + bumps the thread). The persisted
 * message is exactly what an adapter would later transmit, so wiring the adapter
 * in is additive.
 */

import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { captureContactInBackground } from "@/lib/contacts/upsert-from-interaction";
import { dispatchGmailReply } from "@/lib/gmail/send";
import { softInbox } from "./fail-soft";
import { dispatchWhatsAppReply } from "./whatsapp-send";

/** Map an InboxThread.channel → the canonical Contact `source` key. */
function channelToSource(channel: string): string {
  switch (channel) {
    case "facebook_msg":
      return "facebook";
    case "instagram_dm":
      return "instagram";
    case "whatsapp":
      return "whatsapp";
    case "webchat":
      return "live_chat";
    case "gbp_qa":
      return "google_business";
    case "sms":
      return "sms";
    case "email":
      return "email";
    default:
      return "inbox";
  }
}

/** Pull email / phone / social identity out of a thread's participant JSON. */
function identityFromParticipant(
  channel: string,
  participant: unknown,
): { email: string | null; phone: string | null; socialId: string | null; name: string | null } {
  const obj =
    participant && typeof participant === "object" ? (participant as Record<string, unknown>) : {};
  const email = typeof obj.email === "string" ? obj.email : null;
  const phone = typeof obj.phone === "string" ? obj.phone : null;
  const name =
    (typeof obj.name === "string" && obj.name) ||
    (typeof obj.displayName === "string" && obj.displayName) ||
    null;
  // socialId encoded as "<platform>:<externalId>" for the contacts dedupe.
  let socialId: string | null = null;
  const externalAuthorId =
    (typeof obj.externalId === "string" && obj.externalId) ||
    (typeof obj.id === "string" && obj.id) ||
    null;
  if (externalAuthorId) {
    if (channel === "facebook_msg") socialId = `facebook:${externalAuthorId}`;
    else if (channel === "instagram_dm") socialId = `instagram:${externalAuthorId}`;
    else if (channel === "whatsapp") socialId = `whatsapp:${externalAuthorId}`;
  }
  return { email, phone, socialId, name };
}

/**
 * Pull the original RFC822 `Message-Id` an email ingest stashed on the inbound
 * message's `attachments` JSON (see `gmailMessageToInbound`). Used to thread a
 * Gmail reply via In-Reply-To/References. Returns null when absent.
 */
function rfc822MessageIdOf(attachments: unknown): string | null {
  if (attachments && typeof attachments === "object") {
    const v = (attachments as Record<string, unknown>).rfc822MessageId;
    if (typeof v === "string" && v) return v;
  }
  return null;
}

export type SendMessageInput = {
  orgId: string;
  threadId: string;
  body: string;
  /** The operator (author) — stored on the message + audit. */
  authorUserId?: string | null;
  /** If this send is using an AI draft, keep the source text for forensics. */
  aiSuggested?: string | null;
  attachments?: unknown;
};

export type SentMessage = {
  id: string;
  threadId: string;
  direction: "outbound";
  body: string;
  authorUserId: string | null;
  aiSuggested: string | null;
  attachments: unknown;
  sentAt: string;
};

/**
 * Append an OUTBOUND message to a thread, update the thread's last-message
 * pointers, clear the unread counter, and fire the contact auto-capture hook.
 * Returns the created message (for an optimistic UI reconcile) or null on a
 * fail-soft path (thread missing / not migrated).
 */
export async function sendMessage(input: SendMessageInput): Promise<SentMessage | null> {
  const body = input.body?.trim();
  if (!body) throw new Error("Message body is required");

  const result = await softInbox(
    () =>
      withTenant(input.orgId, async (tx) => {
        // Confirm the thread exists + belongs to this tenant (RLS already scopes,
        // but we need its channel/participant for the capture + status reset).
        const thread = await tx.inboxThread.findUnique({
          where: { id: input.threadId },
          select: {
            id: true,
            channel: true,
            participant: true,
            status: true,
            externalThreadId: true,
            subject: true,
            // Newest inbound message — used by the email/Gmail dispatch to pull
            // the original RFC822 Message-Id for In-Reply-To/References threading.
            messages: {
              where: { direction: "inbound" },
              orderBy: { sentAt: "desc" },
              take: 1,
              select: { externalId: true, attachments: true },
            },
          },
        });
        if (!thread) return null;

        const now = new Date();
        const msg = await tx.inboxMessage.create({
          data: {
            threadId: input.threadId,
            organizationId: input.orgId,
            direction: "outbound",
            authorUserId: input.authorUserId ?? null,
            body,
            aiSuggested: input.aiSuggested ?? null,
            attachments: (input.attachments as Prisma.InputJsonValue | undefined) ?? undefined,
            sentAt: now,
          },
          select: {
            id: true,
            threadId: true,
            body: true,
            authorUserId: true,
            aiSuggested: true,
            attachments: true,
            sentAt: true,
          },
        });

        await tx.inboxThread.update({
          where: { id: input.threadId },
          data: {
            lastMessageAt: now,
            lastMessageBody: body.slice(0, 500),
            lastMessageDirection: "outbound",
            // Replying clears the unread badge.
            unreadCount: 0,
          },
        });

        return {
          msg,
          channel: thread.channel,
          participant: thread.participant,
          externalThreadId: thread.externalThreadId,
          subject: thread.subject,
          lastInbound: thread.messages?.[0] ?? null,
        };
      }),
    null,
    { event: "inbox.sendMessage.failed", context: { orgId: input.orgId } },
  );

  if (!result) return null;

  // Fire-and-forget contact auto-capture (never blocks the send; self-contained).
  const ident = identityFromParticipant(result.channel, result.participant);
  if (ident.email || ident.phone || ident.socialId) {
    captureContactInBackground({
      orgId: input.orgId,
      source: channelToSource(result.channel),
      email: ident.email,
      phone: ident.phone,
      socialId: ident.socialId,
      name: ident.name,
      activity: {
        title: "Replied in Unified Inbox",
        externalRef: `inbox-reply:${result.msg.id}`,
      },
    });
  }

  // Per-channel outbound dispatch (mirrors how a FB/IG reply would transmit):
  // store-first (above), then best-effort delivery. Fire-and-forget so a delivery
  // failure never blocks or rolls back the persisted reply.
  if (result.channel === "whatsapp" && result.externalThreadId) {
    void dispatchWhatsAppReply({
      orgId: input.orgId,
      to: result.externalThreadId,
      body,
    }).catch(() => {
      /* dispatchWhatsAppReply is already fail-soft; this guards the void promise */
    });
  }

  // Email replies originating from a connected Gmail mailbox transmit via the
  // Gmail API. The recipient is the inbound participant's address; threading
  // uses the Gmail thread id (externalThreadId) + the original RFC822
  // Message-Id stashed on the last inbound message's attachments at ingest.
  if (result.channel === "email" && ident.email) {
    const rfc822 = rfc822MessageIdOf(result.lastInbound?.attachments);
    void dispatchGmailReply({
      orgId: input.orgId,
      to: ident.email,
      subject: result.subject,
      body,
      threadId: result.externalThreadId,
      inReplyTo: rfc822,
      references: rfc822,
    }).catch(() => {
      /* dispatchGmailReply is already fail-soft; this guards the void promise */
    });
  }

  logger.info({
    event: "inbox.message.sent",
    orgId: input.orgId,
    threadId: input.threadId,
    messageId: result.msg.id,
  });

  return {
    id: result.msg.id,
    threadId: result.msg.threadId,
    direction: "outbound",
    body: result.msg.body,
    authorUserId: result.msg.authorUserId,
    aiSuggested: result.msg.aiSuggested,
    attachments: result.msg.attachments,
    sentAt: result.msg.sentAt.toISOString(),
  };
}

/**
 * Append an INTERNAL note (yellow card — never sent to the customer). Stored as
 * an `InboxMessage` with `direction:"internal"` (free-text column, no migration).
 * Does NOT touch last-message pointers (notes aren't customer-visible).
 */
export async function addInternalNote(input: {
  orgId: string;
  threadId: string;
  body: string;
  authorUserId?: string | null;
}): Promise<SentMessage | null> {
  const body = input.body?.trim();
  if (!body) throw new Error("Note body is required");

  return softInbox(
    () =>
      withTenant(input.orgId, async (tx) => {
        const thread = await tx.inboxThread.findUnique({
          where: { id: input.threadId },
          select: { id: true },
        });
        if (!thread) return null;
        const msg = await tx.inboxMessage.create({
          data: {
            threadId: input.threadId,
            organizationId: input.orgId,
            direction: "internal",
            authorUserId: input.authorUserId ?? null,
            body,
            sentAt: new Date(),
          },
          select: {
            id: true,
            threadId: true,
            body: true,
            authorUserId: true,
            aiSuggested: true,
            attachments: true,
            sentAt: true,
          },
        });
        return {
          id: msg.id,
          threadId: msg.threadId,
          direction: "outbound" as const, // shape-compat; UI distinguishes by note flag
          body: msg.body,
          authorUserId: msg.authorUserId,
          aiSuggested: msg.aiSuggested,
          attachments: msg.attachments,
          sentAt: msg.sentAt.toISOString(),
        };
      }),
    null,
    { event: "inbox.addInternalNote.failed", context: { orgId: input.orgId } },
  );
}

/** Toggle / set a thread's status (Open ↔ Resolved, or any valid status). */
export async function setThreadStatus(input: {
  orgId: string;
  threadId: string;
  status: string;
}): Promise<boolean> {
  const status = input.status.trim();
  if (!status) throw new Error("status is required");
  return softInbox(
    () =>
      withTenant(input.orgId, async (tx) => {
        const r = await tx.inboxThread.updateMany({
          where: { id: input.threadId },
          data: { status },
        });
        return r.count > 0;
      }),
    false,
    { event: "inbox.setStatus.failed", context: { orgId: input.orgId } },
  );
}

/** Assign (or unassign with `assigneeId:null`) a thread to a teammate. */
export async function assignThread(input: {
  orgId: string;
  threadId: string;
  assigneeId: string | null;
}): Promise<boolean> {
  return softInbox(
    () =>
      withTenant(input.orgId, async (tx) => {
        // Integrity: only assign to someone who is an active member of THIS org.
        // Without this an arbitrary userId (e.g. a member of another tenant) could
        // be written to assigneeId. Unassign (null) is always allowed.
        if (input.assigneeId !== null) {
          const member = await tx.membership.findFirst({
            where: { userId: input.assigneeId, organizationId: input.orgId },
            select: { id: true },
          });
          if (!member) return false;
        }
        const r = await tx.inboxThread.updateMany({
          where: { id: input.threadId },
          data: { assigneeId: input.assigneeId },
        });
        return r.count > 0;
      }),
    false,
    { event: "inbox.assignThread.failed", context: { orgId: input.orgId } },
  );
}

/**
 * Block the participant of a thread: marks the thread `spam` and writes a marker
 * into participant JSON. (Channel-level blocking via adapters is phase 3.)
 */
export async function blockThreadParticipant(input: {
  orgId: string;
  threadId: string;
}): Promise<boolean> {
  return softInbox(
    () =>
      withTenant(input.orgId, async (tx) => {
        const t = await tx.inboxThread.findUnique({
          where: { id: input.threadId },
          select: { participant: true },
        });
        if (!t) return false;
        const prev =
          t.participant && typeof t.participant === "object"
            ? (t.participant as Record<string, unknown>)
            : {};
        await tx.inboxThread.update({
          where: { id: input.threadId },
          data: {
            status: "spam",
            participant: {
              ...prev,
              blocked: true,
              blockedAt: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        return true;
      }),
    false,
    { event: "inbox.blockParticipant.failed", context: { orgId: input.orgId } },
  );
}
