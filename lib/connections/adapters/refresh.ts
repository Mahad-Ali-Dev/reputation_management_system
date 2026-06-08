/**
 * Token refresh — isolated + fail-safe (module 14_connections, risk C10).
 *
 * `refreshConnectionToken` touches ENCRYPTED material, so it is deliberately
 * quarantined in its own file with a single responsibility and a hard rule: on
 * ANY failure it marks the connection `status:"error"` and returns
 * `{ ok:false }` — it NEVER overwrites the stored token with garbage and NEVER
 * throws up to the page/cron. The sync engine calls it before a fetch when
 * `tokenExpiresAt` is in the past.
 *
 * It reuses the proven envelope-encryption (`lib/crypto/envelope`) and
 * `loadProviderApp` (decrypted client secret) — no crypto is reimplemented.
 * `saveConnection` re-encrypts + persists the rotated tokens.
 */

import { decrypt, type EncryptionContext } from "@/lib/crypto/envelope";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { loadProviderApp, saveConnection } from "@/lib/connections/oauth-helpers";

export type RefreshResult =
  | { ok: true; accessToken: string; expiresAt: Date | null; refreshed: boolean }
  | { ok: false; reason: string };

type ConnRow = {
  id: string;
  organizationId: string;
  provider: string;
  externalId: string | null;
  accountLabel: string | null;
  establishmentId: string | null;
  accessTokenCt: Uint8Array;
  refreshTokenCt: Uint8Array | null;
  iv: Uint8Array;
  keyVersion: number;
  dekCiphertext: Uint8Array;
  encryptionCtx: unknown;
  tokenExpiresAt: Date | null;
  scopes: string[];
};

function ctxFor(conn: ConnRow): EncryptionContext {
  return (
    (conn.encryptionCtx as EncryptionContext | null) ?? {
      orgId: conn.organizationId,
      provider: conn.provider,
      purpose: "oauth",
    }
  );
}

/** Mark a connection errored without touching its token ciphertext. */
async function markError(connectionId: string, reason: string): Promise<void> {
  try {
    await prisma.connection.update({
      where: { id: connectionId },
      data: { status: "error", syncError: reason.slice(0, 500), syncStatus: "error" },
    });
  } catch (err) {
    // The sync_* columns may not exist pre-migration (42703). Fall back to the
    // base status column only — never throw out of the refresh path.
    try {
      await prisma.connection.update({
        where: { id: connectionId },
        data: { status: "error" },
      });
    } catch {
      logger.warn({ event: "connection.refresh.mark_error_failed", connectionId });
    }
  }
}

/**
 * Decrypt + return the current access token for a connection row WITHOUT
 * refreshing. Fail-safe: on decrypt failure returns null (caller treats as
 * unusable). Exposed so the sync engine can read a still-valid token cheaply.
 */
export function decryptAccessToken(conn: ConnRow): string | null {
  try {
    return decrypt({
      ciphertext: Buffer.from(conn.accessTokenCt),
      iv: Buffer.from(conn.iv),
      dekCiphertext: Buffer.from(conn.dekCiphertext),
      keyVersion: conn.keyVersion,
      encryptionContext: ctxFor(conn),
    });
  } catch (err) {
    logger.warn({
      event: "connection.token.decrypt_failed",
      connectionId: conn.id,
      provider: conn.provider,
    });
    return null;
  }
}

/**
 * Refresh an expired connection's access token via the provider's `tokenUrl`
 * (`grant_type=refresh_token`) and persist the rotated tokens through
 * `saveConnection` (which re-encrypts). Fail-safe end to end.
 *
 * Returns the (possibly unchanged) usable access token on success.
 */
export async function refreshConnectionToken(connectionId: string): Promise<RefreshResult> {
  let conn: ConnRow | null = null;
  try {
    conn = (await prisma.connection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        organizationId: true,
        provider: true,
        externalId: true,
        accountLabel: true,
        establishmentId: true,
        accessTokenCt: true,
        refreshTokenCt: true,
        iv: true,
        keyVersion: true,
        dekCiphertext: true,
        encryptionCtx: true,
        tokenExpiresAt: true,
        scopes: true,
      },
    })) as ConnRow | null;
  } catch (err) {
    return { ok: false, reason: "connection_load_failed" };
  }
  if (!conn) return { ok: false, reason: "connection_not_found" };

  // Not expired (or no expiry recorded) → just decrypt and return.
  const expired = conn.tokenExpiresAt != null && conn.tokenExpiresAt.getTime() <= Date.now();
  if (!expired) {
    const token = decryptAccessToken(conn);
    if (!token) {
      await markError(conn.id, "decrypt_failed");
      return { ok: false, reason: "decrypt_failed" };
    }
    return { ok: true, accessToken: token, expiresAt: conn.tokenExpiresAt, refreshed: false };
  }

  // Expired → need a refresh token + a provider app with a token endpoint.
  if (!conn.refreshTokenCt) {
    await markError(conn.id, "token_expired_no_refresh_token");
    return { ok: false, reason: "no_refresh_token" };
  }
  const app = await loadProviderApp(conn.provider).catch(() => null);
  if (!app || !app.tokenUrl) {
    await markError(conn.id, "provider_not_configured");
    return { ok: false, reason: "provider_not_configured" };
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt({
      ciphertext: Buffer.from(conn.refreshTokenCt),
      iv: Buffer.from(conn.iv),
      dekCiphertext: Buffer.from(conn.dekCiphertext),
      keyVersion: conn.keyVersion,
      encryptionContext: ctxFor(conn),
    });
  } catch {
    await markError(conn.id, "refresh_token_decrypt_failed");
    return { ok: false, reason: "refresh_token_decrypt_failed" };
  }

  // POST grant_type=refresh_token. Most providers accept client creds in the
  // body; we send both Basic auth and body creds to maximise compatibility.
  let json: Record<string, unknown>;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(app.tokenUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          authorization:
            "Basic " +
            Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64"),
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: app.clientId,
          client_secret: app.clientSecret,
        }).toString(),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      await markError(conn.id, `refresh_http_${res.status}`);
      return { ok: false, reason: `refresh_http_${res.status}` };
    }
    json = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    await markError(conn.id, "refresh_request_failed");
    return { ok: false, reason: "refresh_request_failed" };
  }

  const accessToken = typeof json.access_token === "string" ? json.access_token : null;
  if (!accessToken) {
    await markError(conn.id, "refresh_no_access_token");
    return { ok: false, reason: "refresh_no_access_token" };
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : undefined;
  const newRefresh =
    typeof json.refresh_token === "string" ? json.refresh_token : refreshToken;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  try {
    await saveConnection({
      orgId: conn.organizationId,
      establishmentId: conn.establishmentId,
      provider: conn.provider,
      accountLabel: conn.accountLabel ?? conn.provider,
      externalId: conn.externalId ?? undefined,
      accessToken,
      refreshToken: newRefresh,
      expiresAt: expiresAt ?? undefined,
      scopes: conn.scopes,
    });
  } catch (err) {
    // The new tokens are valid but persistence failed — do NOT mark error
    // (the next run retries); surface failure so the caller skips this run.
    logger.warn({
      event: "connection.refresh.persist_failed",
      connectionId: conn.id,
      provider: conn.provider,
    });
    return { ok: false, reason: "refresh_persist_failed" };
  }

  logger.info({
    event: "connection.refresh.ok",
    connectionId: conn.id,
    provider: conn.provider,
  });
  return { ok: true, accessToken, expiresAt, refreshed: true };
}
