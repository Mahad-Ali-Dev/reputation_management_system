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

/**
 * GET /api/connections/shopify/authorize?shop=mystore.myshopify.com
 *
 * Shopify-specific: requires `shop` query param identifying the store.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", oauthBase(req)));
  }

  const shop = req.nextUrl.searchParams.get("shop");
  if (!shop || !/^[a-z0-9-]+\.myshopify\.com$/i.test(shop)) {
    return NextResponse.redirect(new URL("/connections?error=invalid_shop_domain", oauthBase(req)));
  }

  const app = await loadProviderApp("shopify");
  if (!app) {
    return NextResponse.redirect(
      new URL("/connections?error=shopify_not_configured", oauthBase(req)),
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/shopify/callback`;
  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "shopify" });

  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: `https://${shop}/admin/oauth/authorize`,
    clientId: app.clientId,
    redirectUri,
    scopes: app.scopes,
    state,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("oauth_shopify_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  response.cookies.set("oauth_shopify_shop", shop, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
