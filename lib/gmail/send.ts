/**
 * Gmail outbound send (Module 09 email-channel parity).
 *
 * Mirrors the WhatsApp outbound dispatch pattern: a single fail-soft function
 * that builds an RFC822 reply (pure `lib/gmail/mime` builder) and POSTs the
 * base64url `raw` to Gmail `users.messages.send`. The inbox composer
 * (`sendMessage`) calls `dispatchGmailReply` after the reply is persisted —
 * store-first, then best-effort transmit, so a Gmail/network error never rolls
 * back the persisted reply.
 *
 * Threading: we pass the inbox thread's `externalThreadId` (== Gmail threadId)
 * as the send API `threadId`, and set In-Reply-To/References to the last inbound
 * message's RFC822 Message-Id (stashed on the inbox message's `attachments` at
 * ingest time) so Gmail collapses the reply into the original conversation.
 */

import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { type BuildReplyMimeArgs, buildRawMessage, ensureReplySubject } from "./mime";
import { getGmailAccessToken } from "./token";

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export interface SendGmailArgs {
  accessToken: string;
  /** Gmail conversation id to thread into (the inbox thread's externalThreadId). */
  threadId?: string | null;
  mime: BuildReplyMimeArgs;
}

export interface SendGmailResult {
  ok: boolean;
  /** Gmail message id on success. */
  messageId?: string;
  error?: string;
}

/**
 * POST a built reply to Gmail `users.messages.send`. Fail-soft: any network /
 * API error returns `{ ok:false, error }` (never throws).
 */
export async function sendGmailMessage(args: SendGmailArgs): Promise<SendGmailResult> {
  if (!args.accessToken) return { ok: false, error: "no_access_token" };
  if (!args.mime.to) return { ok: false, error: "no_recipient" };

  const raw = buildRawMessage(args.mime);
  const body: { raw: string; threadId?: string } = { raw };
  if (args.threadId) body.threadId = args.threadId;

  try {
    const res = await fetch(GMAIL_SEND_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${args.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as {
      id?: string;
      error?: { message?: string };
    } | null;
    if (!res.ok || json?.error) {
      const error = json?.error?.message ?? `http_${res.status}`;
      logger.warn({ event: "gmail.send_failed", error });
      return { ok: false, error };
    }
    return { ok: true, messageId: json?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "gmail.send_failed", error });
    return { ok: false, error };
  }
}

/**
 * Resolve the org's active gmail Connection, ensure a usable access token, and
 * transmit a persisted reply for an inbox email thread. Fail-soft + connection-
 * gated: no gmail connection ⇒ no-op (the reply stays stored). Mirrors
 * `dispatchWhatsAppReply`.
 */
export async function dispatchGmailReply(args: {
  orgId: string;
  /** Recipient email (the inbound participant's address). */
  to: string;
  subject?: string | null;
  body: string;
  /** Gmail conversation id (inbox thread externalThreadId) for threading. */
  threadId?: string | null;
  /** Original RFC822 Message-Id for In-Reply-To/References. */
  inReplyTo?: string | null;
  references?: string | null;
}): Promise<SendGmailResult> {
  if (!args.to) return { ok: false, error: "no_recipient" };

  try {
    const conn = await prisma.connection.findFirst({
      where: { organizationId: args.orgId, provider: "gmail", status: "active" },
    });
    if (!conn) return { ok: false, error: "no_connection" };

    // Ensure a usable token (refreshed inline against the env Google app).
    const accessToken = await getGmailAccessToken(conn);
    if (!accessToken) return { ok: false, error: "token_unavailable" };

    const from = conn.externalId ?? conn.accountLabel ?? "me";

    return await sendGmailMessage({
      accessToken,
      threadId: args.threadId ?? undefined,
      mime: {
        to: args.to,
        from,
        subject: ensureReplySubject(args.subject),
        text: args.body,
        inReplyTo: args.inReplyTo ?? null,
        references: args.references ?? null,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "gmail.dispatch_failed", orgId: args.orgId, error });
    return { ok: false, error };
  }
}
