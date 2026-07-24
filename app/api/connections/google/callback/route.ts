import { auth } from "@/lib/auth/config";
import { encrypt } from "@/lib/crypto/envelope";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { oauthBase, oauthCallbackUrl } from "@/lib/oauth/redirect";
import { verifyAndConsumeOAuthState } from "@/lib/oauth/state";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/google/callback?code=...&state=...
 *
 * Completes the Google OAuth flow:
 *   1. Verify state JWT + cookie hash + single-use nonce
 *   2. Exchange code for tokens (with PKCE verifier)
 *   3. Envelope-encrypt tokens; persist `connections` row
 *   4. Audit-log
 *   5. Redirect back to the establishment page
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const sessionUserId = session?.user?.id;
  if (!session || !orgId || !sessionUserId) {
    return NextResponse.redirect(new URL("/login", oauthBase(req)));
  }

  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  if (errParam) {
    logger.warn({ event: "oauth.google.user_denied", err: errParam });
    return NextResponse.redirect(new URL("/establishments?error=oauth_denied", oauthBase(req)));
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/establishments?error=oauth_missing_params", oauthBase(req)),
    );
  }

  const cookieHash = req.cookies.get("oauth_state_sig")?.value;
  const establishmentId = req.cookies.get("oauth_pending_establishment")?.value;
  if (!cookieHash || !establishmentId) {
    return NextResponse.redirect(
      new URL("/establishments?error=oauth_missing_cookies", oauthBase(req)),
    );
  }
  // SECURITY: the establishmentId came from a cookie the user can edit. Even
  // though RLS scopes the eventual connections row to this org, PG foreign-key
  // checks run as the table owner and can see ALL establishments, so the FK
  // alone wouldn't block linking a connection to a foreign org's
  // establishment. Verify ownership here before we accept the OAuth flow.
  // (Also re-validates the UUID shape — defends against cookie tampering.)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(establishmentId)) {
    return NextResponse.redirect(
      new URL("/establishments?error=oauth_bad_establishment", oauthBase(req)),
    );
  }
  const ownsEstablishment = await withTenant(orgId, async (tx) => {
    const row = await tx.establishment.findFirst({
      where: { id: establishmentId, deletedAt: null },
      select: { id: true },
    });
    return !!row;
  });
  if (!ownsEstablishment) {
    logger.warn(
      { event: "oauth.google.foreign_establishment", orgId, establishmentId },
      "OAuth callback rejected — establishmentId from cookie is not owned by this org",
    );
    return NextResponse.redirect(
      new URL("/establishments?error=oauth_bad_establishment", oauthBase(req)),
    );
  }

  // Step 1: state verification (CSRF + replay + PKCE)
  let verified: Awaited<ReturnType<typeof verifyAndConsumeOAuthState>>;
  try {
    verified = await verifyAndConsumeOAuthState({
      state,
      cookieHash,
      expectedProvider: "google_business",
      sessionUserId,
      sessionOrgId: orgId,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "oauth.google.state_invalid", error });
    return NextResponse.redirect(
      new URL("/establishments?error=oauth_state_invalid", oauthBase(req)),
    );
  }

  // Step 2: code → tokens
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  const redirectUri = oauthCallbackUrl("google");
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "google_oauth_not_configured" }, { status: 500 });
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: verified.pkceVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    logger.error(
      { event: "oauth.google.token_exchange_failed", status: tokenRes.status, body: text },
      "google token exchange failed",
    );
    return NextResponse.redirect(
      new URL("/establishments?error=oauth_token_exchange", oauthBase(req)),
    );
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
  };

  // Step 3: get account label (email) from userinfo for display
  let accountLabel: string | undefined;
  try {
    const userinfo = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (userinfo.ok) {
      const u = (await userinfo.json()) as { email?: string; name?: string };
      accountLabel = u.email ?? u.name;
    }
  } catch {
    // Non-fatal — label is just a UI nicety.
  }

  // Step 4: envelope-encrypt and persist
  const encryptionCtx = {
    orgId,
    provider: "google_business" as const,
    purpose: "oauth" as const,
  };
  const accessEnc = encrypt(tokens.access_token, encryptionCtx);
  const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token, encryptionCtx) : null;

  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
  const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? [];

  await withTenant(orgId, async (tx) => {
    // Revoke any prior active google connection for this establishment to avoid duplicates.
    await tx.connection.updateMany({
      where: {
        organizationId: orgId,
        establishmentId,
        provider: "google_business",
        status: "active",
      },
      data: { status: "revoked" },
    });

    // Prisma 6's Bytes type is Uint8Array<ArrayBuffer> (narrow). Copy into a fresh
    // ArrayBuffer-backed Uint8Array so the TS type aligns.
    function toBytes(b: Buffer): Uint8Array<ArrayBuffer> {
      const ab = new ArrayBuffer(b.byteLength);
      const view = new Uint8Array(ab);
      view.set(b);
      return view as Uint8Array<ArrayBuffer>;
    }

    const conn = await tx.connection.create({
      data: {
        organizationId: orgId,
        establishmentId,
        provider: "google_business",
        accountLabel: accountLabel ?? null,
        externalId: accountLabel ?? null, // best effort until we list GBP accounts
        accessTokenCt: toBytes(accessEnc.ciphertext),
        refreshTokenCt: refreshEnc ? toBytes(refreshEnc.ciphertext) : null,
        iv: toBytes(accessEnc.iv),
        encryptionCtx,
        keyVersion: accessEnc.keyVersion,
        tokenExpiresAt: expiresAt,
        scopes,
        status: "active",
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: sessionUserId,
        action: "connection.created",
        resourceType: "connection",
        resourceId: conn.id,
        afterData: { provider: "google_business", accountLabel, scopes },
        ip: req.headers.get("x-forwarded-for") ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
      },
    });
  });

  logger.info(
    {
      orgId,
      establishmentId,
      accountLabel,
      event: "connection.created",
    },
    "google business profile connected",
  );

  // Clear the helper cookies
  const res = NextResponse.redirect(
    new URL(`/establishments/${establishmentId}?connected=google`, oauthBase(req)),
  );
  res.cookies.delete("oauth_state_sig");
  res.cookies.delete("oauth_pending_establishment");
  return res;
}
