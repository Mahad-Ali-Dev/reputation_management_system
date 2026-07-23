import { auth } from "@/lib/auth/config";
import { saveConnectionSoft } from "@/lib/connections/adapters/route-helpers";
import { squareApiBase, squareEnvConfigured } from "@/lib/connections/adapters/square";
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
 * GET /api/connections/square/callback — exchange code, probe `/v2/merchants`
 * for the merchant id/name, save a `square` connection. Fail-soft on the stale
 * provider CHECK.
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
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(error)}`, oauthBase(req)),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/connections?error=missing_code_or_state", oauthBase(req)),
    );
  }

  const cookieHash = req.cookies.get("oauth_square_cookie")?.value;
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
      expectedProvider: "square",
    });

    const app = await loadProviderApp("square");
    const clientId = app?.clientId ?? process.env.SQUARE_APP_ID;
    const clientSecret = app?.clientSecret ?? process.env.SQUARE_APP_SECRET;
    if (!clientId || !clientSecret || (!app && !squareEnvConfigured())) {
      throw new Error("square_not_configured");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", oauthBase(req)).origin;
    const redirectUri = `${appUrl}/api/connections/square/callback`;

    const tokens = await exchangeCodeForTokens({
      tokenUrl: `${squareApiBase()}/oauth2/token`,
      clientId,
      clientSecret,
      code,
      redirectUri,
      contentType: "json",
      authMode: "body",
    });

    // Identity probe: GET /v2/merchants.
    let accountLabel = "Square merchant";
    let externalId: string | undefined;
    try {
      const probe = await fetch(`${squareApiBase()}/v2/merchants`, {
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
          "Square-Version": "2024-01-18",
          accept: "application/json",
        },
      });
      if (probe.ok) {
        const data = (await probe.json()) as {
          merchant?: Array<{ id?: string; business_name?: string }>;
        };
        const m = data.merchant?.[0];
        if (m?.business_name) accountLabel = m.business_name;
        if (m?.id) externalId = m.id;
      }
    } catch {
      /* identity probe is best-effort */
    }

    const saved = await saveConnectionSoft({
      orgId: verified.orgId,
      provider: "square",
      accountLabel,
      externalId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
      scopes: app?.scopes ?? ["CUSTOMERS_READ", "MERCHANT_PROFILE_READ"],
    });
    if (!saved.ok) {
      return NextResponse.redirect(
        new URL("/connections?error=square_not_configured", oauthBase(req)),
      );
    }

    const response = NextResponse.redirect(
      new URL("/connections?connected=square", oauthBase(req)),
    );
    response.cookies.delete("oauth_square_cookie");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "square", error: msg });
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(msg)}`, oauthBase(req)),
    );
  }
}
