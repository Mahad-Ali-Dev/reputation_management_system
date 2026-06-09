/**
 * WhatsApp Business Cloud API — outbound send (Module 09).
 *
 * Mirrors the Meta outbound dispatch pattern: a single fail-soft function that
 * POSTs to the Graph API. The inbox composer (`sendMessage`) calls
 * `dispatchWhatsAppReply` after the message is persisted, exactly how a FB/IG
 * reply would dispatch — store-first, then best-effort transmit.
 *
 * ⚠ 24-HOUR CUSTOMER-CARE WINDOW. The WhatsApp platform only permits free-form
 * (non-template) replies within 24h of the customer's LAST inbound message.
 * Outside that window Meta rejects a plain `text` message (error 131047) and a
 * pre-approved message *template* is required. This MVP sends free-form text
 * (the agent is replying to a live thread, almost always inside the window); a
 * template-send path is a later addition. The Graph error is logged, never
 * thrown — a delivery failure must not roll back the persisted reply.
 */

import { decryptAccessToken } from "@/lib/connections/adapters/refresh";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";

/** Graph version pinned for the WhatsApp Cloud messages endpoint. */
export const WHATSAPP_GRAPH_VERSION = "v21.0";

export interface SendWhatsAppArgs {
  /** The business phone number id (Graph path segment + Connection.externalId). */
  phoneNumberId: string;
  /** Decrypted permanent/system-user access token for this WABA. */
  accessToken: string;
  /** Recipient wa_id (E.164, no leading "+") — the inbound message's `from`. */
  to: string;
  /** Free-form reply body. */
  body: string;
}

export interface SendWhatsAppResult {
  ok: boolean;
  /** Provider message id (`wamid...`) on success. */
  messageId?: string;
  error?: string;
}

/**
 * POST a free-form text message to the WhatsApp Cloud API. Fail-soft: any
 * network / Graph error returns `{ ok:false, error }` (never throws). Caller
 * decides what to do with a failed delivery (the reply is already persisted).
 */
export async function sendWhatsAppMessage(args: SendWhatsAppArgs): Promise<SendWhatsAppResult> {
  const { phoneNumberId, accessToken, to, body } = args;
  if (!phoneNumberId || !accessToken || !to || !body) {
    return { ok: false, error: "missing_args" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(
        phoneNumberId,
      )}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body },
        }),
      },
    );

    const json = (await res.json().catch(() => null)) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    } | null;

    if (!res.ok || json?.error) {
      const error = json?.error?.message ?? `http_${res.status}`;
      logger.warn({ event: "inbox.whatsapp.send_failed", phoneNumberId, error });
      return { ok: false, error };
    }

    return { ok: true, messageId: json?.messages?.[0]?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "inbox.whatsapp.send_failed", phoneNumberId, error });
    return { ok: false, error };
  }
}

/**
 * Resolve the active WhatsApp Connection for a thread's `externalThreadId` (the
 * recipient wa_id) and transmit a persisted reply. Mirrors how a FB/IG reply
 * would dispatch off the inbox composer: the org's WhatsApp `Connection` carries
 * the `phone_number_id` on `externalId` and the encrypted access token, so a
 * single tenant-scoped lookup yields everything the send needs. Fail-soft and
 * env/connection-gated — no connection ⇒ no-op (the reply is still stored).
 */
export async function dispatchWhatsAppReply(args: {
  orgId: string;
  /** The recipient wa_id (== InboxThread.externalThreadId for whatsapp). */
  to: string;
  body: string;
}): Promise<SendWhatsAppResult> {
  const { orgId, to, body } = args;
  if (!to) return { ok: false, error: "no_recipient" };

  try {
    const conn = await prisma.connection.findFirst({
      where: { organizationId: orgId, provider: "whatsapp", status: "active" },
      select: {
        id: true,
        organizationId: true,
        provider: true,
        externalId: true,
        accountLabel: true,
        establishmentId: true,
        accessTokenCt: true,
        refreshTokenCt: true,
        iv: true,
        keyVersion: true,
        dekCiphertext: true,
        encryptionCtx: true,
        tokenExpiresAt: true,
        scopes: true,
      },
    });
    if (!conn?.externalId) return { ok: false, error: "no_connection" };

    const accessToken = decryptAccessToken(conn);
    if (!accessToken) return { ok: false, error: "decrypt_failed" };

    return await sendWhatsAppMessage({
      phoneNumberId: conn.externalId,
      accessToken,
      to,
      body,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "inbox.whatsapp.dispatch_failed", orgId, error });
    return { ok: false, error };
  }
}
