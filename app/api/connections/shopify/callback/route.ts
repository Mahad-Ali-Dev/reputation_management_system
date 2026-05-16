import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { auth } from "@/lib/auth/config";
import {
  exchangeCodeForTokens,
  loadProviderApp,
  saveConnection,
  verifyProviderState,
} from "@/lib/connections/oauth-helpers";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const shop = req.nextUrl.searchParams.get("shop");
  const hmac = req.nextUrl.searchParams.get("hmac");

  if (!code || !state || !shop) {
    return NextResponse.redirect(new URL("/connections?error=missing_params", req.url));
  }

  const cookieHash = req.cookies.get("oauth_shopify_cookie")?.value;
  const cookieShop = req.cookies.get("oauth_shopify_shop")?.value;
  if (!cookieHash || cookieShop !== shop) {
    return NextResponse.redirect(new URL("/connections?error=shop_mismatch", req.url));
  }

  try {
    const verified = await verifyProviderState({
      state,
      cookieHash,
      sessionUserId: userId,
      expectedProvider: "shopify",
    });

    const app = await loadProviderApp("shopify");
    if (!app) throw new Error("shopify_not_configured");

    // Shopify HMAC verification: re-compute over sorted query params (minus hmac)
    if (hmac) {
      const params = Array.from(req.nextUrl.searchParams.entries())
        .filter(([k]) => k !== "hmac" && k !== "signature")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("&");
      const computed = createHmac("sha256", app.clientSecret).update(params).digest("hex");
      if (computed !== hmac) {
        throw new Error("hmac_mismatch");
      }
    }

    const tokens = await exchangeCodeForTokens({
      tokenUrl: `https://${shop}/admin/oauth/access_token`,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code,
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin}/api/connections/shopify/callback`,
      authMode: "body",
    });

    await saveConnection({
      orgId: verified.orgId,
      provider: "shopify",
      accountLabel: shop,
      externalId: shop,
      accessToken: tokens.accessToken,
      scopes: app.scopes,
    });

    const response = NextResponse.redirect(new URL("/connections?connected=shopify", req.url));
    response.cookies.delete("oauth_shopify_cookie");
    response.cookies.delete("oauth_shopify_shop");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "shopify", error: msg });
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent(msg)}`, req.url));
  }
}
