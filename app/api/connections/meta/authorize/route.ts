import { auth } from "@/lib/auth/config";
import { META_PROVIDER } from "@/lib/connections/adapters/meta-overlay";
import {
  buildAuthorizeUrl,
  loadProviderApp,
  signProviderState,
} from "@/lib/connections/oauth-helpers";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/meta/authorize — Meta combined OAuth start.
 *
 * ONE consent requesting Facebook Pages + Instagram Business scopes, so a single
 * connection powers both the inbox (Step 9) and the post creator (Step 10).
 * Mirrors the hubspot authorize pattern: session → loadProviderApp →
 * signProviderState → redirect, with a bound `oauth_meta_cookie`.
 *
 * Env-gated: with no configured `meta` provider app, redirects to
 * `?error=meta_not_configured` (never a live call without creds).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const app = await loadProviderApp("meta");
  if (!app) {
    return NextResponse.redirect(new URL("/connections?error=meta_not_configured", req.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/meta/callback`;
  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "meta" });

  // Prefer the admin-configured scopes; fall back to the combined set so a
  // misconfigured app still requests FB Pages + IG together.
  const scopes = app.scopes.length > 0 ? app.scopes : (META_PROVIDER.scopes ?? []);

  const authorizeUrl = buildAuthorizeUrl({
    baseUrl:
      app.oauthUrl ?? META_PROVIDER.oauthUrl ?? "https://www.facebook.com/v19.0/dialog/oauth",
    clientId: app.clientId,
    redirectUri,
    scopes,
    state,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("oauth_meta_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
