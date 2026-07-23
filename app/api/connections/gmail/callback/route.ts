import { auth } from "@/lib/auth/config";
import { saveConnection } from "@/lib/connections/oauth-helpers";
import { withTenant } from "@/lib/db/with-tenant";
import { gmailOAuthClient } from "@/lib/gmail/oauth-client";
import { logger } from "@/lib/logger";
import { oauthBase } from "@/lib/oauth/redirect";
import { verifyAndConsumeOAuthState } from "@/lib/oauth/state";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/gmail/callback?code=...&state=...
 *
 * Completes the Gmail OAuth flow:
 *   1. Verify state JWT + cookie hash + single-use nonce (provider "gmail")
 *   2. Exchange code for tokens (with PKCE verifier) against the Google token endpoint
 *   3. Probe userinfo for the connected mailbox email (account label + externalId)
 *   4. Persist a Connection(provider:"gmail") with envelope-encrypted tokens via saveConnection
 *   5. Audit-log + redirect back to the connections page
 *
 * Mirrors the Google Business Profile callback but mailbox-level (no
 * establishment) and reuses the shared `saveConnection` persistence helper.
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
    logger.warn({ event: "oauth.gmail.user_denied", err: errParam });
    return NextResponse.redirect(new URL("/connections?error=oauth_denied", oauthBase(req)));
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/connections?error=oauth_missing_params", oauthBase(req)),
    );
  }

  const cookieHash = req.cookies.get("oauth_state_sig")?.value;
  if (!cookieHash) {
    return NextResponse.redirect(
      new URL("/connections?error=oauth_missing_cookies", oauthBase(req)),
    );
  }

  // Step 1: state verification (CSRF + replay + PKCE + org/user binding)
  let verified: Awaited<ReturnType<typeof verifyAndConsumeOAuthState>>;
  try {
    verified = await verifyAndConsumeOAuthState({
      state,
      cookieHash,
      expectedProvider: "gmail",
      sessionUserId,
      sessionOrgId: orgId,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "oauth.gmail.state_invalid", error });
    return NextResponse.redirect(new URL("/connections?error=oauth_state_invalid", oauthBase(req)));
  }

  // Step 2: code → tokens. Uses the Gmail-specific OAuth client when one is
  // configured, so the restricted Gmail scopes stay off the main client.
  const { clientId, clientSecret } = gmailOAuthClient();
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/connections/gmail/callback`;
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
    const text = await tokenRes.text().catch(() => "");
    logger.error(
      { event: "oauth.gmail.token_exchange_failed", status: tokenRes.status, body: text },
      "gmail token exchange failed",
    );
    return NextResponse.redirect(
      new URL("/connections?error=oauth_token_exchange", oauthBase(req)),
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

  // Step 3: probe userinfo for the connected mailbox email (label + externalId).
  let mailboxEmail: string | undefined;
  try {
    const userinfo = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (userinfo.ok) {
      const u = (await userinfo.json()) as { email?: string; name?: string };
      mailboxEmail = u.email ?? u.name;
    }
  } catch {
    // Non-fatal — the label is a UI nicety; the externalId falls back below.
  }

  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined;
  const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? [];

  // Step 4: persist via the shared helper (envelope-encrypts + idempotent on
  // org+provider+externalId, so reconnecting the same mailbox updates in place).
  try {
    const saved = await saveConnection({
      orgId,
      establishmentId: null,
      provider: "gmail",
      accountLabel: mailboxEmail ?? "Gmail",
      externalId: mailboxEmail, // the connected mailbox address is the natural key
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scopes,
    });

    await withTenant(orgId, async (tx) => {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: sessionUserId,
          action: "connection.created",
          resourceType: "connection",
          resourceId: saved.id,
          afterData: { provider: "gmail", accountLabel: mailboxEmail, scopes },
          ip: req.headers.get("x-forwarded-for") ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
        },
      });
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(
      { event: "oauth.gmail.persist_failed", orgId, error },
      "gmail connection persist failed",
    );
    return NextResponse.redirect(new URL("/connections?error=oauth_persist", oauthBase(req)));
  }

  logger.info({ orgId, mailboxEmail, event: "connection.created" }, "gmail mailbox connected");

  const res = NextResponse.redirect(new URL("/connections?connected=gmail", oauthBase(req)));
  res.cookies.delete("oauth_state_sig");
  return res;
}
