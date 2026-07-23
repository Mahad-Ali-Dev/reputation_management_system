/**
 * Gmail access-token resolver.
 *
 * Gmail connects reuse the env-based Google OAuth app (AUTH_GOOGLE_ID/SECRET) —
 * the SAME app as the Google Business Profile connect — rather than an
 * admin-managed `provider_apps` row. So the generic `refreshConnectionToken`
 * helper (which loads client creds from `provider_apps`) can't refresh a gmail
 * token; it would mark the connection errored. This module refreshes inline
 * against the Google token endpoint with the env creds instead, exactly how the
 * GBP publish path refreshes inline.
 *
 * Fail-soft: returns the current (or refreshed) access token, or null if it
 * can't produce a usable one. Never throws. Persists rotated tokens via the
 * shared `saveConnection` (re-encrypts) so subsequent runs see a fresh expiry.
 */

import { decryptAccessToken } from "@/lib/connections/adapters/refresh";
import { saveConnection } from "@/lib/connections/oauth-helpers";
import { type EncryptionContext, decrypt } from "@/lib/crypto/envelope";
import { logger } from "@/lib/logger";
import type { Connection } from "@prisma/client";
import { gmailOAuthClient } from "./oauth-client";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

function ctxFor(conn: Connection): EncryptionContext {
  return (
    (conn.encryptionCtx as EncryptionContext | null) ?? {
      orgId: conn.organizationId,
      provider: conn.provider,
      purpose: "oauth",
    }
  );
}

/**
 * Return a usable Gmail access token for a connection, refreshing inline when
 * the stored token is expired. Null when no usable token can be produced.
 */
export async function getGmailAccessToken(conn: Connection): Promise<string | null> {
  const expired =
    conn.tokenExpiresAt != null && conn.tokenExpiresAt.getTime() <= Date.now() + 30_000;

  if (!expired) {
    return decryptAccessToken(conn);
  }

  // Expired → refresh with the Gmail OAuth client creds + stored refresh token.
  const { clientId, clientSecret } = gmailOAuthClient();
  if (!clientId || !clientSecret || !conn.refreshTokenCt) {
    // No way to refresh — fall back to the (possibly still-valid) stored token.
    return decryptAccessToken(conn);
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
    return decryptAccessToken(conn);
  }

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      logger.warn({
        event: "gmail.token.refresh_failed",
        connectionId: conn.id,
        status: res.status,
      });
      return decryptAccessToken(conn);
    }
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
    };
    const accessToken = json.access_token;
    if (!accessToken) return decryptAccessToken(conn);

    const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined;

    // Persist the rotated access token (Google rarely rotates the refresh token,
    // but keep whatever it returns). Fail-soft: a persist error still returns the
    // fresh token for THIS run.
    try {
      await saveConnection({
        orgId: conn.organizationId,
        establishmentId: conn.establishmentId,
        provider: "gmail",
        accountLabel: conn.accountLabel ?? "Gmail",
        externalId: conn.externalId ?? undefined,
        accessToken,
        refreshToken: json.refresh_token ?? refreshToken,
        expiresAt,
        scopes: conn.scopes,
      });
    } catch (err) {
      logger.warn({
        event: "gmail.token.persist_failed",
        connectionId: conn.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return accessToken;
  } catch (err) {
    logger.warn({
      event: "gmail.token.refresh_failed",
      connectionId: conn.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return decryptAccessToken(conn);
  }
}
