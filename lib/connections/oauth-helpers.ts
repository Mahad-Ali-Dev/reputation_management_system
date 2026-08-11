/**
 * Generic OAuth 2.0 helpers used by every per-platform callback handler.
 *
 * Each adapter provides:
 *   - authorize URL builder (with PKCE if supported)
 *   - token exchange logic
 *   - identity probe (whoami)
 *   - one canonical API operation per platform (e.g. list contacts, list orders)
 *
 * All adapter callbacks share:
 *   - OAuth state JWT (CSRF defense, signed)
 *   - Encrypted token storage in `connections` table
 *   - Audit logging
 *   - Refresh-token flow via the standard `refreshConnectionToken` helper
 */

import { createHash, randomBytes } from "node:crypto";
import { decrypt, encrypt } from "@/lib/crypto/envelope";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import {
  signOAuthState as baseSignOAuthState,
  verifyAndConsumeOAuthState,
} from "@/lib/oauth/state";

export type ProviderApp = {
  provider: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  oauthUrl: string | null;
  tokenUrl: string | null;
  redirectPath: string;
};

/**
 * Load a provider's app config including the decrypted client_secret.
 * Returns null if the provider isn't configured by the admin yet.
 */
export async function loadProviderApp(provider: string): Promise<ProviderApp | null> {
  const row = await prisma.providerApp.findUnique({
    where: { provider },
  });
  if (!row || row.status !== "configured") return null;
  if (!row.clientId || !row.clientSecretCt || !row.clientSecretIv) return null;

  const clientSecret = decrypt({
    ciphertext: Buffer.from(row.clientSecretCt),
    iv: Buffer.from(row.clientSecretIv),
    dekCiphertext: Buffer.alloc(0),
    keyVersion: 1,
    encryptionContext: row.clientSecretAad as {
      orgId: string;
      provider: string;
      purpose: "oauth" | "widget" | "phone" | "general";
    },
  });

  return {
    provider: row.provider,
    clientId: row.clientId,
    clientSecret,
    scopes: row.scopes,
    oauthUrl: row.oauthUrl,
    tokenUrl: row.tokenUrl,
    redirectPath: row.redirectPath,
  };
}

/**
 * Generate a PKCE verifier + challenge pair (S256).
 */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * Build an authorize URL with standard params + optional PKCE.
 * Caller appends platform-specific params (e.g. `shop=...` for Shopify).
 */
export function buildAuthorizeUrl(args: {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  pkceChallenge?: string;
  extraParams?: Record<string, string>;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: args.scopes.join(" "),
    state: args.state,
    ...(args.pkceChallenge
      ? { code_challenge: args.pkceChallenge, code_challenge_method: "S256" }
      : {}),
    ...args.extraParams,
  });
  return `${args.baseUrl}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens.
 * POSTs application/x-www-form-urlencoded by default — most providers support it.
 */
export async function exchangeCodeForTokens(args: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  pkceVerifier?: string;
  contentType?: "form" | "json";
  authMode?: "basic" | "body";
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  raw: Record<string, unknown>;
}> {
  const body =
    args.contentType === "json"
      ? JSON.stringify({
          grant_type: "authorization_code",
          code: args.code,
          redirect_uri: args.redirectUri,
          ...(args.authMode === "body"
            ? { client_id: args.clientId, client_secret: args.clientSecret }
            : {}),
          ...(args.pkceVerifier ? { code_verifier: args.pkceVerifier } : {}),
        })
      : new URLSearchParams({
          grant_type: "authorization_code",
          code: args.code,
          redirect_uri: args.redirectUri,
          ...(args.authMode === "body"
            ? { client_id: args.clientId, client_secret: args.clientSecret }
            : {}),
          ...(args.pkceVerifier ? { code_verifier: args.pkceVerifier } : {}),
        }).toString();

  const headers: Record<string, string> = {
    "content-type":
      args.contentType === "json" ? "application/json" : "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  if ((args.authMode ?? "basic") === "basic") {
    headers.authorization =
      "Basic " + Buffer.from(`${args.clientId}:${args.clientSecret}`).toString("base64");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(args.tokenUrl, { method: "POST", headers, body, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`token_exchange_failed_${res.status}: ${errText.slice(0, 300)}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const accessToken =
    (typeof json.access_token === "string" ? json.access_token : null) ??
    (typeof json.accessToken === "string" ? json.accessToken : null);
  if (!accessToken) {
    throw new Error("token_exchange_no_access_token");
  }
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : undefined,
    raw: json,
  };
}

/**
 * Save a fresh connection row with envelope-encrypted tokens.
 * Idempotent on (org, provider, externalId) — updates if exists.
 */
