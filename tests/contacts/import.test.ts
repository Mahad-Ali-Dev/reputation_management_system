import { describe, expect, it } from "vitest";

/**
 * CSV-import unit tests (Module 12, Wave 3b).
 *
 * Under test (AC): header parse + column mapping → normalized records; dedupe on
 * email then phone (within-file + against existing); 10k-row cap; invalid
 * email/phone rows are flagged, not inserted.
 */

import {
  MAX_IMPORT_ROWS,
  applyMapping,
  autoMap,
  dedupeAgainstExisting,
  parseImportCsv,
  type ColumnMapping,
} from "@/lib/contacts/import";

describe("parseImportCsv", () => {
  it("parses header + rows and handles CRLF + blanks", () => {
    const csv = "name,email\r\nAda,ada@x.com\r\n\r\nGrace,grace@y.com\r\n";
    const out = parseImportCsv(csv);
    expect(out.headers).toEqual(["name", "email"]);
    expect(out.rows).toEqual([
      ["Ada", "ada@x.com"],
      ["Grace", "grace@y.com"],
    ]);
    expect(out.truncated).toBe(false);
  });

  it("caps at MAX_IMPORT_ROWS and reports truncation", () => {
    const header = "email\n";
    const body = Array.from({ length: MAX_IMPORT_ROWS + 25 }, (_, i) => `u${i}@x.com`).join("\n");
    const out = parseImportCsv(header + body);
    expect(out.rows.length).toBe(MAX_IMPORT_ROWS);
    expect(out.truncated).toBe(true);
  });

  it("empty input → empty parse", () => {
    expect(parseImportCsv("")).toEqual({ headers: [], rows: [], truncated: false });
  });
});

describe("autoMap", () => {
  it("maps common headers to fields", () => {
    const m = autoMap(["Full Name", "Email Address", "Phone", "Company"]);
    expect(m).toContainEqual({ index: 0, field: "name" });
    expect(m).toContainEqual({ index: 1, field: "email" });
    expect(m).toContainEqual({ index: 2, field: "phone" });
    expect(m).toContainEqual({ index: 3, field: "companyName" });
  });
});

describe("applyMapping", () => {
  const mapping: ColumnMapping[] = [
    { index: 0, field: "name" },
    { index: 1, field: "email" },
    { index: 2, field: "phone" },
    { index: 3, field: "tags" },
  ];

  it("normalizes records (lowercases email, E.164 phone, splits tags)", () => {
    const parsed = parseImportCsv("name,email,phone,tags\nAda,ADA@X.com,+1 555-123-4567,vip;loyal\n");
    const { records, invalid } = applyMapping(parsed, mapping);
    expect(invalid).toHaveLength(0);
    expect(records[0]).toMatchObject({
      name: "Ada",
      email: "ada@x.com",
      phone: "+15551234567",
      tags: ["vip", "loyal"],
    });
  });

  it("flags a malformed email row as invalid (not inserted)", () => {
    const parsed = parseImportCsv("name,email,phone,tags\nBad,not-an-email,,\n");
    const { records, invalid } = applyMapping(parsed, mapping);
    expect(records).toHaveLength(0);
    expect(invalid[0]).toMatchObject({ reason: "invalid_email" });
  });

  it("flags a malformed phone row as invalid", () => {
    const parsed = parseImportCsv("name,email,phone,tags\nBad,,555-1234,\n");
    const { records, invalid } = applyMapping(parsed, mapping);
    expect(records).toHaveLength(0);
    expect(invalid[0]).toMatchObject({ reason: "invalid_phone" });
  });

  it("rejects a row with neither email nor phone", () => {
    const parsed = parseImportCsv("name,email,phone,tags\nNoContact,,,\n");
    const { records, invalid } = applyMapping(parsed, mapping);
    expect(records).toHaveLength(0);
    expect(invalid[0]).toMatchObject({ reason: "no_email_or_phone" });
  });

  it("drops within-file duplicates on email then phone", () => {
    const parsed = parseImportCsv(
      "name,email,phone,tags\nA,dup@x.com,,\nB,dup@x.com,,\nC,,+15551112222,\nD,,+15551112222,\n",
    );
    const { records, duplicatesInFile } = applyMapping(parsed, mapping);
    expect(records.map((r) => r.name)).toEqual(["A", "C"]);
    expect(duplicatesInFile).toBe(2);
  });

  it("synthesizes a name from first/last when name is unmapped", () => {
    const m: ColumnMapping[] = [
      { index: 0, field: "firstName" },
      { index: 1, field: "lastName" },
      { index: 2, field: "email" },
    ];
    const parsed = parseImportCsv("first,last,email\nAda,Lovelace,ada@x.com\n");
    const { records } = applyMapping(parsed, m);
    expect(records[0]!.name).toBe("Ada Lovelace");
  });

  it("maps custom columns under their key", () => {
    const m: ColumnMapping[] = [
      { index: 0, field: "email" },
      { index: 1, field: "custom", customKey: "Loyalty Tier" },
    ];
    const parsed = parseImportCsv("email,tier\nada@x.com,Gold\n");
    const { records } = applyMapping(parsed, m);
    expect(records[0]!.customFields).toEqual([{ key: "Loyalty Tier", value: "Gold" }]);
  });
});

describe("dedupeAgainstExisting", () => {
  it("splits records into new vs existing by email then phone", () => {
    const records = [
      { rowNumber: 2, name: "A", firstName: null, lastName: null, email: "a@x.com", phone: null, companyName: null, tags: [], customFields: [] },
      { rowNumber: 3, name: "B", firstName: null, lastName: null, email: "b@x.com", phone: null, companyName: null, tags: [], customFields: [] },
      { rowNumber: 4, name: "C", firstName: null, lastName: null, email: null, phone: "+15551112222", companyName: null, tags: [], customFields: [] },
    ];
    const { toCreate, duplicates } = dedupeAgainstExisting(records, {
      emails: ["A@X.com"], // case-insensitive match
      phones: ["+15551112222"],
    });
    expect(toCreate.map((r) => r.name)).toEqual(["B"]);
    expect(duplicates.map((r) => r.name).sort()).toEqual(["A", "C"]);
  });
});
