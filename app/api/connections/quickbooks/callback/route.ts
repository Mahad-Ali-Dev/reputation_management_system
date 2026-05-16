import { NextResponse, type NextRequest } from "next/server";
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
  // QuickBooks passes the realmId (company id) in the callback
  const realmId = req.nextUrl.searchParams.get("realmId");

  if (!code || !state || !realmId) {
    return NextResponse.redirect(new URL("/connections?error=missing_params", req.url));
  }
  const cookieHash = req.cookies.get("oauth_quickbooks_cookie")?.value;
  if (!cookieHash) {
    return NextResponse.redirect(new URL("/connections?error=missing_oauth_cookie", req.url));
  }
  try {
    const verified = await verifyProviderState({
      state, cookieHash, sessionUserId: userId, expectedProvider: "quickbooks",
    });
    const app = await loadProviderApp("quickbooks");
    if (!app) throw new Error("quickbooks_not_configured");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;

    const tokens = await exchangeCodeForTokens({
      tokenUrl: app.tokenUrl ?? "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code,
      redirectUri: `${appUrl}/api/connections/quickbooks/callback`,
      authMode: "basic",
    });

    // Probe identity — QuickBooks company info endpoint
    let accountLabel = `QuickBooks ${realmId}`;
    const companyRes = await fetch(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}`,
      {
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
          accept: "application/json",
        },
      },
    );
    if (companyRes.ok) {
      const data = (await companyRes.json()) as { CompanyInfo?: { CompanyName?: string; LegalName?: string } };
      accountLabel = data.CompanyInfo?.CompanyName ?? data.CompanyInfo?.LegalName ?? accountLabel;
    }

    await saveConnection({
      orgId: verified.orgId,
      provider: "quickbooks",
      accountLabel,
      externalId: realmId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
      scopes: app.scopes,
    });

    const response = NextResponse.redirect(new URL("/connections?connected=quickbooks", req.url));
    response.cookies.delete("oauth_quickbooks_cookie");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "quickbooks", error: msg });
    return NextResponse.redirect(new URL(`/connections?error=${encodeURIComponent(msg)}`, req.url));
  }
}