export async function saveConnection(args: {
  orgId: string;
  establishmentId?: string | null;
  provider: string;
  accountLabel: string;
  externalId?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}): Promise<{ id: string }> {
  // Envelope encrypt both tokens
  const ctx = { orgId: args.orgId, provider: args.provider, purpose: "oauth" as const };
  const accessEnc = encrypt(args.accessToken, ctx);
  const refreshEnc = args.refreshToken ? encrypt(args.refreshToken, ctx) : null;

  // Coerce Buffer → ArrayBuffer-backed Uint8Array for Prisma Bytes columns
  const toBytes = (b: Buffer): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(new ArrayBuffer(b.byteLength));
    out.set(b);
    return out;
  };
  const accessCt = toBytes(accessEnc.ciphertext);
  const accessIv = toBytes(accessEnc.iv);
  const refreshCt: Uint8Array<ArrayBuffer> | null = refreshEnc
    ? toBytes(refreshEnc.ciphertext)
    : null;

  return withTenant(args.orgId, async (tx) => {
    const existing = await tx.connection.findFirst({
      where: {
        // Explicit org scope as defense-in-depth: RLS already constrains this
        // query to the tenant, but two orgs can share an externalId (same
        // Shopify shop / HubSpot hub), so never rely on RLS alone here.
        organizationId: args.orgId,
        provider: args.provider,
        ...(args.externalId ? { externalId: args.externalId } : {}),
      },
    });

    if (existing) {
      const updated = await tx.connection.update({
        where: { id: existing.id },
        data: {
          accessTokenCt: accessCt,
          refreshTokenCt: refreshCt,
          iv: accessIv,
          encryptionCtx: ctx,
          tokenExpiresAt: args.expiresAt ?? null,
          scopes: args.scopes,
          accountLabel: args.accountLabel,
          status: "active",
          lastSyncedAt: new Date(),
          ...(args.establishmentId !== undefined ? { establishmentId: args.establishmentId } : {}),
        },
      });
      logger.info(
        {
          event: "connection.refreshed",
          orgId: args.orgId,
          provider: args.provider,
          connectionId: updated.id,
        },
        "connection tokens refreshed",
      );
      return { id: updated.id };
    }

    const created = await tx.connection.create({
      data: {
        organizationId: args.orgId,
        establishmentId: args.establishmentId ?? null,
        provider: args.provider,
        accountLabel: args.accountLabel,
        externalId: args.externalId ?? null,
        accessTokenCt: accessCt,
        refreshTokenCt: refreshCt,
        iv: accessIv,
        encryptionCtx: ctx,
        tokenExpiresAt: args.expiresAt ?? null,
        scopes: args.scopes,
        status: "active",
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: args.orgId,
        actorType: "system",
        actorId: args.orgId, // synthetic
        action: "connection.created",
        resourceType: "connection",
        resourceId: created.id,
        afterData: { provider: args.provider, accountLabel: args.accountLabel },
      },
    });

    logger.info(
      {
        event: "connection.created",
        orgId: args.orgId,
        provider: args.provider,
        connectionId: created.id,
      },
      "new connection created",
    );

    return { id: created.id };
  });
}

/**
 * State signing — thin wrapper over existing OAuth state helper.
 */
export async function signProviderState(args: {
  orgId: string;
  userId: string;
  provider: string;
}): Promise<{ state: string; cookieHash: string; pkceVerifier: string; pkceChallenge: string }> {
  return baseSignOAuthState({
    orgId: args.orgId,
    userId: args.userId,
    provider: args.provider,
  });
}

/**
 * Verify state in a callback handler. Reads the cookie hash from the request cookies.
 */
export async function verifyProviderState(args: {
  state: string;
  cookieHash: string;
  sessionUserId: string;
  /** Active org from the caller's session — state.orgId must match it. */
  sessionOrgId: string;
  expectedProvider: string;
}): Promise<{ orgId: string; userId: string; pkceVerifier: string }> {
  const verified = await verifyAndConsumeOAuthState({
    state: args.state,
    cookieHash: args.cookieHash,
    expectedProvider: args.expectedProvider,
    sessionUserId: args.sessionUserId,
    sessionOrgId: args.sessionOrgId,
  });
  return {
    orgId: verified.orgId,
    userId: verified.userId,
    pkceVerifier: verified.pkceVerifier,
  };
}

/**
 * Resolve OAuth credentials for a provider, preferring the admin-configured
 * DB row and falling back to environment variables.
 *
 * WHY: the admin "Provider OAuth apps" screen writes credentials to
 * `ProviderApp`, but several connect routes only ever read `process.env`. An
 * admin could paste a Client ID/Secret, see the row flip to "configured", and
 * have the connect still fail — the credentials were encrypted and then ignored.
 * (Same silent no-op that made the legacy `facebook` provider page so
 * misleading.)
 *
 * DB first so the admin UI is authoritative when used; env fallback so existing
 * env-configured deployments keep working untouched.
 */
export async function resolveOAuthCredentials(
  provider: string,
  envClientId: string | undefined,
  envClientSecret: string | undefined,
): Promise<{ clientId: string; clientSecret: string; source: "db" | "env" } | null> {
  const app = await loadProviderApp(provider).catch(() => null);
  if (app?.clientId && app.clientSecret) {
    return { clientId: app.clientId, clientSecret: app.clientSecret, source: "db" };
  }
  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret, source: "env" };
  }
  return null;
}
