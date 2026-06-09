/**
 * Gmail message → normalized inbox message (pure, dependency-free).
 *
 * Extracted as a pure module (no `prisma`, no `next`, no network) so the
 * Gmail `users.messages.get` payload → `InboundNormalized` mapping can be
 * unit-tested at the logic level. The sync engine (`lib/gmail/sync.ts`) is a
 * thin shell that fetches messages, hands each raw payload here, and ingests
 * the result on the "email" channel via `ingestInbound`.
 *
 * Reference shape (Gmail API users.messages.get, format=full):
 *   {
 *     id: "<gmailMessageId>",
 *     threadId: "<gmailThreadId>",
 *     internalDate: "1718000000000",   // epoch ms as a string
 *     labelIds: ["INBOX", "UNREAD"],
 *     payload: {
 *       headers: [{ name: "From", value: "Jane <jane@x.com>" }, ...],
 *       mimeType: "text/plain" | "multipart/alternative" | ...,
 *       body: { data: "<base64url>" },
 *       parts: [{ mimeType, body, parts }, ...],
 *     },
 *   }
 */

import type { InboundNormalized } from "@/lib/inbox/ingest";

// ---------------------------------------------------------------------------
// Gmail payload shapes (the relevant subset)
// ---------------------------------------------------------------------------

export interface GmailHeader {
  name?: string;
  value?: string;
}

export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id?: string;
  threadId?: string;
  internalDate?: string; // epoch ms as a string
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePart;
}

// ---------------------------------------------------------------------------
// Header + body helpers
// ---------------------------------------------------------------------------

/** Case-insensitive header lookup over a Gmail part's headers array. */
export function getHeader(
  headers: GmailHeader[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const h of headers) {
    if ((h.name ?? "").toLowerCase() === target) return h.value ?? null;
  }
  return null;
}

/** Decode a Gmail base64url body part to a UTF-8 string. */
export function decodeBase64Url(data: string | undefined | null): string {
  if (!data) return "";
  // Gmail uses URL-safe base64 (- _) and may omit padding.
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

/**
 * Walk the MIME tree and return the best plain-text body. Prefers a
 * `text/plain` part; falls back to stripping tags from `text/html` if that's
 * all that's present. Recurses through multipart containers.
 */
export function extractPlainTextBody(payload: GmailMessagePart | undefined): string {
  if (!payload) return "";

  const plain = findPartByMime(payload, "text/plain");
  if (plain?.body?.data) return decodeBase64Url(plain.body.data).trim();

  const html = findPartByMime(payload, "text/html");
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data)).trim();

  // Single-part message with a top-level body and no parts.
  if (payload.body?.data && (!payload.parts || payload.parts.length === 0)) {
    const decoded = decodeBase64Url(payload.body.data);
    return (payload.mimeType === "text/html" ? stripHtml(decoded) : decoded).trim();
  }

  return "";
}

/** Depth-first search for the first part matching a mime type. */
function findPartByMime(
  part: GmailMessagePart,
  mime: string,
): GmailMessagePart | null {
  if (part.mimeType === mime && part.body?.data) return part;
  if (part.parts) {
    for (const child of part.parts) {
      const found = findPartByMime(child, mime);
      if (found) return found;
    }
  }
  return null;
}

/** Minimal HTML → text fallback (only used when no text/plain part exists). */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|br|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------------------
// From-address parsing
// ---------------------------------------------------------------------------

export interface ParsedAddress {
  name: string | null;
  email: string | null;
}

/**
 * Parse an RFC5322 `From`-style header into a display name + address.
 *   `"Jane Doe" <jane@x.com>`  → { name: "Jane Doe", email: "jane@x.com" }
 *   `jane@x.com`               → { name: null, email: "jane@x.com" }
 */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
  if (!raw) return { name: null, email: null };
  const trimmed = raw.trim();

  const angle = trimmed.match(/^(.*?)<([^>]+)>\s*$/);
  if (angle) {
    const name = (angle[1] ?? "").trim().replace(/^"(.*)"$/, "$1").trim() || null;
    const email = (angle[2] ?? "").trim().toLowerCase() || null;
    return { name, email };
  }

  const bare = trimmed.match(/[^\s<>@]+@[^\s<>@]+/);
  return { name: null, email: bare ? bare[0].toLowerCase() : null };
}

// ---------------------------------------------------------------------------
// Gmail message → InboundNormalized
// ---------------------------------------------------------------------------

/**
 * Map a Gmail `users.messages.get` payload to the inbox's `InboundNormalized`
 * shape on channel "email". Returns null when the message has no Gmail id (the
 * message + thread dedupe keys are required). Pure — never touches the DB.
 *
 * Threading: we use the Gmail `threadId` as the inbox `externalThreadId` so all
 * messages in a Gmail conversation collapse into one inbox thread, and the Gmail
 * `message id` as the per-message idempotency `externalId`.
 */
export function gmailMessageToInbound(msg: GmailMessage): InboundNormalized | null {
  if (!msg.id) return null;

  const headers = msg.payload?.headers;
  const from = parseAddress(getHeader(headers, "From"));
  const subject = getHeader(headers, "Subject");
  const messageIdHeader = getHeader(headers, "Message-ID") ?? getHeader(headers, "Message-Id");

  const body = extractPlainTextBody(msg.payload) || (msg.snippet ?? "");

  const sentAt = gmailInternalDate(msg.internalDate);

  return {
    channel: "email",
    externalThreadId: msg.threadId ?? msg.id,
    externalId: msg.id,
    body,
    direction: "inbound",
    sentAt,
    subject: subject ?? null,
    participant: {
      externalId: from.email,
      name: from.name,
      email: from.email,
    },
    attachments: messageIdHeader ? { rfc822MessageId: messageIdHeader } : undefined,
  };
}

/** Parse Gmail's `internalDate` (epoch ms string) to a Date, or null. */
export function gmailInternalDate(internalDate: string | undefined | null): Date | null {
  if (!internalDate) return null;
  const ms = Number(internalDate);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms);
}
