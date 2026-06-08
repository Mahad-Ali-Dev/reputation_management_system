/**
 * CSV import — parse + column-mapping + dedupe (module 12, Wave 3b).
 *
 * Pure / sync functions (no DB, no app imports beyond the shared CSV splitter)
 * so they unit-test trivially and can run client-side for the preview step. The
 * server-action wrapper (`importContactsMapped` in actions.ts) calls
 * `dedupeAgainstExisting` with DB rows + `createMany`.
 *
 * AC: ≤ 10,000 rows; dedupe on email then phone (within-file AND against
 * existing); invalid email/phone rows are flagged, not inserted.
 */

import { splitCsvLine } from "@/lib/outreach/bulk";

export const MAX_IMPORT_ROWS = 10_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;

/** A field the importer can map a CSV column onto. */
export type ImportField = "name" | "firstName" | "lastName" | "email" | "phone" | "companyName" | "tags" | "custom";

/** Mapping from a CSV column index to a target field (custom carries the key). */
export interface ColumnMapping {
  /** Column header index → target field. */
  index: number;
  field: ImportField;
  /** For `custom`, the custom-field key to store under. */
  customKey?: string;
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  /** True when the row count was clamped to MAX_IMPORT_ROWS. */
  truncated: boolean;
}

/**
 * Parse a raw CSV string into headers + rows. Always treats the first non-empty
 * line as a header row. Caps data rows at MAX_IMPORT_ROWS (AC) and reports
 * truncation. Tolerant of CRLF + blank lines.
 */
export function parseImportCsv(text: string): ParsedCsv {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [], truncated: false };

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim());
  const dataLines = lines.slice(1);
  const truncated = dataLines.length > MAX_IMPORT_ROWS;
  const capped = truncated ? dataLines.slice(0, MAX_IMPORT_ROWS) : dataLines;
  const rows = capped.map((l) => splitCsvLine(l).map((c) => c.trim()));

  return { headers, rows, truncated };
}

/**
 * Best-effort auto-mapping of headers → fields by common header names. The UI
 * can present this as the default mapping the user then adjusts.
 */
export function autoMap(headers: string[]): ColumnMapping[] {
  const out: ColumnMapping[] = [];
  headers.forEach((h, index) => {
    const k = h.trim().toLowerCase();
    if (["name", "full name", "fullname", "contact"].includes(k)) out.push({ index, field: "name" });
    else if (["first name", "firstname", "first"].includes(k)) out.push({ index, field: "firstName" });
    else if (["last name", "lastname", "last", "surname"].includes(k)) out.push({ index, field: "lastName" });
    else if (["email", "e-mail", "email address"].includes(k)) out.push({ index, field: "email" });
    else if (["phone", "tel", "mobile", "phone number", "telephone"].includes(k)) out.push({ index, field: "phone" });
    else if (["company", "company name", "business", "organization"].includes(k)) out.push({ index, field: "companyName" });
    else if (["tags", "tag", "labels"].includes(k)) out.push({ index, field: "tags" });
  });
  return out;
}

/** A normalized contact record produced from a mapped CSV row. */
export interface ImportRecord {
  rowNumber: number;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  tags: string[];
  customFields: { key: string; value: string }[];
}

export interface InvalidRow {
  rowNumber: number;
  reason: string;
}

export interface MappedRows {
  records: ImportRecord[];
  invalid: InvalidRow[];
  /** Within-file duplicates dropped (after the first occurrence). */
  duplicatesInFile: number;
}

