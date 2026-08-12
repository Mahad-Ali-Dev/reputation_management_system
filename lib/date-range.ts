/**
 * Shared date-range constants for the topbar date pill.
 *
 * Deliberately a plain module with NO "use client" directive. When a Server
 * Component imports from a client module, the App Router bundler replaces every
 * export with an opaque client-reference proxy rather than the real value — so
 * an array imported that way arrives without `.map()`. Keeping these here lets
 * app-shell-server.tsx (server) and date-range-menu.tsx (client) both import
 * the actual values.
 *
 * The windows mirror `normalizeRange` in lib/seo/overview.ts so the topbar pill
 * and the Business Reports segmented control drive the same `?range=` param.
 */
export const DATE_RANGE_DAYS = [7, 30, 90] as const;
export const DEFAULT_RANGE_DAYS = 30;

export const RANGE_OPTION_LABELS: Record<number, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
};

/** Coerce a raw `?range=` value to a supported window. */
export function normalizeRangeDays(raw: unknown): number {
  const n = Number(raw);
  return (DATE_RANGE_DAYS as readonly number[]).includes(n) ? n : DEFAULT_RANGE_DAYS;
}

/**
 * One "May 8 – Jun 7, 2026" label per window, keyed by day count. Called on the
 * server and passed down whole, so the browser's timezone can't render a
 * different string than the SSR pass did.
 */
export function buildDateRangeLabels(now: Date): Record<string, string> {
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return Object.fromEntries(
    DATE_RANGE_DAYS.map((days) => [
      String(days),
      `${fmt(new Date(now.getTime() - days * 864e5))} – ${fmt(now)}, ${now.getFullYear()}`,
    ]),
  );
}
