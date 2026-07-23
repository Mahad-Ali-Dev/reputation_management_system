import { auth } from "@/lib/auth/config";
import {
  buildAuthorizeUrl,
  loadProviderApp,
  signProviderState,
} from "@/lib/connections/oauth-helpers";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/hubspot/authorize
 *
 * Step 1 of OAuth: build authorize URL + redirect.
 * State cookie binds the request to this browser to prevent CSRF.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const app = await loadProviderApp("hubspot");
  if (!app) {
    return NextResponse.redirect(new URL("/connections?error=hubspot_not_configured", req.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/hubspot/callback`;

  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "hubspot" });

  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: app.oauthUrl ?? "https://app.hubspot.com/oauth/authorize",
    clientId: app.clientId,
    redirectUri,
    scopes: app.scopes,
    state,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("oauth_hubspot_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  return response;
}
