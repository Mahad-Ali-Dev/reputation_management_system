/**
 * Fail-soft helpers for the Unified Inbox backend (Module 09, Wave 3c).
 *
 * The Wave-0 master delta added `ModerationItem`, `WidgetConfig`, and several new
 * columns on `ChatAutomationRule` / `WidgetKey`, but this build runs
 * `prisma generate` only — the SQL is applied by the founder as a separate manual
 * deploy step. Until then, touching those relations/columns raises a Postgres
 * `42P01` (undefined_table) / `42703` (undefined_column). Every read/write that
 * could hit not-yet-migrated schema must treat those as "empty / no-op" rather
 * than 500 the inbox, so deploying code ahead of the migration is safe.
 *
 * Pure (no DB, no app imports beyond the logger) so it is importable everywhere
 * including tests.
 */

import { logger } from "@/lib/logger";

/** Postgres 42P01 (undefined_table) / 42703 (undefined_column) → not migrated. */
export function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  // Raw Postgres codes + Prisma's P2021 (table) / P2022 (column) wrappers.
  if (code === "42P01" || code === "42703" || code === "P2021" || code === "P2022") return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /does not exist|relation .* does not exist|column .* does not exist/i.test(msg);
}

/**
 * Run a DB-touching fn, returning `fallback` when the failure is a
 * missing-relation/column (pre-migration) and re-throwing otherwise — a real bug
 * should still surface. When `swallowAll` is set, non-missing errors are logged
 * at warn and also swallowed (use for non-critical reads only).
 */
export async function softInbox<T>(
  fn: () => Promise<T>,
  fallback: T,
  opts?: { event?: string; swallowAll?: boolean; context?: Record<string, unknown> },
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isMissingRelation(err)) return fallback;
    if (opts?.swallowAll) {
      logger.warn({
        event: opts.event ?? "inbox.soft_query_failed",
        ...opts.context,
        error: err instanceof Error ? err.message : String(err),
      });
      return fallback;
    }
    throw err;
  }
}
