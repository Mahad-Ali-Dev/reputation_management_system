import { auth } from "@/lib/auth/config";
import { GRAPH_VERSION, fetchMetaPages } from "@/lib/connections/adapters/meta";
import { saveConnectionSoft } from "@/lib/connections/adapters/route-helpers";
import {
  exchangeCodeForTokens,
  loadProviderApp,
  verifyProviderState,
} from "@/lib/connections/oauth-helpers";
import { logger } from "@/lib/logger";
import { oauthBase } from "@/lib/oauth/redirect";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/meta/callback — Meta combined OAuth completion.
 *
 * Exchange code → short-lived user token → long-lived token (Graph), probe
 * `/me/accounts` for the Page + linked IG Business id, then save a SINGLE
 * `meta` connection that both Steps 9 and 10 consume. Fail-soft on the stale
 * provider CHECK (redirects to `?error=meta_not_configured`).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", oauthBase(req)));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    logger.warn({ event: "connection.oauth.user_denied", provider: "meta", error });
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(error)}`, oauthBase(req)),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/connections?error=missing_code_or_state", oauthBase(req)),
    );
  }

  const cookieHash = req.cookies.get("oauth_meta_cookie")?.value;
  if (!cookieHash) {
    return NextResponse.redirect(
      new URL("/connections?error=missing_oauth_cookie", oauthBase(req)),
    );
  }

  try {
    const verified = await verifyProviderState({
      state,
      cookieHash,
      sessionUserId: userId,
      sessionOrgId: orgId,
      expectedProvider: "meta",
    });

    const app = await loadProviderApp("meta");
    if (!app) throw new Error("meta_not_configured");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", oauthBase(req)).origin;
    const redirectUri = `${appUrl}/api/connections/meta/callback`;

    // Step 1: code → short-lived user token. Meta's token endpoint takes creds
    // in the query/body and returns JSON.
    const tokens = await exchangeCodeForTokens({
      tokenUrl: app.tokenUrl ?? `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`,
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code,
      redirectUri,
      authMode: "body",
    });

    // Step 2: short-lived → long-lived token (best-effort; fall back to the
    // short-lived token if the exchange fails).
    let longLived = tokens.accessToken;
    let expiresAt: Date | undefined = tokens.expiresIn
      ? new Date(Date.now() + tokens.expiresIn * 1000)
      : undefined;
    try {
      const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", app.clientId);
      url.searchParams.set("client_secret", app.clientSecret);
      url.searchParams.set("fb_exchange_token", tokens.accessToken);
      const ll = await fetch(url.toString(), { headers: { accept: "application/json" } });
      if (ll.ok) {
        const data = (await ll.json()) as { access_token?: string; expires_in?: number };
        if (data.access_token) longLived = data.access_token;
        if (typeof data.expires_in === "number") {
          expiresAt = new Date(Date.now() + data.expires_in * 1000);
        }
      }
    } catch {
      // keep short-lived token; sync/refresh handles renewal later
    }

    // Step 3: probe Pages + linked IG business account.
    const pages = await fetchMetaPages(longLived);
    const primary = pages[0] ?? null;
    const accountLabel = primary
      ? primary.instagramBusinessId
        ? `${primary.pageName} (FB + IG)`
        : `${primary.pageName} (FB)`
      : "Meta account";

    const saved = await saveConnectionSoft({
      orgId: verified.orgId,
      provider: "meta",
      accountLabel,
      externalId: primary?.pageId,
      accessToken: longLived,
      refreshToken: tokens.refreshToken,
      expiresAt,
      scopes: app.scopes,
    });
    if (!saved.ok) {
      return NextResponse.redirect(
        new URL("/connections?error=meta_not_configured", oauthBase(req)),
      );
    }

    const response = NextResponse.redirect(new URL("/connections?connected=meta", oauthBase(req)));
    response.cookies.delete("oauth_meta_cookie");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "meta", error: msg });
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(msg)}`, oauthBase(req)),
    );
  }
}
