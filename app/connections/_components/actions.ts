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

import {
  type ApiKeyProviderSpec,
  defaultAccountLabel,
  getApiKeySpec,
  validateApiKeyFields,
} from "@/app/connections/_lib/api-key-fields";
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
// API-key connect — manager-gated paste form (Module 14, generalised from the
// original WhatsApp-only Module-09 flow)
// ===========================================================================

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
 * Connect ANY api_key-auth provider by pasting the credentials its field spec
 * declares (app/connections/_lib/api-key-fields.ts). This is the operator-side
 * connect that generalises the original WhatsApp-only paste flow: WhatsApp is
 * now just the two-field (phone_number_id + token) case.
 *
 * It persists a `Connection(provider, externalId?)` with the secret field
 * envelope-encrypted via the shared `saveConnection` helper — exactly the row
 * the provider's webhook / sync engine resolves by.
 *
 *   - RBAC-gated to manager+ (same as disconnect/re-sync; a key is a secret).
 *   - tenant-scoped through `saveConnection` → `withTenant` (RLS isolation).
 *   - idempotent on (org, provider, externalId): re-pasting credentials updates
 *     the row in place (rotates the stored secret).
 *   - FAIL-SOFT on the stale provider CHECK (23514 / not-migrated) via
 *     `saveConnectionSoft` → redirects to `?error=not_configured` instead of
 *     500-ing (matches every other callback's posture).
 *
 * The `provider` is read from a hidden form field but is NEVER trusted as a
 * path: it must resolve to a known api_key spec, otherwise we bail. Secret
 * material is written ONLY through the envelope-encrypting helper; it is never
 * logged.
 */
export async function connectApiKeyProvider(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  const provider = String(form.get("provider") ?? "").trim();
  const spec = getApiKeySpec(provider);
  if (!spec) {
    // Unknown / non-api_key provider — never build a redirect path from raw
    // input. Fall back to the connections index.
    redirect("/connections?error=unsupported_provider");
  }

  // Pull the spec's declared fields out of the form into a plain map.
  const raw: Record<string, string | undefined> = {};
  for (const field of spec.fields) {
    const v = form.get(field.name);
    raw[field.name] = typeof v === "string" ? v : undefined;
  }

  const validation = validateApiKeyFields(spec, raw);
  if (!validation.ok) {
    // `?error=field:<name>` lets the panel re-resolve the field's friendly copy.
    redirect(`/connections/${spec.provider}?error=field:${validation.field}`);
  }

  const { values, externalId, token } = validation;

  // Best-effort, provider-specific probe for a friendlier account label. Only
  // WhatsApp has one today; everything else falls back to the spec default.
  const accountLabel = await resolveApiKeyAccountLabel(spec, values, externalId);

  const saved = await saveConnectionSoft({
    orgId,
    establishmentId: null,
    provider: spec.provider,
    accountLabel,
    ...(externalId ? { externalId } : {}),
    accessToken: token,
    scopes: spec.scopes,
  });

  if (!saved.ok) {
    logger.warn({ orgId, provider: spec.provider, event: "connection.apikey.not_configured" });
    redirect(`/connections/${spec.provider}?error=not_configured`);
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
          // Never persist the secret; the externalId (e.g. phone number id /
          // account name) is not secret.
          afterData: { provider: spec.provider, externalId: externalId ?? null },
        },
      });
    });
  } catch {
    // Audit is best-effort — a missing audit table must not fail the connect.
  }

  logger.info(
    { orgId, provider: spec.provider, event: "connection.created" },
    "api_key connection saved",
  );
  revalidatePath("/connections");
  revalidatePath(`/connections/${spec.provider}`);
  redirect(`/connections/${spec.provider}?connected=1`);
}

/**
 * Resolve a friendly account label for a freshly-connected api_key provider.
 * WhatsApp probes the Graph API for the verified display number; all other
 * providers use the spec default (network-free) — keeping the connect fast and
 * making ZERO outbound calls for providers without a probe.
 */
async function resolveApiKeyAccountLabel(
  spec: ApiKeyProviderSpec,
  values: Record<string, string>,
  externalId: string | null,
): Promise<string> {
  if (spec.provider === "whatsapp" && externalId) {
    const probe = await probeWhatsAppNumber(externalId, values.accessToken ?? "");
    if (probe.displayNumber) return probe.displayNumber;
  }
  return defaultAccountLabel(spec, externalId);
}

/**
 * Thin back-compat wrapper: the WhatsApp paste form historically posted to
 * `connectWhatsApp`. It now just stamps the provider and delegates to the
 * generic `connectApiKeyProvider`. Kept so any existing reference keeps working.
 */
export async function connectWhatsApp(form: FormData): Promise<void> {
  form.set("provider", "whatsapp");
  await connectApiKeyProvider(form);
}
