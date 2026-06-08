/**
 * Shared helpers for the NEW Wave-3a OAuth callback routes.
 *
 * These wrap the existing OAuth framework (`oauth-helpers`) with the fail-soft
 * behaviour the guardrails require for providers whose `connections_provider_chk`
 * widening has not been applied yet:
 *
 *   - Postgres 23514 (check_violation) → the stale CHECK rejected this provider.
 *   - Postgres 42703 / 42P01 (undefined column/table) → not migrated.
 *
 * In all three cases the callback must NOT 500 — it redirects to
 * `/connections?error=<provider>_not_configured` and the connection is simply
 * not saved. Everything else re-throws so genuine bugs still surface.
 *
 * Nothing here re-implements crypto, state, or token storage.
 */

import { saveConnection } from "@/lib/connections/oauth-helpers";
import { logger } from "@/lib/logger";

/** True when an error is the stale provider CHECK or a missing relation. */
export function isProviderConstraintError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  // 23514 = check_violation, 42703 = undefined_column, 42P01 = undefined_table
  return code === "23514" || code === "42703" || code === "42P01";
}

export type SaveConnectionArgs = Parameters<typeof saveConnection>[0];

/**
 * Save a connection, returning a discriminated result instead of throwing on
 * the known "not migrated" failures. The caller turns `notConfigured` into the
 * `?error=<provider>_not_configured` redirect.
 */
export async function saveConnectionSoft(
  args: SaveConnectionArgs,
): Promise<{ ok: true; id: string } | { ok: false; notConfigured: true }> {
  try {
    const { id } = await saveConnection(args);
    return { ok: true, id };
  } catch (err) {
    if (isProviderConstraintError(err)) {
      logger.warn({
        event: "connection.save.provider_constraint",
        provider: args.provider,
        code: (err as { code?: string }).code,
      });
      return { ok: false, notConfigured: true };
    }
    throw err;
  }
}
