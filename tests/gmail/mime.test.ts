import {
  bracketMessageId,
  buildRawMessage,
  buildReferences,
  buildReplyMime,
  encodeHeaderValue,
  ensureReplySubject,
  toBase64Url,
} from "@/lib/gmail/mime";
import { describe, expect, it } from "vitest";

/**
 * Gmail reply MIME builder — pure construction tests.
 *
 * Asserts the RFC822 reply the send path POSTs to `users.messages.send`:
 * headers, In-Reply-To/References threading, UTF-8 subject encoding, and the
 * base64url `raw` round-trip.
 */

function fromBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

describe("ensureReplySubject", () => {
  it('prefixes "Re:" when absent', () => {
    expect(ensureReplySubject("Question about my booking")).toBe("Re: Question about my booking");
  });
  it("does not double-prefix", () => {
    expect(ensureReplySubject("Re: already a reply")).toBe("Re: already a reply");
    expect(ensureReplySubject("RE: shouty")).toBe("RE: shouty");
  });
  it("handles empty/null", () => {
    expect(ensureReplySubject(null)).toBe("Re:");
  });
});

describe("bracketMessageId", () => {
  it("adds angle brackets when missing", () => {
    expect(bracketMessageId("abc@mail")).toBe("<abc@mail>");
  });
  it("keeps existing brackets", () => {
    expect(bracketMessageId("<abc@mail>")).toBe("<abc@mail>");
  });
  it("returns null for empty", () => {
    expect(bracketMessageId(null)).toBeNull();
    expect(bracketMessageId("  ")).toBeNull();
  });
});

describe("buildReferences", () => {
  it("merges existing chain with in-reply-to, de-duplicated", () => {
    expect(buildReferences("<a@m> <b@m>", "<b@m>")).toBe("<a@m> <b@m>");
    expect(buildReferences("<a@m>", "<c@m>")).toBe("<a@m> <c@m>");
  });
  it("returns null when nothing present", () => {
    expect(buildReferences(null, null)).toBeNull();
  });
});

describe("encodeHeaderValue", () => {
  it("passes ASCII through unchanged", () => {
    expect(encodeHeaderValue("Re: hello")).toBe("Re: hello");
  });
  it("RFC2047-encodes non-ASCII", () => {
    const enc = encodeHeaderValue("Café ☕");
    expect(enc.startsWith("=?UTF-8?B?")).toBe(true);
    expect(enc.endsWith("?=")).toBe(true);
  });
});

describe("buildReplyMime", () => {
  it("builds a threaded plain-text reply with In-Reply-To + References", () => {
    const mime = buildReplyMime({
      to: "jane@example.com",
      from: "ops@acme.com",
      subject: "Re: Question about my booking",
      text: "Hi Jane,\n\nHappy to help!",
      inReplyTo: "CABc123=def@mail.example.com", // bare id → should be bracketed
      references: "<older@mail.example.com>",
    });

    expect(mime).toContain("From: ops@acme.com");
    expect(mime).toContain("To: jane@example.com");
    expect(mime).toContain("Subject: Re: Question about my booking");
    expect(mime).toContain('Content-Type: text/plain; charset="UTF-8"');
    // Threading headers — In-Reply-To bracketed, References extends the chain.
    expect(mime).toContain("In-Reply-To: <CABc123=def@mail.example.com>");
    expect(mime).toContain(
      "References: <older@mail.example.com> <CABc123=def@mail.example.com>",
    );
    // CRLF line endings + header/body separation.
    expect(mime).toContain("\r\n\r\nHi Jane,\r\n\r\nHappy to help!");
  });

  it("omits threading headers when no inReplyTo/references", () => {
    const mime = buildReplyMime({
      to: "a@b.com",
      from: "me@x.com",
      subject: "Hello",
      text: "hi",
    });
    expect(mime).not.toContain("In-Reply-To:");
    expect(mime).not.toContain("References:");
  });
});

describe("buildRawMessage / base64url", () => {
  it("produces a base64url string that round-trips to the MIME", () => {
    const args = {
      to: "jane@example.com",
      from: "ops@acme.com",
      subject: "Re: hi",
      text: "body",
      inReplyTo: "<x@y>",
    };
    const raw = buildRawMessage(args);
    // base64url has no +, /, or = padding.
    expect(raw).not.toMatch(/[+/=]/);
    const decoded = fromBase64Url(raw);
    expect(decoded).toBe(buildReplyMime(args));
    expect(decoded).toContain("In-Reply-To: <x@y>");
  });

  it("toBase64Url is URL-safe", () => {
    expect(toBase64Url(">>>>")).not.toMatch(/[+/=]/);
  });
});
