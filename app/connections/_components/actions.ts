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
import { saveConnectionSoft } from "@/lib/connections/adapters/route-helpers";
import { syncConnectionContacts } from "@/lib/connections/sync";
import { WHATSAPP_GRAPH_VERSION } from "@/lib/inbox/whatsapp-send";
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

// ===========================================================================
// WhatsApp connect — manager-gated paste form (Module 09)
// ===========================================================================

/** WhatsApp Cloud API Phone Number IDs are numeric strings (15–17 digits). */
const WA_PHONE_NUMBER_ID_RE = /^\d{6,20}$/;

/**
 * Best-effort verify that the pasted token can read the given phone number id.
 * Hits Graph `GET /{phone_number_id}?fields=display_phone_number` with the
 * token. Returns the human display number on success (used as the account
 * label), or null when the probe can't be made / fails — we DON'T block the
 * connect on a failed probe (network blips, restricted token scopes), exactly
 * like the Meta callback treats its Page probe as a label nicety, not a gate.
 * Fail-soft: never throws.
 */
async function probeWhatsAppNumber(
  phoneNumberId: string,
  accessToken: string,
): Promise<{ ok: boolean; displayNumber?: string; error?: string }> {
  try {
    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(
      phoneNumberId,
    )}?fields=display_phone_number,verified_name`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const json = (await res.json().catch(() => null)) as {
      display_phone_number?: string;
      verified_name?: string;
      error?: { message?: string };
    } | null;
    if (!res.ok || json?.error) {
      return { ok: false, error: json?.error?.message ?? `http_${res.status}` };
    }
    const displayNumber = json?.verified_name
      ? `${json.verified_name} (${json.display_phone_number ?? phoneNumberId})`
      : json?.display_phone_number;
    return { ok: true, displayNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Connect a WhatsApp Business (Cloud API) number by pasting its Phone Number ID
 * + a permanent / system-user access token.
 *
 * This is the operator-side connect that makes the already-built WhatsApp
 * webhook (app/api/webhooks/whatsapp) + send path (lib/inbox/whatsapp-send)
 * live: it persists exactly the row they look up —
 * `Connection(provider:"whatsapp", externalId=phone_number_id)` with the access
 * token envelope-encrypted — via the shared `saveConnection` helper.
 *
 *   - RBAC-gated to manager+ (same as disconnect/re-sync; a token is a secret).
 *   - tenant-scoped through `saveConnection` → `withTenant` (RLS isolation).
 *   - idempotent on (org, provider, externalId): re-pasting a token for the same
 *     number updates the row in place (rotates the stored token).
 *   - FAIL-SOFT on the stale provider CHECK (23514 / not-migrated) via
 *     `saveConnectionSoft` → redirects to `?error=whatsapp_not_configured`
 *     instead of 500-ing (matches every other callback's posture).
 *
 * Token material is written ONLY through the envelope-encrypting helper; it is
 * never logged.
 */
export async function connectWhatsApp(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  const phoneNumberId = String(form.get("phoneNumberId") ?? "").trim();
  const accessToken = String(form.get("accessToken") ?? "").trim();

  if (!WA_PHONE_NUMBER_ID_RE.test(phoneNumberId)) {
    redirect("/connections/whatsapp?error=invalid_phone_number_id");
  }
  if (accessToken.length < 20) {
    redirect("/connections/whatsapp?error=invalid_token");
  }

  // Best-effort probe for a friendly label — never blocks the connect.
  const probe = await probeWhatsAppNumber(phoneNumberId, accessToken);
  const accountLabel = probe.displayNumber ?? `WhatsApp ${phoneNumberId}`;

  const saved = await saveConnectionSoft({
    orgId,
    establishmentId: null,
    provider: "whatsapp",
    accountLabel,
    externalId: phoneNumberId, // the natural key the webhook + send path resolve by
    accessToken,
    scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
  });

  if (!saved.ok) {
    logger.warn({ orgId, event: "connection.whatsapp.not_configured" });
    redirect("/connections/whatsapp?error=whatsapp_not_configured");
  }

  try {
    await withTenant(orgId, async (tx) => {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "connection.created",
          resourceType: "connection",
          resourceId: saved.id,
          // Never persist the token; the phone number id is not secret.
          afterData: { provider: "whatsapp", phoneNumberId, probed: probe.ok },
        },
      });
    });
  } catch {
    // Audit is best-effort — a missing audit table must not fail the connect.
  }

  logger.info({ orgId, event: "connection.created" }, "whatsapp number connected");
  revalidatePath("/connections");
  revalidatePath("/connections/whatsapp");
  redirect("/connections/whatsapp?connected=1");
}
