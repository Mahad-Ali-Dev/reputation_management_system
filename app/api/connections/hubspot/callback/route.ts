import { auth } from "@/lib/auth/config";
import {
  exchangeCodeForTokens,
  loadProviderApp,
  saveConnection,
  verifyProviderState,
} from "@/lib/connections/oauth-helpers";
import { logger } from "@/lib/logger";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/hubspot/callback
 *
 * Step 2 of OAuth: exchange the code → tokens, save the connection, redirect to /connections.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    logger.warn({ event: "connection.oauth.user_denied", provider: "hubspot", error });
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(error)}`, req.url),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/connections?error=missing_code_or_state", req.url));
  }

  const cookieHash = req.cookies.get("oauth_hubspot_cookie")?.value;
  if (!cookieHash) {
    return NextResponse.redirect(new URL("/connections?error=missing_oauth_cookie", req.url));
  }

  try {
    const verified = await verifyProviderState({
      state,
      cookieHash,
      sessionUserId: userId,
      sessionOrgId: orgId,
      expectedProvider: "hubspot",
    });

    const app = await loadProviderApp("hubspot");
    if (!app) throw new Error("hubspot_not_configured");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
    const redirectUri = `${appUrl}/api/connections/hubspot/callback`;

    const tokens = await exchangeCodeForTokens({
      tokenUrl: app.tokenUrl ?? "https://api.hubapi.com/oauth/v1/token",
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code,
      redirectUri,
      authMode: "body",
    });

    // Probe identity to get account info
    const identity = await fetch(
      "https://api.hubapi.com/oauth/v1/access-tokens/" + tokens.accessToken,
      {
        headers: { accept: "application/json" },
      },
    );
    let accountLabel = "HubSpot account";
    let externalId: string | undefined;
    if (identity.ok) {
      const data = (await identity.json()) as {
        hub_domain?: string;
        hub_id?: number;
        user?: string;
      };
      accountLabel = data.hub_domain ?? data.user ?? "HubSpot account";
      externalId = data.hub_id ? String(data.hub_id) : undefined;
    }

    await saveConnection({
      orgId: verified.orgId,
      provider: "hubspot",
      accountLabel,
      externalId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
      scopes: app.scopes,
    });

    const response = NextResponse.redirect(new URL("/connections?connected=hubspot", req.url));
    response.cookies.delete("oauth_hubspot_cookie");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "hubspot", error: msg });
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent(msg)}`, req.url));
  }
}
