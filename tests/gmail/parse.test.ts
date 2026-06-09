import {
  decodeBase64Url,
  extractPlainTextBody,
  type GmailMessage,
  gmailMessageToInbound,
  getHeader,
  parseAddress,
} from "@/lib/gmail/parse";
import { describe, expect, it } from "vitest";

/**
 * Gmail message → normalized inbox message — pure parser tests.
 *
 * Exercises the `users.messages.get` payload → `InboundNormalized` mapping the
 * sync engine hands to `ingestInbound` on channel "email": base64url body
 * decode, header lookup, From parsing, MIME-tree plain-text extraction, and the
 * thread/message dedupe keys + RFC822 Message-Id stash.
 */

function b64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// A realistic multipart/alternative inbound message (text + html parts).
const realisticMessage: GmailMessage = {
  id: "18f0c0ffee123abc",
  threadId: "18f0c0ffee000000",
  internalDate: "1718200000000",
  labelIds: ["INBOX", "UNREAD"],
  snippet: "Hi there, I had a question about my booking",
  payload: {
    mimeType: "multipart/alternative",
    headers: [
      { name: "Delivered-To", value: "ops@acme.com" },
      { name: "From", value: '"Jane Customer" <jane.customer@example.com>' },
      { name: "To", value: "ops@acme.com" },
      { name: "Subject", value: "Question about my booking" },
      { name: "Message-ID", value: "<CABc123=def@mail.example.com>" },
      { name: "Date", value: "Wed, 12 Jun 2024 10:00:00 +0000" },
    ],
    parts: [
      {
        mimeType: "text/plain",
        body: { data: b64url("Hi there,\n\nI had a question about my booking. Thanks!\nJane") },
      },
      {
        mimeType: "text/html",
        body: { data: b64url("<p>Hi there,</p><p>I had a question about my booking.</p>") },
      },
    ],
  },
};

describe("decodeBase64Url", () => {
  it("decodes URL-safe base64 without padding", () => {
    expect(decodeBase64Url(b64url("Hello, world! ✓"))).toBe("Hello, world! ✓");
  });
  it("returns empty string for null/empty", () => {
    expect(decodeBase64Url(null)).toBe("");
    expect(decodeBase64Url(undefined)).toBe("");
  });
});

describe("getHeader", () => {
  it("is case-insensitive", () => {
    const headers = realisticMessage.payload?.headers;
    expect(getHeader(headers, "subject")).toBe("Question about my booking");
    expect(getHeader(headers, "MESSAGE-ID")).toBe("<CABc123=def@mail.example.com>");
  });
  it("returns null when missing", () => {
    expect(getHeader(realisticMessage.payload?.headers, "X-Nope")).toBeNull();
  });
});

describe("parseAddress", () => {
  it("parses display name + angle-bracketed address", () => {
    expect(parseAddress('"Jane Customer" <jane@example.com>')).toEqual({
      name: "Jane Customer",
      email: "jane@example.com",
    });
  });
  it("parses a bare address", () => {
    expect(parseAddress("bob@example.com")).toEqual({ name: null, email: "bob@example.com" });
  });
  it("lowercases the address", () => {
    expect(parseAddress("Jane <Jane@Example.COM>").email).toBe("jane@example.com");
  });
  it("handles null", () => {
    expect(parseAddress(null)).toEqual({ name: null, email: null });
  });
});

describe("extractPlainTextBody", () => {
  it("prefers the text/plain part", () => {
    const body = extractPlainTextBody(realisticMessage.payload);
    expect(body).toContain("I had a question about my booking");
    expect(body).not.toContain("<p>");
  });
  it("falls back to stripped html when no text/plain", () => {
    const body = extractPlainTextBody({
      mimeType: "text/html",
      body: { data: b64url("<div>Hello <b>there</b></div>") },
    });
    expect(body).toBe("Hello there");
  });
});

describe("gmailMessageToInbound", () => {
  it("maps a realistic Gmail message to a normalized inbound email", () => {
    const out = gmailMessageToInbound(realisticMessage);
    expect(out).not.toBeNull();
    if (!out) return;

    expect(out.channel).toBe("email");
    // Thread dedupe = Gmail threadId; message dedupe = Gmail message id.
    expect(out.externalThreadId).toBe("18f0c0ffee000000");
    expect(out.externalId).toBe("18f0c0ffee123abc");
    expect(out.subject).toBe("Question about my booking");
    expect(out.direction).toBe("inbound");
    expect(out.body).toContain("I had a question about my booking");

    expect(out.participant).toMatchObject({
      email: "jane.customer@example.com",
      name: "Jane Customer",
      externalId: "jane.customer@example.com",
    });

    // The original RFC822 Message-Id is stashed for reply threading.
    expect(out.attachments).toMatchObject({
      rfc822MessageId: "<CABc123=def@mail.example.com>",
    });

    // internalDate (epoch ms) → Date.
    expect(out.sentAt?.getTime()).toBe(1718200000000);
  });

  it("falls back to the snippet when no body part decodes", () => {
    const out = gmailMessageToInbound({
      id: "abc",
      threadId: "t1",
      internalDate: "1718200000000",
      snippet: "just a snippet",
      payload: { headers: [{ name: "From", value: "x@y.com" }] },
    });
    expect(out?.body).toBe("just a snippet");
  });

  it("returns null without a Gmail message id", () => {
    expect(gmailMessageToInbound({ threadId: "t1" })).toBeNull();
  });

  it("uses the message id as the thread key when threadId is absent", () => {
    const out = gmailMessageToInbound({ id: "solo123", internalDate: "1" });
    expect(out?.externalThreadId).toBe("solo123");
  });
});
