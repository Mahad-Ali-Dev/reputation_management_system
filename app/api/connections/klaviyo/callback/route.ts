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

export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/connections?error=missing_params", req.url));
  }
  const cookieHash = req.cookies.get("oauth_klaviyo_cookie")?.value;
  if (!cookieHash) {
    return NextResponse.redirect(new URL("/connections?error=missing_oauth_cookie", req.url));
  }
  try {
    const verified = await verifyProviderState({
      state,
      cookieHash,
      sessionUserId: userId,
      sessionOrgId: orgId,
      expectedProvider: "klaviyo",
    });
    const app = await loadProviderApp("klaviyo");
    if (!app) throw new Error("klaviyo_not_configured");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;

    const tokens = await exchangeCodeForTokens({
      tokenUrl: app.tokenUrl ?? "https://a.klaviyo.com/oauth/token",
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code,
      redirectUri: `${appUrl}/api/connections/klaviyo/callback`,
      pkceVerifier: verified.pkceVerifier,
      authMode: "basic",
    });

    // Probe identity — Klaviyo /api/accounts requires the token
    const identity = await fetch("https://a.klaviyo.com/api/accounts", {
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        accept: "application/vnd.api+json",
        revision: "2024-06-15",
      },
    });
    let accountLabel = "Klaviyo account";
    let externalId: string | undefined;
    if (identity.ok) {
      const data = (await identity.json()) as {
        data?: Array<{
          id: string;
          attributes?: { contact_information?: { organization_name?: string } };
        }>;
      };
      const first = data.data?.[0];
      if (first) {
        externalId = first.id;
        accountLabel =
          first.attributes?.contact_information?.organization_name ?? `Klaviyo (${first.id})`;
      }
    }

    await saveConnection({
      orgId: verified.orgId,
      provider: "klaviyo",
      accountLabel,
      externalId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
      scopes: app.scopes,
    });

    const response = NextResponse.redirect(new URL("/connections?connected=klaviyo", req.url));
    response.cookies.delete("oauth_klaviyo_cookie");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "klaviyo", error: msg });
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent(msg)}`, req.url));
  }
}
