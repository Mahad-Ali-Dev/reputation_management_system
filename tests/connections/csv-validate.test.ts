import { describe, expect, it } from "vitest";

/**
 * CSV header-validation tests (pure validator). Asserts the rule:
 * header must carry a Name column AND at least one of {Email, Phone}, with
 * common alias detection.
 */

import { validateCsvHeader } from "@/lib/connections/csv-validate";

describe("validateCsvHeader — happy paths", () => {
  it("accepts Name + Email", () => {
    const r = validateCsvHeader(["Name", "Email"]);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.columns.map((c) => c.kind)).toEqual(["name", "email"]);
  });

  it("accepts Name + Phone", () => {
    const r = validateCsvHeader(["Full Name", "Phone"]);
    expect(r.ok).toBe(true);
    expect(r.columns.map((c) => c.kind).sort()).toEqual(["name", "phone"]);
  });

  it("accepts First + Last name in lieu of a single Name column", () => {
    const r = validateCsvHeader(["First Name", "Last Name", "E-mail"]);
    expect(r.ok).toBe(true);
    const kinds = r.columns.map((c) => c.kind);
    expect(kinds).toContain("firstName");
    expect(kinds).toContain("lastName");
    expect(kinds).toContain("email");
  });

  it("accepts a single string header (comma-split convenience)", () => {
    const r = validateCsvHeader("name,phone");
    expect(r.ok).toBe(true);
  });
});

describe("validateCsvHeader — alias detection", () => {
  it("recognizes e-mail / mobile / tel aliases", () => {
    expect(validateCsvHeader(["Contact", "E-Mail"]).ok).toBe(true);
    expect(validateCsvHeader(["Customer Name", "Mobile"]).ok).toBe(true);
    expect(validateCsvHeader(["Name", "Tel"]).ok).toBe(true);
  });

  it("recognizes compound/noisy headers via token hints", () => {
    const r = validateCsvHeader(["Customer Name", "Email Address", "Mobile Phone"]);
    expect(r.ok).toBe(true);
    const kinds = r.columns.map((c) => c.kind);
    expect(kinds).toContain("email");
    expect(kinds).toContain("phone");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(validateCsvHeader(["  NAME  ", "  email  "]).ok).toBe(true);
  });

  it("classifies 'first name' as firstName, not the generic name", () => {
    const r = validateCsvHeader(["First Name", "Email"]);
    const first = r.columns.find((c) => c.header.toLowerCase() === "first name");
    expect(first?.kind).toBe("firstName");
  });
});

describe("validateCsvHeader — rejections", () => {
  it("rejects a header with a name but no email/phone", () => {
    const r = validateCsvHeader(["Name", "City", "Notes"]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Email or Phone/i);
  });

  it("rejects a header with a contact column but no name", () => {
    const r = validateCsvHeader(["Email", "Notes"]);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Name/i);
  });

  it("rejects an empty header row", () => {
    expect(validateCsvHeader([]).ok).toBe(false);
    expect(validateCsvHeader(["", "  "]).ok).toBe(false);
    expect(validateCsvHeader([]).errors.join(" ")).toMatch(/no header/i);
  });

  it("reports both missing-name and missing-contact errors", () => {
    const r = validateCsvHeader(["City", "Notes"]);
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
  });

  it("returns the recognized columns even when invalid", () => {
    const r = validateCsvHeader(["Name", "City"]);
    expect(r.ok).toBe(false);
    expect(r.columns).toContainEqual({ header: "Name", index: 0, kind: "name" });
  });
});

describe("validateCsvHeader — index tracking", () => {
  it("records zero-based column indexes", () => {
    const r = validateCsvHeader(["City", "Name", "Email"]);
    expect(r.columns).toContainEqual({ header: "Name", index: 1, kind: "name" });
    expect(r.columns).toContainEqual({ header: "Email", index: 2, kind: "email" });
  });
});
