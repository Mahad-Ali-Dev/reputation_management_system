import { auth } from "@/lib/auth/config";
import {
  buildAuthorizeUrl,
  loadProviderApp,
  signProviderState,
} from "@/lib/connections/oauth-helpers";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const app = await loadProviderApp("quickbooks");
  if (!app) {
    return NextResponse.redirect(new URL("/connections?error=quickbooks_not_configured", req.url));
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/quickbooks/callback`;
  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "quickbooks" });
  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: app.oauthUrl ?? "https://appcenter.intuit.com/connect/oauth2",
    clientId: app.clientId,
    redirectUri,
    scopes: app.scopes,
    state,
  });
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("oauth_quickbooks_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
