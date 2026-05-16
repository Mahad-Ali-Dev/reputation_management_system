import { decrypt, type EncryptionContext } from "@/lib/crypto/envelope";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/db/client";

/**
 * Publish a reply to Google Business Profile.
 *
 * Calls accounts.locations.reviews.updateReply on the GBP API using the establishment's
 * stored OAuth token (envelope-decrypted). Refreshes the token if expired.
 *
 * Returns ok:true on 2xx, or ok:false with a normalized error string.
 */

export async function publishReplyToGoogle(args: {
  orgId: string;
  establishmentId: string;
  externalReviewId: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { orgId, establishmentId, externalReviewId, body } = args;

  const conn = await withTenant(orgId, async (tx) => {
    return tx.connection.findFirst({
      where: {
        organizationId: orgId,
        establishmentId,
        provider: "google_business",
        status: "active",
      },
    });
  });
  if (!conn) return { ok: false, error: "no_google_connection" };

  const ctx: EncryptionContext = (conn.encryptionCtx as unknown as EncryptionContext) ?? {
    orgId,
    provider: "google_business",
    purpose: "oauth",
  };

  // Decrypt access token (refresh if expired — Day 3 minimum: throw if expired, refresh added later)
  let accessToken: string;
  try {
    accessToken = decrypt({
      ciphertext: Buffer.from(conn.accessTokenCt),
      iv: Buffer.from(conn.iv),
      dekCiphertext: Buffer.from(conn.dekCiphertext),
      keyVersion: conn.keyVersion,
      encryptionContext: ctx,
    });
  } catch (err) {
    logger.error({ orgId, error: String(err), event: "google.decrypt_failed" });
    return { ok: false, error: "token_decrypt_failed" };
  }

  // Refresh token flow: if expired, exchange refresh token for a new access token
  if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now() + 30_000) {
    const refreshed = await refreshAccessToken(orgId, conn.id, conn.refreshTokenCt, ctx);
    if (!refreshed.ok) return refreshed;
    accessToken = refreshed.accessToken;
  }

  // externalReviewId is Google's review.name fragment ("accounts/.../locations/.../reviews/...").
  // For Day 3 v1 we expect the full Google review.name was stored as external_id during fetch.
  const url = `https://mybusiness.googleapis.com/v4/${externalReviewId}/reply`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ comment: body }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error(
      { orgId, externalReviewId, status: res.status, body: text, event: "google.publish_failed" },
      "google updateReply failed",
    );
    return { ok: false, error: `google_${res.status}` };
  }

  return { ok: true };
}

async function refreshAccessToken(
  orgId: string,
  connectionId: string,
  refreshTokenCt: Uint8Array | Buffer | null,
  ctx: EncryptionContext,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  if (!refreshTokenCt) return { ok: false, error: "no_refresh_token" };

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return { ok: false, error: "google_oauth_not_configured" };

  let refreshToken: string;
  try {
    // Fetch IV from the connection
    const conn = await prisma.connection.findUnique({
      where: { id: connectionId },
      select: { iv: true },
    });
    if (!conn) return { ok: false, error: "connection_not_found" };
    refreshToken = decrypt({
      ciphertext: Buffer.from(refreshTokenCt),
      iv: Buffer.from(conn.iv),
      dekCiphertext: Buffer.alloc(0),
      keyVersion: 1,
      encryptionContext: ctx,
    });
  } catch (err) {
    logger.error({ orgId, error: String(err), event: "google.refresh_decrypt_failed" });
    return { ok: false, error: "refresh_decrypt_failed" };
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    return { ok: false, error: "google_refresh_failed" };
  }
  const tokens = (await res.json()) as { access_token: string; expires_in?: number };

  // Re-encrypt new access token and update the row (will be done by token-refresh worker properly Day 10)
  // For Day 3 we skip persistence and just use the fresh token in-memory.
  return { ok: true, accessToken: tokens.access_token };
}
