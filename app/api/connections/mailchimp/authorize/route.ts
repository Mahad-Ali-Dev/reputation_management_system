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
  const app = await loadProviderApp("mailchimp");
  if (!app) {
    return NextResponse.redirect(
      new URL("/connections?error=mailchimp_not_configured", oauthBase(req)),
    );
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/mailchimp/callback`;
  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "mailchimp" });
  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: app.oauthUrl ?? "https://login.mailchimp.com/oauth2/authorize",
    clientId: app.clientId,
    redirectUri,
    scopes: app.scopes,
    state,
  });
  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("oauth_mailchimp_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
