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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin).replace(
    /\/+$/,
    "",
  );
  const redirectUri = `${appUrl}/api/connections/meta/callback`;
  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "meta" });

  // Prefer the admin-configured scopes; fall back to the combined set so a
  // misconfigured app still requests FB Pages + IG together.
  const scopes = app.scopes.length > 0 ? app.scopes : (META_PROVIDER.scopes ?? []);

  // FACEBOOK LOGIN FOR BUSINESS vs classic Facebook Login.
  //
  // Meta now defaults business apps to "Facebook Login for Business", whose
  // dialog does NOT accept `scope=`. Permissions come from a Configuration you
  // create in the app dashboard, referenced by `config_id`. Sending the classic
  // scope-based request to such an app fails with a misleading
  // "Can't load URL / domain isn't included in the app's domains" — which sends
  // you chasing App Domains settings that were never the problem.
  //
  // Set META_LOGIN_CONFIG_ID to the Configuration ID to use that flow; leave it
  // unset for apps with the classic Facebook Login product.
  const configId = process.env.META_LOGIN_CONFIG_ID?.trim();

  const authorizeUrl = buildAuthorizeUrl({
    baseUrl:
      app.oauthUrl ?? META_PROVIDER.oauthUrl ?? "https://www.facebook.com/v19.0/dialog/oauth",
    clientId: app.clientId,
    redirectUri,
    // config_id carries the permissions — sending scope alongside it is rejected.
    scopes: configId ? [] : scopes,
    state,
    ...(configId ? { extraParams: { config_id: configId } } : {}),
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
