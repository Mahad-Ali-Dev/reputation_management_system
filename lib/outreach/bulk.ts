/**
 * Bulk CSV review-request parsing utilities.
 *
 * Pure / sync functions only — server-action wrappers live in bulk-actions.ts
 * (Next.js requires "use server" files to export only async functions).
 */

import { withTenant } from "@/lib/db/with-tenant";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_ROWS = 5000;
export const MAX_CSV_BYTES = 2 * 1024 * 1024; // 2MB

export type ParsedRecipient = {
  recipient: string;
  recipientName: string | null;
  rowNumber: number;
};

export type BulkParseResult = {
  valid: ParsedRecipient[];
  invalid: { rowNumber: number; raw: string; reason: string }[];
  duplicates: { rowNumber: number; recipient: string }[];
  unsubscribed: ParsedRecipient[];
  alreadyContacted: ParsedRecipient[];
};

/**
 * Parse a raw CSV string into recipients.
 *
 * Supported formats:
 *   - One value per line: phone or email
 *   - CSV with header: recipient,name | phone,name | email,name
 *
 * Phone numbers are normalized (strip whitespace, dashes, parens) before
 * E.164 validation. Email addresses are lowercased.
 *
 * At most MAX_ROWS valid rows are returned.
 */
export function parseRecipientsCsv(args: {
  csvText: string;
  channel: "sms" | "email";
}): {
  rows: ParsedRecipient[];
  invalid: BulkParseResult["invalid"];
  duplicates: BulkParseResult["duplicates"];
} {
  const lines = args.csvText
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const validator = args.channel === "sms" ? PHONE_RE : EMAIL_RE;
  const rows: ParsedRecipient[] = [];
  const invalid: BulkParseResult["invalid"] = [];
  const duplicates: BulkParseResult["duplicates"] = [];
  const seen = new Set<string>();

  // Header detection — must be a comma-separated row whose first token is a
  // recognized header keyword. This prevents "not-an-email" from being eaten
  // as a header just because "email" is a substring.
  let startIdx = 0;
  const firstLine = lines[0] ?? "";
  const firstToken = (splitCsvLine(firstLine)[0] ?? "").trim().toLowerCase();
  const HEADER_TOKENS = new Set(["phone", "email", "recipient", "tel", "mobile", "contact"]);
  if (HEADER_TOKENS.has(firstToken)) {
    startIdx = 1;
  }

  for (let i = startIdx; i < lines.length && rows.length < MAX_ROWS; i++) {
    const rowNumber = i + 1;
    const line = lines[i]!;
    const parts = splitCsvLine(line);
    const rawRecipient = (parts[0] ?? "").trim();
    const rawName = (parts[1] ?? "").trim() || null;

    if (!rawRecipient) {
      invalid.push({ rowNumber, raw: line, reason: "empty_recipient" });
      continue;
    }

    const normalized =
      args.channel === "sms"
        ? rawRecipient.replace(/[\s\-().]/g, "")
        : rawRecipient.toLowerCase();

    if (!validator.test(normalized)) {
      invalid.push({
        rowNumber,
        raw: rawRecipient,
        reason:
          args.channel === "sms"
            ? "invalid_phone_format_must_be_E164"
            : "invalid_email_format",
      });
      continue;
    }

    if (seen.has(normalized)) {
      duplicates.push({ rowNumber, recipient: normalized });
      continue;
    }
    seen.add(normalized);

    rows.push({ recipient: normalized, recipientName: rawName, rowNumber });
  }

  return { rows, invalid, duplicates };
}

// Minimal CSV splitter — handles quoted fields with embedded commas.
export function splitCsvLine(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/**
 * Categorize already-parsed recipients against unsubscribe + recent-contact suppression.
 * Returns the result the UI uses to preview a bulk send before commit.
 */
export async function previewBulkRecipients(args: {
  orgId: string;
  channel: "sms" | "email";
  rows: ParsedRecipient[];
}): Promise<BulkParseResult> {
  const valid: ParsedRecipient[] = [];
  const unsubscribed: ParsedRecipient[] = [];
  const alreadyContacted: ParsedRecipient[] = [];

  // Fold the unsubscribe lookup + the recent-contact lookup into one tenant
  // transaction so they share the same RLS context and only spin up one
  // connection.
  const { unsubSet, recentSet } =
    args.rows.length === 0
      ? { unsubSet: new Set<string>(), recentSet: new Set<string>() }
      : await withTenant(args.orgId, async (tx) => {
          const recipients = args.rows.map((r) => r.recipient);
          const unsubs = await tx.unsubscribe.findMany({
            where: {
              organizationId: args.orgId,
              channel: args.channel,
              emailOrPhone: { in: recipients },
            },
            select: { emailOrPhone: true },
          });
          const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const recent = await tx.reviewRequest.findMany({
            where: {
              channel: args.channel,
              recipient: { in: recipients },
              createdAt: { gte: since30 },
            },
            select: { recipient: true },
          });
          return {
            unsubSet: new Set(unsubs.map((u) => u.emailOrPhone)),
            recentSet: new Set(recent.map((r) => r.recipient)),
          };
        });

  for (const r of args.rows) {
    if (unsubSet.has(r.recipient)) {
      unsubscribed.push(r);
    } else if (recentSet.has(r.recipient)) {
      alreadyContacted.push(r);
    } else {
      valid.push(r);
    }
  }

  return { valid, invalid: [], duplicates: [], unsubscribed, alreadyContacted };
}
