import { auth } from "@/lib/auth/config";
import { resolveOAuthCredentials } from "@/lib/connections/oauth-helpers";
import { logger } from "@/lib/logger";
import { oauthCallbackUrl } from "@/lib/oauth/redirect";
import { signOAuthState } from "@/lib/oauth/state";
import { PROVIDERS } from "@/lib/providers/registry";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/linkedin/authorize
 *
 * Starts the LinkedIn OAuth 2.0 connect flow (authorization-code). Mirrors the
 * Google / Gmail connect routes (signed-state JWT + cookie hash). LinkedIn's
 * authorization-code grant does NOT use PKCE, so we sign state for CSRF/replay
 * defense but don't send a code_challenge. The connection is ORG-level.
 *
 * Env-gated: with no `LINKEDIN_CLIENT_ID` we fail SOFT back to the connections
 * page (`?error=linkedin_not_configured`). Live publishing additionally requires
 * `LINKEDIN_PUBLISH_ENABLED` (enforced in the publish adapter, not here).
 *
 * Scopes: `openid profile` to resolve the member id at connect, plus
 * `w_member_social` so the publish adapter can author posts as the member.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Admin-configured credentials (DB) win; env is the fallback so existing
  // env-only deployments keep working. Before this the admin screen could show
  // LinkedIn as "configured" while this route ignored it entirely.
  const creds = await resolveOAuthCredentials(
    "linkedin",
    process.env.LINKEDIN_CLIENT_ID,
    process.env.LINKEDIN_CLIENT_SECRET,
  );
  if (!creds) {
    logger.warn({ event: "oauth.linkedin.not_configured" });
    return NextResponse.redirect(new URL("/connections?error=linkedin_not_configured", req.url));
  }
  const clientId = creds.clientId;

  const { state, cookieHash } = await signOAuthState({ orgId, userId, provider: "linkedin" });

  const callbackUrl = oauthCallbackUrl("linkedin");

  // `w_member_social` (post on behalf of the member) + OIDC scopes to resolve
  // the member id at connect for the author URN.
  const scopes = ["openid", "profile", "w_member_social"];

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: scopes.join(" "),
    state,
  });

  const authorizeUrl = `${PROVIDERS.linkedin?.oauthUrl ?? "https://www.linkedin.com/oauth/v2/authorization"}?${params.toString()}`;

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("oauth_state_sig", cookieHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
