/**
 * Fail-soft helpers shared across the Contacts backend (module 12, Wave 3b).
 *
 * The Wave-3b migration (the new `contact_tags` / `contact_custom_fields` /
 * `contact_activities` tables + the new `Contact` columns) is written but NOT
 * applied in this build — the founder applies it as a separate manual deploy
 * step. Until then, any access to those relations/columns raises a Postgres
 * `42P01` (undefined_table) or `42703` (undefined_column). EVERY read/write that
 * touches new schema must treat those as "empty / no-op" rather than 500 the
 * page, so deploying code ahead of the migration is safe.
 *
 * Pure (no DB, no app imports) so it is importable everywhere including tests.
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
 * missing-relation/column (pre-migration) and re-throwing otherwise — a real
 * bug should still surface. Optionally logs non-missing errors as a warning and
 * swallows them too when `swallowAll` is set (use for non-critical reads).
 */
export async function softQuery<T>(
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
        event: opts.event ?? "contacts.soft_query_failed",
        ...opts.context,
        error: err instanceof Error ? err.message : String(err),
      });
      return fallback;
    }
    throw err;
  }
}
