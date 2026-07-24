import { auth } from "@/lib/auth/config";
import { saveConnection } from "@/lib/connections/oauth-helpers";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { oauthBase, oauthCallbackUrl } from "@/lib/oauth/redirect";
import { verifyAndConsumeOAuthState } from "@/lib/oauth/state";
import { PROVIDERS } from "@/lib/providers/registry";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/twitter/callback?code=...&state=...
 *
 * Completes the X (Twitter) OAuth 2.0 + PKCE flow:
 *   1. Verify state JWT + cookie hash + single-use nonce (provider "twitter")
 *   2. Exchange code + PKCE verifier for tokens (confidential client → HTTP
 *      Basic auth with client_id:client_secret)
 *   3. Probe GET /2/users/me for the connected handle + numeric user id
 *   4. Persist Connection(provider:"x") with envelope-encrypted tokens. The
 *      numeric user id is the externalId the publish adapter reads (mentions +
 *      tweet author). We store provider `"x"` — NOT `"twitter"` — because the
 *      publish dispatcher maps platform `twitter → provider "x"`.
 *   5. Audit-log + redirect back to /connections (same-site only).
 *
 * Fail-soft: every error path redirects to /connections?error=... — we never
 * build a redirect from raw user input.
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
    logger.warn({ event: "oauth.twitter.user_denied", err: errParam });
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
      expectedProvider: "twitter",
      sessionUserId,
      sessionOrgId: orgId,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "oauth.twitter.state_invalid", error });
    return NextResponse.redirect(new URL("/connections?error=oauth_state_invalid", oauthBase(req)));
  }

  // Step 2: code → tokens (PKCE; confidential client uses HTTP Basic auth)
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = oauthCallbackUrl("twitter");
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/connections?error=twitter_not_configured", oauthBase(req)),
    );
  }

  const tokenUrl = PROVIDERS.twitter?.tokenUrl ?? "https://api.twitter.com/2/oauth2/token";
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  // Confidential clients authenticate with HTTP Basic; public clients send the
  // client_id in the body only. We always include client_id in the body too —
  // X requires it for the PKCE grant.
  if (clientSecret) {
    headers.authorization =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }

  let tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verified.pkceVerifier,
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      logger.error(
        {
          event: "oauth.twitter.token_exchange_failed",
          status: tokenRes.status,
          body: text.slice(0, 300),
        },
        "twitter token exchange failed",
      );
      return NextResponse.redirect(
        new URL("/connections?error=oauth_token_exchange", oauthBase(req)),
      );
    }
    tokens = (await tokenRes.json()) as typeof tokens;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ event: "oauth.twitter.token_exchange_error", error });
    return NextResponse.redirect(
      new URL("/connections?error=oauth_token_exchange", oauthBase(req)),
    );
  }

  if (!tokens.access_token) {
    return NextResponse.redirect(
      new URL("/connections?error=oauth_token_exchange", oauthBase(req)),
    );
  }

  // Step 3: probe GET /2/users/me for the numeric user id + handle. The numeric
  // id is the externalId the publish adapter reads (tweet author + mentions).
  let externalId: string | undefined;
  let handle: string | undefined;
  try {
    const me = await fetch("https://api.twitter.com/2/users/me", {
      headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" },
    });
    if (me.ok) {
      const json = (await me.json()) as {
        data?: { id?: string; username?: string; name?: string };
      };
      externalId = json.data?.id;
      handle = json.data?.username ?? json.data?.name;
    }
  } catch {
    // Non-fatal — without the id the publish adapter can't read mentions, but
    // the connection still persists so the user can re-sync.
  }

  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined;
  const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? [];
  const accountLabel = handle ? `@${handle}` : "X (Twitter)";

  // Step 4: persist with provider "x" (publish dispatcher's lookup key).
  try {
    const saved = await saveConnection({
      orgId,
      establishmentId: null,
      provider: "x",
      accountLabel,
      externalId, // numeric X user id — the publish adapter's author/mentions key
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
          afterData: { provider: "x", accountLabel, scopes },
          ip: req.headers.get("x-forwarded-for") ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
        },
      });
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(
      { event: "oauth.twitter.persist_failed", orgId, error },
      "twitter connection persist failed",
    );
    return NextResponse.redirect(new URL("/connections?error=oauth_persist", oauthBase(req)));
  }

  logger.info({ orgId, handle, event: "connection.created" }, "x (twitter) connected");

  const res = NextResponse.redirect(new URL("/connections?connected=twitter", oauthBase(req)));
  res.cookies.delete("oauth_state_sig");
  return res;
}
