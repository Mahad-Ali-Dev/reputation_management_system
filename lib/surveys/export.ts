import { withTenant } from "@/lib/db/with-tenant";

/**
 * Survey responses → CSV (Module 11).
 *
 * `formatCsv` is a pure RFC-4180 builder (unit-tested without a DB or download):
 *  - fields containing comma, double-quote, CR or LF are wrapped in double
 *    quotes; inner double-quotes are doubled.
 *  - CSV-INJECTION DEFENSE (build-plan §Risks): a cell whose first char is one
 *    of `= + - @ \t \r` is prefixed with a single quote so spreadsheet apps do
 *    not execute it as a formula. The prefix is applied BEFORE quoting.
 *
 * `buildResponsesCsv` does the tenant-scoped read and feeds `formatCsv`.
 */

/** Result of the export server action (defined here so the `"use server"` wrapper exports only the action). */
export type ExportResult = { ok: true; filename: string; csv: string } | { ok: false; error: string };

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

/**
 * Pure CSV serializer. `header` + `rows` → a single CSV string with CRLF line
 * endings. Exported so the unit test can assert quoting/escaping directly.
 */
export function formatCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const lines = [header.map(quoteField).join(",")];
  for (const row of rows) {
    lines.push(row.map(quoteField).join(","));
  }
  return lines.join("\r\n");
}

/** One flattened response row for export. */
export type ResponseExportRow = {
  responseId: string;
  campaignName: string;
  recipient: string;
  npsScore: number | null;
  rating: number | null;
  comment: string;
  smartRouteTo: string;
  submittedAt: string;
};

/**
 * Read an org's survey responses (optionally one campaign) and return a CSV
 * string. Tenant-scoped via `withTenant`. One row per response; NPS, rating,
 * and the first text comment are flattened into columns.
 */
export async function buildResponsesCsv(
  orgId: string,
  campaignId?: string,
  limit = 5000,
): Promise<string> {
  const rows = await withTenant(orgId, async (tx) => {
    const responses = await tx.surveyResponse.findMany({
      where: campaignId ? { campaignId } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        recipient: true,
        ratingSummary: true,
        smartRouteTo: true,
        createdAt: true,
        campaign: { select: { name: true } },
        answers: { select: { value: true, question: { select: { type: true } } } },
      },
    });
    return responses.map((r): ResponseExportRow => {
      const npsAns = r.answers.find((a) => a.question.type === "nps");
      const npsScore = (npsAns?.value as { number?: number } | null)?.number ?? null;
      const ratingAns = r.answers.find((a) => a.question.type === "rating");
      const rating = (ratingAns?.value as { number?: number } | null)?.number ?? null;
      const textAns = r.answers.find((a) => a.question.type === "text");
      const comment = (textAns?.value as { text?: string } | null)?.text ?? "";
      return {
        responseId: r.id,
        campaignName: r.campaign?.name ?? "",
        recipient: r.recipient ?? "",
        npsScore,
        rating,
        comment,
        smartRouteTo: r.smartRouteTo ?? "",
        submittedAt: r.createdAt.toISOString(),
      };
    });
  });

  const header = [
    "Response ID",
    "Campaign",
    "Recipient",
    "NPS (0-10)",
    "Rating",
    "Comment",
    "Routing",
    "Submitted At",
  ];
  return formatCsv(
    header,
    rows.map((r) => [
      r.responseId,
      r.campaignName,
      r.recipient,
      r.npsScore,
      r.rating,
      r.comment,
      r.smartRouteTo,
      r.submittedAt,
    ]),
  );
}
