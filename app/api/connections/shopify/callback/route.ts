import { createHmac, timingSafeEqual } from "node:crypto";
import { auth } from "@/lib/auth/config";
import {
  exchangeCodeForTokens,
  loadProviderApp,
  saveConnection,
  verifyProviderState,
} from "@/lib/connections/oauth-helpers";
import { logger } from "@/lib/logger";
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

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const shop = req.nextUrl.searchParams.get("shop");
  const hmac = req.nextUrl.searchParams.get("hmac");

  if (!code || !state || !shop) {
    return NextResponse.redirect(new URL("/connections?error=missing_params", oauthBase(req)));
  }

  const cookieHash = req.cookies.get("oauth_shopify_cookie")?.value;
  const cookieShop = req.cookies.get("oauth_shopify_shop")?.value;
  if (!cookieHash || cookieShop !== shop) {
    return NextResponse.redirect(new URL("/connections?error=shop_mismatch", oauthBase(req)));
  }

  try {
    const verified = await verifyProviderState({
      state,
      cookieHash,
      sessionUserId: userId,
      sessionOrgId: orgId,
      expectedProvider: "shopify",
    });

    const app = await loadProviderApp("shopify");
    if (!app) throw new Error("shopify_not_configured");

    // Shopify HMAC verification: MANDATORY. Re-compute over sorted query params
    // (minus hmac). Omitting `hmac` must NOT skip the check — it's the only
    // cryptographic integrity guarantee on the query string (which feeds the
    // token-exchange host below).
    if (!hmac) {
      throw new Error("missing_hmac");
    }
    const params = Array.from(req.nextUrl.searchParams.entries())
      .filter(([k]) => k !== "hmac" && k !== "signature")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const computed = createHmac("sha256", app.clientSecret).update(params).digest("hex");
    const computedBuf = Buffer.from(computed);
    const hmacBuf = Buffer.from(hmac);
    if (computedBuf.length !== hmacBuf.length || !timingSafeEqual(computedBuf, hmacBuf)) {
      throw new Error("hmac_mismatch");
    }

    const tokens = await exchangeCodeForTokens({
      tokenUrl: `https://${shop}/admin/oauth/access_token`,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code,
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", oauthBase(req)).origin}/api/connections/shopify/callback`,
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

    const response = NextResponse.redirect(
      new URL("/connections?connected=shopify", oauthBase(req)),
    );
    response.cookies.delete("oauth_shopify_cookie");
    response.cookies.delete("oauth_shopify_shop");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "shopify", error: msg });
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(msg)}`, oauthBase(req)),
    );
  }
}
