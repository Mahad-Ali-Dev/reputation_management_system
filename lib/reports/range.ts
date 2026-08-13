/**
 * Business Report date range.
 *
 * Three presets (7 / 15 / 30 days) plus a custom span, parsed from the URL so a
 * report is shareable and survives a refresh — and so the print/PDF output shows
 * the same window the reader selected rather than a client-side default.
 *
 * Everything is computed in server-local time and snapped to day boundaries: a
 * report titled "last 7 days" that silently cuts off at the current clock time
 * under-reports today, which reads as missing data.
 */

export type RangePreset = "7" | "15" | "30" | "custom";

export type ReportRange = {
  preset: RangePreset;
  from: Date;
  to: Date;
  /** Inclusive day count of the window. */
  days: number;
  /** Human label for the header + PDF ("Last 7 days", "1 Jun – 14 Jun 2026"). */
  label: string;
  /** Same-length window immediately before `from`, for period-over-period deltas. */
  previousFrom: Date;
  /** ISO yyyy-mm-dd, for round-tripping the custom inputs. */
  fromInput: string;
  toInput: string;
};

const PRESET_DAYS = { "7": 7, "15": 15, "30": 30 } as const;

/** A year is plenty for an operational report and bounds the query cost. */
const MAX_DAYS = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseISO(s: string | undefined): Date | null {
  if (!s || !ISO_DATE.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "1 Jun – 14 Jun 2026" */
function spanLabel(from: Date, to: Date): string {
  return `${DATE_FMT.format(from)} – ${DATE_FMT.format(to)}`;
}

/**
 * Resolve the range from search params.
 *
 * Invalid input never throws — it falls back to the 30-day default, because a
 * malformed date in a shared URL should still render a report.
 */
export function parseReportRange(sp: {
  range?: string;
  from?: string;
  to?: string;
}): ReportRange {
  const now = new Date();

  if (sp.range === "custom") {
    const rawFrom = parseISO(sp.from);
    const rawTo = parseISO(sp.to);
    if (rawFrom && rawTo) {
      // Tolerate a reversed pair rather than rejecting it — the user's intent is
      // unambiguous and an error page here would be pure friction.
      const [lo, hi] = rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom];
      const from = startOfDay(lo);
      // Never report into the future; it renders as a run of empty days.
      const to = endOfDay(hi > now ? now : hi);
      const days = Math.min(
        MAX_DAYS,
        Math.max(1, Math.round((startOfDay(to).getTime() - from.getTime()) / 86_400_000) + 1),
      );
      const clampedFrom = startOfDay(addDays(startOfDay(to), -(days - 1)));
      return {
        preset: "custom",
        from: clampedFrom,
        to,
        days,
        label: spanLabel(clampedFrom, to),
        previousFrom: addDays(clampedFrom, -days),
        fromInput: toISODate(clampedFrom),
        toInput: toISODate(to),
      };
    }
    // "custom" with missing/invalid dates → fall through to the default preset.
  }

  const preset: Exclude<RangePreset, "custom"> =
    sp.range === "7" || sp.range === "15" || sp.range === "30" ? sp.range : "30";
  const days = PRESET_DAYS[preset];
  const to = endOfDay(now);
  const from = startOfDay(addDays(now, -(days - 1)));

  return {
    preset,
    from,
    to,
    days,
    label: `Last ${days} days`,
    previousFrom: addDays(from, -days),
    fromInput: toISODate(from),
    toInput: toISODate(to),
  };
}