/** Lowercase+trim email; null if not a valid address. */
function cleanEmail(v: string | undefined): string | null {
  if (!v) return null;
  const e = v.trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

/** Normalize a phone toward E.164; null when invalid. */
function cleanPhone(v: string | undefined): string | null {
  if (!v) return null;
  const p = v.replace(/[\s\-().]/g, "");
  if (PHONE_RE.test(p)) return p;
  if (/^00[1-9][0-9]{6,14}$/.test(p)) {
    const plus = `+${p.slice(2)}`;
    if (PHONE_RE.test(plus)) return plus;
  }
  return null;
}

/**
 * Apply a column mapping to parsed rows → normalized records, flagging invalid
 * rows and dropping within-file duplicates (email first, then phone). A row with
 * neither a valid email nor a valid phone is invalid (we need a dedupe key + a
 * way to reach them). A row whose mapped email/phone cell is present but
 * malformed is flagged as invalid rather than silently dropped.
 */
export function applyMapping(parsed: ParsedCsv, mapping: ColumnMapping[]): MappedRows {
  const records: ImportRecord[] = [];
  const invalid: InvalidRow[] = [];
  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  let duplicatesInFile = 0;

  parsed.rows.forEach((cells, i) => {
    const rowNumber = i + 2; // +1 for header, +1 for 1-based
    const rec: ImportRecord = {
      rowNumber,
      name: null,
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      companyName: null,
      tags: [],
      customFields: [],
    };

    let rawEmailPresent = false;
    let rawPhonePresent = false;
    let emailValid = true;
    let phoneValid = true;

    for (const m of mapping) {
      const raw = (cells[m.index] ?? "").trim();
      switch (m.field) {
        case "name":
          rec.name = raw || null;
          break;
        case "firstName":
          rec.firstName = raw || null;
          break;
        case "lastName":
          rec.lastName = raw || null;
          break;
        case "companyName":
          rec.companyName = raw || null;
          break;
        case "email": {
          if (raw) {
            rawEmailPresent = true;
            const e = cleanEmail(raw);
            if (e) rec.email = e;
            else emailValid = false;
          }
          break;
        }
        case "phone": {
          if (raw) {
            rawPhonePresent = true;
            const p = cleanPhone(raw);
            if (p) rec.phone = p;
            else phoneValid = false;
          }
          break;
        }
        case "tags": {
          if (raw) {
            rec.tags = raw
              .split(/[;,|]/)
              .map((t) => t.trim().toLowerCase())
              .filter((t) => t.length > 0);
          }
          break;
        }
        case "custom": {
          if (m.customKey && raw) rec.customFields.push({ key: m.customKey, value: raw });
          break;
        }
      }
    }

    // A present-but-malformed identifier is a hard validation error.
    if (rawEmailPresent && !emailValid) {
      invalid.push({ rowNumber, reason: "invalid_email" });
      return;
    }
    if (rawPhonePresent && !phoneValid) {
      invalid.push({ rowNumber, reason: "invalid_phone" });
      return;
    }
    // Need at least one usable identifier.
    if (!rec.email && !rec.phone) {
      invalid.push({ rowNumber, reason: "no_email_or_phone" });
      return;
    }

    // Within-file dedupe: email first, then phone.
    if (rec.email && seenEmail.has(rec.email)) {
      duplicatesInFile++;
      return;
    }
    if (rec.phone && seenPhone.has(rec.phone)) {
      duplicatesInFile++;
      return;
    }
    if (rec.email) seenEmail.add(rec.email);
    if (rec.phone) seenPhone.add(rec.phone);

    // If a free-form name wasn't mapped but first/last were, synthesize one.
    if (!rec.name && (rec.firstName || rec.lastName)) {
      rec.name = [rec.firstName, rec.lastName].filter(Boolean).join(" ") || null;
    }

    records.push(rec);
  });

  return { records, invalid, duplicatesInFile };
}

export interface DedupeResult {
  toCreate: ImportRecord[];
  /** Records that matched an existing contact by email or phone. */
  duplicates: ImportRecord[];
}

/**
 * Split mapped records into new-vs-existing against the org's known
 * emails/phones (passed in by the server action after a tenant read). Pure so it
 * unit-tests without a DB.
 */
export function dedupeAgainstExisting(
  records: ImportRecord[],
  existing: { emails: Iterable<string>; phones: Iterable<string> },
): DedupeResult {
  const existingEmails = new Set([...existing.emails].map((e) => e.toLowerCase()));
  const existingPhones = new Set(existing.phones);
  const toCreate: ImportRecord[] = [];
  const duplicates: ImportRecord[] = [];

  for (const r of records) {
    const dupByEmail = r.email != null && existingEmails.has(r.email);
    const dupByPhone = r.phone != null && existingPhones.has(r.phone);
    if (dupByEmail || dupByPhone) duplicates.push(r);
    else toCreate.push(r);
  }
  return { toCreate, duplicates };
}
