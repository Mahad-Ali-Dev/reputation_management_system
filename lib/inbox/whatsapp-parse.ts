/**
 * WhatsApp Business Cloud API — pure webhook-payload parsing (Module 09).
 *
 * Mirrors the inline normaliser in the Meta route, but extracted into a pure,
 * dependency-free, individually-testable module (no `prisma`, no `crypto`, no
 * `next` imports) so the inbound mapping + signature/empty-payload guards can be
 * unit-tested at the logic level. The webhook route is a thin shell that verifies
 * the HMAC, resolves the org, and hands each `InboundNormalized` here produces to
 * `ingestInbound` on channel `"whatsapp"`.
 *
 * Reference payload shape (Meta WhatsApp Cloud API):
 *   {
 *     object: "whatsapp_business_account",
 *     entry: [{
 *       id: "<WABA_ID>",
 *       changes: [{
 *         field: "messages",
 *         value: {
 *           messaging_product: "whatsapp",
 *           metadata: { display_phone_number, phone_number_id: "<PNID>" },
 *           contacts: [{ profile: { name }, wa_id: "<E164>" }],
 *           messages: [{ from: "<E164>", id: "wamid...", timestamp: "169..",
 *                        type: "text", text: { body } }],
 *         },
 *       }],
 *     }],
 *   }
 *
 * The `phone_number_id` is the org-resolution key (stored on the WhatsApp
 * Connection's `externalId` at connect time — exactly like the Meta page id).
 */

import type { InboundNormalized } from "./ingest";

// ---------------------------------------------------------------------------
// Payload shapes (the relevant subset of the WhatsApp Cloud webhook schema)
// ---------------------------------------------------------------------------

export interface WhatsAppWebhookPayload {
  object?: string; // "whatsapp_business_account"
  entry?: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id?: string; // WABA id
  changes?: WhatsAppChange[];
}

export interface WhatsAppChange {
  field?: string; // "messages"
  value?: WhatsAppValue;
}

export interface WhatsAppValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  // statuses[] (delivery/read receipts) are intentionally ignored — not inbound.
  statuses?: unknown[];
}

export interface WhatsAppContact {
  wa_id?: string;
  profile?: { name?: string };
}

export interface WhatsAppMessage {
  from?: string; // sender E.164 (== wa_id)
  id?: string; // "wamid..." — idempotency key
  timestamp?: string; // unix seconds, as a string
  type?: string; // "text" | "image" | "audio" | "video" | "document" | ...
  text?: { body?: string };
}

/** What one parsed inbound WhatsApp message carries up to the route. */
export interface ParsedWhatsAppInbound {
  /** The phone_number_id this message arrived on — the org-resolution key. */
  phoneNumberId: string;
  message: InboundNormalized;
}

// ---------------------------------------------------------------------------
// Non-text fallback
// ---------------------------------------------------------------------------

/** A human-readable placeholder body for a non-text message type. */
export function nonTextPlaceholder(type: string | undefined): string {
  switch (type) {
    case "image":
      return "[image]";
    case "video":
      return "[video]";
    case "audio":
    case "voice":
      return "[audio]";
    case "document":
      return "[document]";
    case "sticker":
      return "[sticker]";
    case "location":
      return "[location]";
    case "contacts":
      return "[contact]";
    default:
      return type ? `[${type}]` : "[unsupported]";
  }
}

// ---------------------------------------------------------------------------
// Pure normaliser
// ---------------------------------------------------------------------------

/**
 * Map ONE WhatsApp message (+ its contacts lookup) → an `InboundNormalized`.
 * Returns null when the message lacks a stable id or sender (un-ingestable).
 * Non-text types become a placeholder body (`[image]`, …) so the thread still
 * shows an entry. Text bodies are taken verbatim from `message.text.body`.
 */
export function normalizeWhatsAppMessage(
  msg: WhatsAppMessage,
  contacts: WhatsAppContact[],
): InboundNormalized | null {
  const externalId = msg.id;
  const from = msg.from;
  if (!externalId || !from) return null;

  const body =
    msg.type === "text" && typeof msg.text?.body === "string" && msg.text.body.length > 0
      ? msg.text.body
      : nonTextPlaceholder(msg.type);

  // Match the contact profile for this sender (by wa_id) for the display name.
  const contact = contacts.find((c) => c.wa_id === from);
  const name = contact?.profile?.name ?? null;

  // Thread = the conversation with this wa_id. wa_id is the E.164 phone (no "+"),
  // stable per customer per business number, so it's both the thread key and the
  // outbound `to`.
  return {
    channel: "whatsapp",
    externalThreadId: from,
    externalId,
    body,
    direction: "inbound",
    sentAt: msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date(),
    participant: {
      externalId: from,
      name,
      phone: from,
    },
  };
}

/**
 * Walk a full webhook payload → a flat list of `ParsedWhatsAppInbound` (each with
 * the `phone_number_id` the route resolves the org by). Pure + total: malformed /
 * empty / non-message payloads simply yield `[]`. Delivery `statuses[]` and
 * non-"messages" change fields are ignored.
 */
export function parseWhatsAppPayload(
  payload: WhatsAppWebhookPayload | null | undefined,
): ParsedWhatsAppInbound[] {
  const out: ParsedWhatsAppInbound[] = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change.field && change.field !== "messages") continue;
      const value = change.value;
      if (!value) continue;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const m of messages) {
        const normalized = normalizeWhatsAppMessage(m, contacts);
        if (!normalized) continue;
        out.push({ phoneNumberId, message: normalized });
      }
    }
  }
  return out;
}

/**
 * Derive a stable idempotency id for the whole delivery — prefer the first
 * message id (so a full replay of the same event collapses to a no-op).
 */
export function whatsappDeliveryId(
  payload: WhatsAppWebhookPayload,
  rawBody: string,
): string {
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const e of entries) {
    for (const c of e.changes ?? []) {
      const id = c.value?.messages?.[0]?.id;
      if (id) return `wamid:${id}`;
    }
  }
  return `raw:${rawBody.length}:${rawBody.slice(0, 32)}`;
}
