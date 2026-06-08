/**
 * Contacts → CSV/XLSX export (module 12, Wave 3b).
 *
 * `formatContactsCsv` is a pure RFC-4180 builder (unit-tested without a DB):
 *  - fields containing comma, double-quote, CR or LF are wrapped in double
 *    quotes; inner double-quotes are doubled.
 *  - CSV-INJECTION DEFENSE: a cell whose first char is `= + - @ \t \r` is
 *    prefixed with a single quote so spreadsheet apps don't execute it as a
 *    formula (applied BEFORE quoting). Mirrors `lib/surveys/export.ts`.
 *
 * XLSX: the repo has no spreadsheet writer and the unattended build must not add
 * a heavy dependency, so `buildContactsExport({format:"xlsx"})` falls back to
 * CSV bytes with the `.csv` extension and an `xlsxFallback:true` flag — CSV is
 * the AC-critical, always-valid format. (Swap in a real xlsx writer later
 * without changing call sites.)
 */

import type { ContactListItem } from "./queries";
import { getContactSourceMeta } from "./source-meta";

const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** Neutralize a value that a spreadsheet might interpret as a formula. */
export function neutralizeCell(raw: string): string {
  if (raw.length > 0 && FORMULA_TRIGGERS.has(raw[0] as string)) {
    return `'${raw}`;
  }
  return raw;
}

/** Quote a single field per RFC-4180 (after formula-neutralization). */
function quoteField(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  const safe = neutralizeCell(s);
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** Pure CSV serializer: header + rows → one CSV string with CRLF line endings. */
export function formatCsv(
  header: string[],
  rows: Array<Array<string | number | null | undefined>>,
): string {
  const lines = [header.map(quoteField).join(",")];
  for (const row of rows) {
    lines.push(row.map(quoteField).join(","));
  }
  return lines.join("\r\n");
}

/** The export column order. Stable so downstream re-imports line up. */
export const CONTACT_EXPORT_HEADER = [
  "Name",
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Company",
  "Source",
  "Tags",
  "VIP",
  "Last Activity",
  "Created At",
] as const;

/** Map one contact row to the export column order. */
export function contactToRow(c: ContactListItem): Array<string | number | null | undefined> {
  return [
    c.name ?? "",
    c.firstName ?? "",
    c.lastName ?? "",
    c.email ?? "",
    c.phone ?? "",
    c.companyName ?? "",
    getContactSourceMeta(c.source).label,
    (c.tags ?? []).join("; "),
    c.vip ? "yes" : "no",
    c.lastActivityAt ? c.lastActivityAt.toISOString() : "",
    c.createdAt ? c.createdAt.toISOString() : "",
  ];
}

/**
 * Build a CSV string for a list of contacts. Empty input → header-only (AC). The
 * header always renders so an empty export is still a valid file.
 */
export function formatContactsCsv(contacts: ContactListItem[]): string {
  return formatCsv([...CONTACT_EXPORT_HEADER], contacts.map(contactToRow));
}

export type ContactExportFormat = "csv" | "xlsx";

export interface ContactExport {
  filename: string;
  mimeType: string;
  /** UTF-8 string content (CSV). For xlsx we currently emit CSV bytes. */
  content: string;
  /** True when an xlsx export fell back to CSV (no writer in the repo). */
  xlsxFallback: boolean;
}

/** Slugify a label for the export filename. */
function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Produce a downloadable export descriptor. CSV is native; XLSX falls back to
 * CSV with a flag (see file header). Pure — the server action wraps the content
 * into a data-URL / blob for the browser.
 */
export function buildContactsExport(
  contacts: ContactListItem[],
  format: ContactExportFormat = "csv",
): ContactExport {
  const csv = formatContactsCsv(contacts);
  if (format === "xlsx") {
    // No xlsx writer available — emit CSV bytes but keep a .csv extension so the
    // file actually opens. Flag the fallback for the UI to surface a note.
    return {
      filename: `contacts-${fileStamp()}.csv`,
      mimeType: "text/csv;charset=utf-8",
      content: csv,
      xlsxFallback: true,
    };
  }
  return {
    filename: `contacts-${fileStamp()}.csv`,
    mimeType: "text/csv;charset=utf-8",
    content: csv,
    xlsxFallback: false,
  };
}

/** Encode an export as a data-URL (server action returns this for download). */
export function toDataUrl(exp: ContactExport): string {
  const b64 = Buffer.from(exp.content, "utf-8").toString("base64");
  return `data:${exp.mimeType};base64,${b64}`;
}
