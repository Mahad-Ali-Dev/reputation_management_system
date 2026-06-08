/**
 * CSV header validator — a PURE, dependency-free guard for contact imports.
 *
 * The importer's column-mapper (`lib/contacts/import.ts`) is forgiving: it maps
 * whatever it recognizes and flags individual rows. This validator answers the
 * *prerequisite* question one step earlier — does the header even carry the
 * columns we need to reach a contact? A file with `Name,City,Notes` can never
 * produce an importable row (no email, no phone), so we want to tell the user
 * that BEFORE they map + submit, and reject it server-side as a cheap guard.
 *
 * RULE (AC): the header must contain a Name column AND at least one of
 * {Email, Phone}. Common aliases are detected (first/last name, e-mail, mobile,
 * tel, …) so real-world exports from CRMs/spreadsheets pass without renaming.
 *
 * PURE + isomorphic: no DB, no app imports, no I/O. Safe to run in the browser
 * (client-side pre-submit hint) and on the server (additive guard). Unit-tests
 * trivially.
 */

/** A logical column kind we can detect from a header cell. */
export type CsvColumnKind = "name" | "firstName" | "lastName" | "email" | "phone";

/** One recognized header column: its source label, position, and resolved kind. */
export interface RecognizedColumn {
  /** The raw header text as it appeared (trimmed). */
  header: string;
  /** Zero-based column index in the header row. */
  index: number;
  /** The logical kind this header maps to. */
  kind: CsvColumnKind;
}

export interface CsvValidationResult {
  /** True when the header satisfies the Name AND (Email OR Phone) rule. */
  ok: boolean;
  /** The recognized columns (one entry per matched header). */
  columns: RecognizedColumn[];
  /** Human-readable problems; empty when `ok`. */
  errors: string[];
}

/**
 * Alias tables, lower-cased + trimmed. Kept intentionally close to
 * `lib/contacts/import.ts#autoMap` so the validator and the mapper agree on what
 * counts as a Name/Email/Phone column. Matching is exact-after-normalize first,
 * then a conservative substring/word fallback for noisy headers
 * (e.g. "Email Address", "Mobile Phone", "Customer Email").
 */
const ALIASES: Record<CsvColumnKind, string[]> = {
  name: ["name", "full name", "fullname", "contact", "contact name", "customer", "customer name", "client", "client name"],
  firstName: ["first name", "firstname", "first", "given name", "givenname", "fname"],
  lastName: ["last name", "lastname", "last", "surname", "family name", "familyname", "lname"],
  email: ["email", "e-mail", "e mail", "email address", "e-mail address", "emailaddress", "mail"],
  phone: ["phone", "tel", "telephone", "mobile", "cell", "cellphone", "phone number", "mobile number", "phone no", "msisdn"],
};

/** Word tokens that, when present, strongly imply a kind (substring fallback). */
const TOKEN_HINTS: { kind: CsvColumnKind; tokens: string[] }[] = [
  { kind: "email", tokens: ["email", "e-mail", "e mail"] },
  { kind: "phone", tokens: ["phone", "mobile", "cell", "telephone", "tel"] },
  { kind: "firstName", tokens: ["first name", "given name"] },
  { kind: "lastName", tokens: ["last name", "surname", "family name"] },
  // `name` is last + most generic so "first/last/company name" win before it.
  { kind: "name", tokens: ["full name", "contact name", "customer name"] },
];

/** Normalize a header cell for comparison (trim, collapse whitespace, lower). */
function norm(h: string): string {
  return h.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Resolve one header cell to a column kind, or null if unrecognized. */
function classify(header: string): CsvColumnKind | null {
  const k = norm(header);
  if (!k) return null;

  // 1) Exact alias match (most specific kinds checked first so e.g. "first
  //    name" doesn't get swallowed by a generic "name" alias).
  const order: CsvColumnKind[] = ["email", "phone", "firstName", "lastName", "name"];
  for (const kind of order) {
    if (ALIASES[kind].includes(k)) return kind;
  }

  // 2) Token-hint fallback for compound/noisy headers ("Customer Email",
  //    "Mobile Phone #"). The hint list is ordered so specific kinds win.
  for (const { kind, tokens } of TOKEN_HINTS) {
    if (tokens.some((t) => k.includes(t))) return kind;
  }

  // 3) Bare "name" as a substring is the weakest signal — only honor it when
  //    no more-specific kind already claimed it above.
  if (/\bname\b/.test(k)) return "name";

  return null;
}

/**
 * Validate a parsed header row. Accepts either the already-split header cells
 * (preferred — reuses the importer's CSV splitter) or, when given a single
 * string, splits on commas as a convenience.
 *
 * @param header  The header cells (e.g. `parseImportCsv(text).headers`).
 */
export function validateCsvHeader(header: string[] | string): CsvValidationResult {
  const cells = Array.isArray(header) ? header : header.split(",");

  const columns: RecognizedColumn[] = [];
  for (let i = 0; i < cells.length; i++) {
    const raw = (cells[i] ?? "").trim();
    const kind = classify(raw);
    if (kind) columns.push({ header: raw, index: i, kind });
  }

  const has = (k: CsvColumnKind) => columns.some((c) => c.kind === k);
  // A first OR last name column counts toward the Name requirement, since the
  // importer synthesizes a full name from them.
  const hasName = has("name") || has("firstName") || has("lastName");
  const hasEmail = has("email");
  const hasPhone = has("phone");

  const errors: string[] = [];
  if (cells.length === 0 || cells.every((c) => !c.trim())) {
    errors.push("The file has no header row.");
    return { ok: false, columns, errors };
  }
  if (!hasName) {
    errors.push("Missing a Name column (also accepts First name / Last name).");
  }
  if (!hasEmail && !hasPhone) {
    errors.push("Missing a contact column — add at least an Email or Phone column.");
  }

  return { ok: errors.length === 0, columns, errors };
}
