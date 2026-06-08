"use server";

/**
 * Connection lifecycle server actions for the Connections page islands
 * (module 14_connections, Wave 3a).
 *
 * Co-located with the UI because they exist purely to back the page's
 * disconnect/re-sync controls. Both are:
 *   - RBAC-gated to `manager`+ (a viewer/member must not be able to sever a
 *     tenant's data sync or spend a sync cycle) via `requireRole`,
 *   - tenant-scoped through `withTenant` (RLS isolation),
 *   - audit-logged,
 *   - FAIL-SOFT on the not-yet-migrated columns / stale provider CHECK
 *     (Postgres 42703/42P01/23514) so a pre-migration deploy degrades to a
 *     redirect instead of a 500 (matches `lib/connections/status.ts`).
 *
 * Token material is NOT touched here — disconnect is a soft status flip
 * (`status: "revoked"`), leaving the encrypted row intact for forensic/restore
 * and so we never risk corrupting ciphertext.
 */

import { requireRole } from "@/lib/auth/rbac";
import { syncConnectionContacts } from "@/lib/connections/sync";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

/** Postgres: 42703 undefined_column · 42P01 undefined_table · 23514 check. */
function isSoftDbError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42703" || code === "42P01" || code === "23514";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Disconnect (revoke) a connection.
 *
 * The UI shows the mandatory warning ("This will stop automatic customer
 * syncing.") in a confirm modal before this runs. We soft-revoke rather than
 * delete so old rows still resolve and an admin can restore via a status flip.
 */
export async function disconnectConnection(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const connectionId = String(form.get("connectionId") ?? "");
  if (!UUID_RE.test(connectionId)) throw new Error("invalid_connection_id");

  try {
    await withTenant(orgId, async (tx) => {
      const conn = await tx.connection.findFirst({
        where: { id: connectionId },
        select: { id: true, provider: true, status: true, accountLabel: true },
      });
      if (!conn) return; // already gone — idempotent
      if (conn.status === "revoked") return; // already revoked — idempotent

      await tx.connection.update({
        where: { id: conn.id },
        data: {
          status: "revoked",
          // Best-effort: clear live sync flags. These columns are additive
          // (Wave-0 delta) and may be absent pre-migration — the surrounding
          // try/catch turns that 42703 into a soft no-op.
          syncStatus: "idle",
          syncError: null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "connection.disconnected",
          resourceType: "connection",
          resourceId: conn.id,
          beforeData: { provider: conn.provider, status: conn.status },
          afterData: { status: "revoked", accountLabel: conn.accountLabel ?? null },
        },
      });
    });
  } catch (err) {
    if (isSoftDbError(err)) {
      logger.warn({
        orgId,
        connectionId,
        event: "connection.disconnect.skipped_unmigrated",
        code: (err as { code?: string }).code,
      });
      redirect("/connections?error=not_migrated");
    }
    throw err;
  }

  logger.info({ orgId, connectionId, event: "connection.disconnected" }, "connection revoked");
  revalidatePath("/connections");
  redirect("/connections?disconnected=1");
}

/**
 * Manually re-sync a connection's contacts now (the cron normally does this
 * every 15 minutes). Delegates to the shared sync engine, which is itself
 * env/credential-gated — with no creds it no-ops and makes zero network calls.
 */
export async function resyncConnection(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const connectionId = String(form.get("connectionId") ?? "");
  if (!UUID_RE.test(connectionId)) throw new Error("invalid_connection_id");

  try {
    const outcome = await syncConnectionContacts(orgId, connectionId);
    logger.info(
      { orgId, connectionId, status: outcome.status, event: "connection.resync.manual" },
      "manual connection resync",
    );
  } catch (err) {
    // The engine is already defensive, but never let a sync failure 500 the
    // page — surface it as a redirect param instead.
    logger.warn({
      orgId,
      connectionId,
      event: "connection.resync.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    redirect("/connections?error=resync_failed");
  }

  revalidatePath("/connections");
  redirect("/connections?resynced=1");
}
