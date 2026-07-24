import { auth } from "@/lib/auth/config";
import { logger } from "@/lib/logger";
import { oauthCallbackUrl } from "@/lib/oauth/redirect";
import { signOAuthState } from "@/lib/oauth/state";
import { PROVIDERS } from "@/lib/providers/registry";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/twitter/authorize
 *
 * Starts the X (Twitter) OAuth 2.0 + PKCE connect flow. Mirrors the Google /
 * Gmail connect routes exactly (signed-state JWT + cookie hash + PKCE
 * challenge). The X mailbox/handle is ORG-level (not tied to an establishment),
 * so there's no establishmentId to stash.
 *
 * Env-gated: with no `X_CLIENT_ID` we fail SOFT back to the connections page
 * (`?error=twitter_not_configured`) — never a live call without creds. Live
 * publishing additionally requires the paid-tier flag `TWITTER_PUBLISH_ENABLED`,
 * which is enforced in the publish adapter, not here.
 *
 * NOTE: the route path uses the registry id `twitter`, but the persisted
 * `Connection.provider` is `"x"` (see the callback) so the publish dispatcher's
 * `platformToProvider("twitter") → "x"` lookup resolves it.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) {
    logger.warn({ event: "oauth.twitter.not_configured" });
    return NextResponse.redirect(new URL("/connections?error=twitter_not_configured", req.url));
  }

  const {
    state,
    cookieHash,
    pkceChallenge: challenge,
  } = await signOAuthState({ orgId, userId, provider: "twitter" });

  const callbackUrl = oauthCallbackUrl("twitter");

  const scopes = PROVIDERS.twitter?.scopes ?? [
    "tweet.read",
    "tweet.write",
    "users.read",
    "offline.access",
  ];

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    // `offline.access` is required for a refresh token; include it even if the
    // registry scope list omits it.
    scope: Array.from(new Set([...scopes, "offline.access"])).join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authorizeUrl = `${PROVIDERS.twitter?.oauthUrl ?? "https://twitter.com/i/oauth2/authorize"}?${params.toString()}`;

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
