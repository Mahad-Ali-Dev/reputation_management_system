import { describe, it, expect } from "vitest";
import { parseRecipientsCsv, splitCsvLine, MAX_ROWS } from "@/lib/outreach/bulk";

describe("splitCsvLine", () => {
  it("splits a plain comma line", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("preserves commas inside double-quotes", () => {
    expect(splitCsvLine(`"Smith, John",alice@example.com`)).toEqual([
      "Smith, John",
      "alice@example.com",
    ]);
  });

  it("handles escaped quotes", () => {
    expect(splitCsvLine(`"he said ""hi""",ok`)).toEqual([`he said "hi"`, "ok"]);
  });

  it("handles empty fields", () => {
    expect(splitCsvLine(",,b")).toEqual(["", "", "b"]);
  });
});

describe("parseRecipientsCsv — phone", () => {
  it("accepts valid E.164", () => {
    const { rows, invalid } = parseRecipientsCsv({
      csvText: "+15551234567\n+447700900123",
      channel: "sms",
    });
    expect(rows.map((r) => r.recipient)).toEqual(["+15551234567", "+447700900123"]);
    expect(invalid).toHaveLength(0);
  });

  it("normalizes phone numbers (strips dashes, spaces, parens)", () => {
    const { rows } = parseRecipientsCsv({
      csvText: "(555) 123-4567",
      channel: "sms",
    });
    // (555) is missing the + so it should be invalid since it must be E.164
    expect(rows).toHaveLength(0);
  });

  it("normalizes when + is present", () => {
    const { rows } = parseRecipientsCsv({
      csvText: "+1 (555) 123-4567",
      channel: "sms",
    });
    expect(rows[0]?.recipient).toBe("+15551234567");
  });

  it("rejects non-E.164 phone formats", () => {
    const { rows, invalid } = parseRecipientsCsv({
      csvText: "555-1234\n12345\n+0123456789",
      channel: "sms",
    });
    expect(rows).toHaveLength(0);
    expect(invalid).toHaveLength(3);
    expect(invalid[0]?.reason).toBe("invalid_phone_format_must_be_E164");
  });

  it("dedupes within a batch", () => {
    const { rows, duplicates } = parseRecipientsCsv({
      csvText: "+15551234567\n+15551234567\n+15559876543",
      channel: "sms",
    });
    expect(rows).toHaveLength(2);
    expect(duplicates).toHaveLength(1);
  });

  it("detects header row and skips it", () => {
    const { rows } = parseRecipientsCsv({
      csvText: "phone,name\n+15551234567,Alice\n+15559876543,Bob",
      channel: "sms",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.recipientName).toBe("Alice");
  });
});

describe("parseRecipientsCsv — email", () => {
  it("accepts valid emails + lowercases", () => {
    const { rows } = parseRecipientsCsv({
      csvText: "Alice@Example.COM\nbob@example.com",
      channel: "email",
    });
    expect(rows.map((r) => r.recipient)).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
  });

  it("rejects invalid email formats", () => {
    const { rows, invalid } = parseRecipientsCsv({
      csvText: "not-an-email\n@missing-local.com\nstill@bad",
      channel: "email",
    });
    expect(rows).toHaveLength(0);
    expect(invalid).toHaveLength(3);
  });

  it("supports recipient,name CSV format", () => {
    const { rows } = parseRecipientsCsv({
      csvText: `email,name\nalice@example.com,Alice Smith\nbob@example.com,"Jones, Bob"`,
      channel: "email",
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]?.recipientName).toBe("Jones, Bob");
  });

  it("caps at MAX_ROWS", () => {
    const lines = Array.from({ length: MAX_ROWS + 200 }, (_, i) => `user${i}@example.com`);
    const { rows } = parseRecipientsCsv({
      csvText: lines.join("\n"),
      channel: "email",
    });
    expect(rows.length).toBe(MAX_ROWS);
  });

  it("ignores empty lines + whitespace", () => {
    const { rows } = parseRecipientsCsv({
      csvText: "\n\n  alice@example.com  \n   \n\nbob@example.com\n",
      channel: "email",
    });
    expect(rows).toHaveLength(2);
  });
});
