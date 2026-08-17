import { auth } from "@/lib/auth/config";
import {
  buildAuthorizeUrl,
  loadProviderApp,
  signProviderState,
} from "@/lib/connections/oauth-helpers";
import { oauthBase } from "@/lib/oauth/redirect";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", oauthBase(req)));
  }
  const app = await loadProviderApp("klaviyo");
  if (!app) {
    return NextResponse.redirect(
      new URL("/connections?error=klaviyo_not_configured", oauthBase(req)),
    );
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/klaviyo/callback`;
  const { state, cookieHash, pkceChallenge } = await signProviderState({
    orgId,
    userId,
    provider: "klaviyo",
  });
  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: app.oauthUrl ?? "https://www.klaviyo.com/oauth/authorize",
    clientId: app.clientId,
    redirectUri,
    scopes: app.scopes,
    state,
    pkceChallenge,
  });
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("oauth_klaviyo_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
