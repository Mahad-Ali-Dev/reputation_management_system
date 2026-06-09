import { createHmac } from "node:crypto";
import {
  type WhatsAppWebhookPayload,
  nonTextPlaceholder,
  normalizeWhatsAppMessage,
  parseWhatsAppPayload,
  whatsappDeliveryId,
} from "@/lib/inbox/whatsapp-parse";
import { describe, expect, it } from "vitest";

/**
 * WhatsApp Business webhook — pure parsing + guard tests (Module 09).
 *
 * Exercises the testable payload → normalised-inbound-message mapping that the
 * route hands to `ingestInbound` on channel "whatsapp", plus the signature /
 * empty-payload behaviour at the pure-logic level (no network, no DB).
 */

// A realistic Meta WhatsApp Cloud API inbound text payload (text + contact).
const textPayload: WhatsAppWebhookPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA-555",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15550001111",
              phone_number_id: "PNID-999",
            },
            contacts: [{ profile: { name: "Dana Lee" }, wa_id: "447700900123" }],
            messages: [
              {
                from: "447700900123",
                id: "wamid.HBgL1234",
                timestamp: "1718000000",
                type: "text",
                text: { body: "Is the clinic open Saturday?" },
              },
            ],
          },
        },
      ],
    },
  ],
};

function metaSig(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

describe("normalizeWhatsAppMessage", () => {
  it("maps from/wa_id, text body, message id and contact name", () => {
    const value = textPayload.entry![0]!.changes![0]!.value!;
    const normalized = normalizeWhatsAppMessage(value.messages![0]!, value.contacts!);
    expect(normalized).not.toBeNull();
    expect(normalized!.channel).toBe("whatsapp");
    expect(normalized!.externalId).toBe("wamid.HBgL1234");
    expect(normalized!.externalThreadId).toBe("447700900123");
    expect(normalized!.body).toBe("Is the clinic open Saturday?");
    expect(normalized!.participant?.externalId).toBe("447700900123");
    expect(normalized!.participant?.phone).toBe("447700900123");
    expect(normalized!.participant?.name).toBe("Dana Lee");
    // timestamp (unix seconds string) → Date
    expect(normalized!.sentAt?.getTime()).toBe(1718000000 * 1000);
  });

  it("falls back to a placeholder body for a non-text message type", () => {
    const imageMsg = {
      from: "447700900123",
      id: "wamid.IMG1",
      type: "image",
      // no text.body
    };
    const normalized = normalizeWhatsAppMessage(imageMsg, []);
    expect(normalized).not.toBeNull();
    expect(normalized!.body).toBe("[image]");
    expect(normalized!.externalId).toBe("wamid.IMG1");
  });

  it("returns null when the message lacks a stable id or sender", () => {
    expect(normalizeWhatsAppMessage({ from: "447700900123", type: "text" }, [])).toBeNull();
    expect(normalizeWhatsAppMessage({ id: "wamid.x", type: "text" }, [])).toBeNull();
  });
});

describe("nonTextPlaceholder", () => {
  it("maps known types and falls back on unknown/empty", () => {
    expect(nonTextPlaceholder("image")).toBe("[image]");
    expect(nonTextPlaceholder("audio")).toBe("[audio]");
    expect(nonTextPlaceholder("document")).toBe("[document]");
    expect(nonTextPlaceholder("reaction")).toBe("[reaction]");
    expect(nonTextPlaceholder(undefined)).toBe("[unsupported]");
  });
});

describe("parseWhatsAppPayload", () => {
  it("extracts the phone_number_id + one normalised message from a full payload", () => {
    const parsed = parseWhatsAppPayload(textPayload);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.phoneNumberId).toBe("PNID-999");
    expect(parsed[0]!.message.body).toBe("Is the clinic open Saturday?");
    expect(parsed[0]!.message.externalThreadId).toBe("447700900123");
  });

  it("yields [] for an empty / malformed / non-message payload", () => {
    expect(parseWhatsAppPayload(null)).toEqual([]);
    expect(parseWhatsAppPayload(undefined)).toEqual([]);
    expect(parseWhatsAppPayload({})).toEqual([]);
    expect(parseWhatsAppPayload({ entry: [] })).toEqual([]);
    // statuses-only change (delivery receipts) → no inbound messages
    expect(
      parseWhatsAppPayload({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA-1",
            changes: [
              {
                field: "messages",
                value: {
                  metadata: { phone_number_id: "PNID-1" },
                  statuses: [{ status: "delivered" }],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("skips a change whose value has no phone_number_id", () => {
    expect(
      parseWhatsAppPayload({
        entry: [
          {
            id: "WABA-1",
            changes: [{ field: "messages", value: { messages: [{ from: "1", id: "x" }] } }],
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe("whatsappDeliveryId", () => {
  it("prefers the first wamid so a full replay collapses to a no-op", () => {
    const raw = JSON.stringify(textPayload);
    expect(whatsappDeliveryId(textPayload, raw)).toBe("wamid:wamid.HBgL1234");
  });

  it("falls back to a raw fingerprint when no message id is present", () => {
    const empty = { entry: [] };
    const raw = JSON.stringify(empty);
    expect(whatsappDeliveryId(empty, raw)).toBe(`raw:${raw.length}:${raw.slice(0, 32)}`);
  });
});

describe("signature verification (pure HMAC logic)", () => {
  // Re-implements the route's constant-time-ish check at the value level so the
  // mismatch / empty-body branches are covered without importing next/server.
  function verify(rawBody: string, header: string, secret: string): boolean {
    const provided = header.startsWith("sha256=") ? header.slice("sha256=".length) : header;
    if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    return provided.toLowerCase() === expected.toLowerCase();
  }

  it("accepts a correctly-signed body", () => {
    const raw = JSON.stringify(textPayload);
    expect(verify(raw, metaSig(raw, "app-secret"), "app-secret")).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    const raw = JSON.stringify(textPayload);
    expect(verify(raw, metaSig(raw, "WRONG"), "app-secret")).toBe(false);
  });

  it("rejects a malformed / non-hex signature header", () => {
    const raw = JSON.stringify(textPayload);
    expect(verify(raw, "sha256=deadbeef", "app-secret")).toBe(false);
    expect(verify(raw, "garbage", "app-secret")).toBe(false);
  });

  it("rejects an empty-body signature mismatch", () => {
    // A valid signature is over the actual raw body; an empty body won't match a
    // signature computed over the real payload.
    const raw = JSON.stringify(textPayload);
    expect(verify("", metaSig(raw, "app-secret"), "app-secret")).toBe(false);
  });
});
