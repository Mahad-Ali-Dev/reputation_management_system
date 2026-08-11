import { auth } from "@/lib/auth/config";
import { resolveOAuthCredentials, saveConnection } from "@/lib/connections/oauth-helpers";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { oauthBase, oauthCallbackUrl } from "@/lib/oauth/redirect";
import { verifyAndConsumeOAuthState } from "@/lib/oauth/state";
import { PROVIDERS } from "@/lib/providers/registry";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/linkedin/callback?code=...&state=...
 *
 * Completes the LinkedIn OAuth 2.0 flow:
 *   1. Verify state JWT + cookie hash + single-use nonce (provider "linkedin")
 *   2. Exchange code for tokens (client_secret in body; no PKCE)
 *   3. Probe the OIDC userinfo endpoint for the member `sub` → build the
 *      `urn:li:person:{sub}` author URN
 *   4. Persist Connection(provider:"linkedin") with envelope-encrypted tokens.
 *      The author URN is the externalId the publish adapter reads (post author).
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
    logger.warn({ event: "oauth.linkedin.user_denied", err: errParam });
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

  // Step 1: state verification (CSRF + replay + org/user binding)
  let verified: Awaited<ReturnType<typeof verifyAndConsumeOAuthState>>;
  try {
    verified = await verifyAndConsumeOAuthState({
      state,
      cookieHash,
      expectedProvider: "linkedin",
      sessionUserId,
      sessionOrgId: orgId,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.warn({ event: "oauth.linkedin.state_invalid", error });
    return NextResponse.redirect(new URL("/connections?error=oauth_state_invalid", oauthBase(req)));
  }
  // `verified` is consumed for its CSRF/replay side effects; LinkedIn has no PKCE
  // verifier to forward to the token exchange.
  void verified;

  // Step 2: code → tokens (client_secret in body; LinkedIn does not use PKCE)
  const creds = await resolveOAuthCredentials(
    "linkedin",
    process.env.LINKEDIN_CLIENT_ID,
    process.env.LINKEDIN_CLIENT_SECRET,
  );
  const clientId = creds?.clientId;
  const clientSecret = creds?.clientSecret;
  const redirectUri = oauthCallbackUrl("linkedin");
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/connections?error=linkedin_not_configured", oauthBase(req)),
    );
  }

  const tokenUrl = PROVIDERS.linkedin?.tokenUrl ?? "https://www.linkedin.com/oauth/v2/accessToken";

  let tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
  };
  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      logger.error(
        {
          event: "oauth.linkedin.token_exchange_failed",
          status: tokenRes.status,
          body: text.slice(0, 300),
        },
        "linkedin token exchange failed",
      );
      return NextResponse.redirect(
        new URL("/connections?error=oauth_token_exchange", oauthBase(req)),
      );
    }
    tokens = (await tokenRes.json()) as typeof tokens;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ event: "oauth.linkedin.token_exchange_error", error });
    return NextResponse.redirect(
      new URL("/connections?error=oauth_token_exchange", oauthBase(req)),
    );
  }

  if (!tokens.access_token) {
    return NextResponse.redirect(
      new URL("/connections?error=oauth_token_exchange", oauthBase(req)),
    );
  }

  // Step 3: probe OIDC userinfo for the member `sub` → author URN. The URN is
  // the externalId the publish adapter reads as the post author.
  let memberSub: string | undefined;
  let displayName: string | undefined;
  try {
    const me = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" },
    });
    if (me.ok) {
      const json = (await me.json()) as { sub?: string; name?: string };
      memberSub = typeof json.sub === "string" ? json.sub : undefined;
      displayName = json.name;
    }
  } catch {
    // Non-fatal — without the member id the publish adapter can't resolve an
    // author URN, but the connection still persists for re-sync.
  }

  const externalId = memberSub ? `urn:li:person:${memberSub}` : undefined;
  const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined;
  const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? [];
  const accountLabel = displayName ?? "LinkedIn";

  // Step 4: persist with provider "linkedin" (publish dispatcher's lookup key).
  try {
    const saved = await saveConnection({
      orgId,
      establishmentId: null,
      provider: "linkedin",
      accountLabel,
      externalId, // urn:li:person:{sub} — the publish adapter's author URN
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
          afterData: { provider: "linkedin", accountLabel, scopes },
          ip: req.headers.get("x-forwarded-for") ?? null,
          userAgent: req.headers.get("user-agent") ?? null,
        },
      });
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(
      { event: "oauth.linkedin.persist_failed", orgId, error },
      "linkedin connection persist failed",
    );
    return NextResponse.redirect(new URL("/connections?error=oauth_persist", oauthBase(req)));
  }

  logger.info({ orgId, displayName, event: "connection.created" }, "linkedin connected");

  const res = NextResponse.redirect(new URL("/connections?connected=linkedin", oauthBase(req)));
  res.cookies.delete("oauth_state_sig");
  return res;
}
