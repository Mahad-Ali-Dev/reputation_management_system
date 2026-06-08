import { describe, expect, it } from "vitest";

/**
 * CSV-export unit tests (Module 12, Wave 3b).
 *
 * Under test (AC: CSV export is valid): RFC-4180 quoting/escaping (commas,
 * quotes, newlines), formula-injection neutralization, header row + column
 * order, empty input → header-only, and the xlsx → csv fallback flag.
 */

import {
  CONTACT_EXPORT_HEADER,
  buildContactsExport,
  formatContactsCsv,
  formatCsv,
  neutralizeCell,
  toDataUrl,
} from "@/lib/contacts/export";
import type { ContactListItem } from "@/lib/contacts/queries";

function contact(over: Partial<ContactListItem> = {}): ContactListItem {
  return {
    id: "c1",
    name: "Ada Lovelace",
    firstName: "Ada",
    lastName: "Lovelace",
    companyName: "Analytical Engines",
    email: "ada@x.com",
    phone: "+15551234567",
    source: "manual",
    tags: ["vip", "loyal"],
    vip: true,
    lastActivityAt: new Date("2026-01-02T03:04:05.000Z"),
    lastContactedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...over,
  };
}

describe("formatCsv RFC-4180", () => {
  it("quotes fields with commas, quotes, and newlines", () => {
    const csv = formatCsv(["a", "b", "c"], [["x,y", 'he said "hi"', "line1\nline2"]]);
    const dataLine = csv.split("\r\n")[1]!;
    expect(dataLine).toBe('"x,y","he said ""hi""","line1\nline2"');
  });

  it("uses CRLF line endings + a header row", () => {
    const csv = formatCsv(["h1", "h2"], [["1", "2"]]);
    expect(csv).toBe("h1,h2\r\n1,2");
  });
});

describe("formula-injection defense", () => {
  it("prefixes a leading = + - @ with a single quote", () => {
    expect(neutralizeCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(neutralizeCell("+1")).toBe("'+1");
    expect(neutralizeCell("-2")).toBe("'-2");
    expect(neutralizeCell("@cmd")).toBe("'@cmd");
    expect(neutralizeCell("safe")).toBe("safe");
  });
});

describe("formatContactsCsv", () => {
  it("emits the header in the documented column order", () => {
    const csv = formatContactsCsv([]);
    expect(csv).toBe(CONTACT_EXPORT_HEADER.join(","));
  });

  it("empty input → header-only (still a valid file)", () => {
    const csv = formatContactsCsv([]);
    expect(csv.split("\r\n")).toHaveLength(1);
  });

  it("serializes a contact row in column order with mapped source label + joined tags", () => {
    const csv = formatContactsCsv([contact()]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    const cells = lines[1]!.split(",");
    expect(cells[0]).toBe("Ada Lovelace"); // Name
    expect(cells[3]).toBe("ada@x.com"); // Email
    expect(cells[6]).toBe("Manual Entry"); // Source label
    expect(cells[7]).toBe("vip; loyal"); // Tags joined
    expect(cells[8]).toBe("yes"); // VIP
  });
});

describe("buildContactsExport + toDataUrl", () => {
  it("csv format → no fallback, csv mime", () => {
    const exp = buildContactsExport([contact()], "csv");
    expect(exp.xlsxFallback).toBe(false);
    expect(exp.mimeType).toContain("text/csv");
    expect(exp.filename).toMatch(/^contacts-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("xlsx format → falls back to csv with the flag set", () => {
    const exp = buildContactsExport([contact()], "xlsx");
    expect(exp.xlsxFallback).toBe(true);
    expect(exp.filename).toMatch(/\.csv$/);
  });

  it("toDataUrl round-trips the content as base64", () => {
    const exp = buildContactsExport([], "csv");
    const url = toDataUrl(exp);
    expect(url.startsWith("data:text/csv;charset=utf-8;base64,")).toBe(true);
    const b64 = url.split(",")[1]!;
    expect(Buffer.from(b64, "base64").toString("utf-8")).toBe(exp.content);
  });
});
