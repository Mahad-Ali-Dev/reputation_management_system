/**
 * RFC822 MIME builder for Gmail reply sends (pure, dependency-free).
 *
 * Extracted as a pure module so the message construction (headers, threading,
 * base64url raw encoding) is unit-testable without network/DB. `lib/gmail/send.ts`
 * builds the message here, then POSTs the `raw` to Gmail `users.messages.send`.
 *
 * Threading: Gmail groups a sent message into an existing conversation when both
 * the request carries the conversation's `threadId` AND the message has
 * `In-Reply-To` / `References` headers pointing at the original RFC822
 * Message-Id. We set both here; the caller passes `threadId` to the send API.
 */

export interface BuildReplyMimeArgs {
  /** Recipient address. */
  to: string;
  /** Sender address (the connected Gmail mailbox). */
  from: string;
  /** Subject. The caller is responsible for any "Re:" prefixing. */
  subject: string;
  /** Plain-text reply body. */
  text: string;
  /**
   * The original message's RFC822 Message-Id (e.g. "<abc@mail.gmail.com>"), used
   * for In-Reply-To + References so Gmail threads the reply. Optional.
   */
  inReplyTo?: string | null;
  /** Existing References chain to extend (space-separated message ids). Optional. */
  references?: string | null;
}

/** Prefix a subject with "Re:" unless it already has one (case-insensitive). */
export function ensureReplySubject(subject: string | null | undefined): string {
  const s = (subject ?? "").trim();
  if (!s) return "Re:";
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** Normalize a Message-Id to be angle-bracketed (`<id>`), as RFC822 requires. */
export function bracketMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  // Strip CR/LF/control chars first — a Message-Id is echoed into the
  // In-Reply-To/References headers, so an attacker-controlled inbound id could
  // otherwise inject a header break.
  const trimmed = sanitizeHeaderValue(id).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed;
  return `<${trimmed.replace(/^<|>$/g, "")}>`;
}

/**
 * Strip CR/LF (and other control chars) from a single-line header value to
 * prevent header injection — a `\r\n` smuggled through a subject/recipient could
 * otherwise inject extra headers (Bcc:, …) or split the body. RFC5322 unstructured
 * header values are single-line; we collapse any folding/control chars to spaces.
 */
export function sanitizeHeaderValue(value: string): string {
  // Strip CR/LF and all other C0 control chars + DEL, collapse runs, trim. This
  // neutralises header injection while leaving printable characters intact.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1F\x7F]+/g, " ").replace(/ {2,}/g, " ").trim();
}

/**
 * Encode a header value that may contain non-ASCII as an RFC2047 "encoded-word"
 * (UTF-8, base64). ASCII-only values pass through unchanged. CR/LF/control chars
 * are stripped first so an ASCII value can never inject a header break.
 */
export function encodeHeaderValue(value: string): string {
  const safe = sanitizeHeaderValue(value);
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(safe)) return safe;
  const b64 = Buffer.from(safe, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

/**
 * Build a complete RFC822 message string for a plain-text reply.
 * Returns the raw MIME (CRLF line endings) — NOT yet base64url-encoded.
 */
export function buildReplyMime(args: BuildReplyMimeArgs): string {
  const inReplyTo = bracketMessageId(args.inReplyTo);
  const references = buildReferences(args.references, inReplyTo);

  const headers: string[] = [
    // Sanitize address headers too: a CR/LF smuggled through `to`/`from` would
    // otherwise inject arbitrary headers (Bcc:, …) or split the body.
    `From: ${sanitizeHeaderValue(args.from)}`,
    `To: ${sanitizeHeaderValue(args.to)}`,
    `Subject: ${encodeHeaderValue(args.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
  ];
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  // RFC822 wants CRLF line breaks; normalize the body's newlines too.
  const body = args.text.replace(/\r?\n/g, "\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

/** Merge an existing References chain with the In-Reply-To id (de-duplicated). */
export function buildReferences(
  existing: string | null | undefined,
  inReplyTo: string | null,
): string | null {
  const ids = new Set<string>();
  if (existing) {
    for (const part of existing.split(/\s+/)) {
      const b = bracketMessageId(part);
      if (b) ids.add(b);
    }
  }
  if (inReplyTo) ids.add(inReplyTo);
  if (ids.size === 0) return null;
  return Array.from(ids).join(" ");
}

/**
 * Build the base64url-encoded `raw` payload Gmail `users.messages.send` expects.
 */
export function buildRawMessage(args: BuildReplyMimeArgs): string {
  return toBase64Url(buildReplyMime(args));
}

/** RFC4648 base64url (no padding) — Gmail's `raw` field format. */
export function toBase64Url(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
