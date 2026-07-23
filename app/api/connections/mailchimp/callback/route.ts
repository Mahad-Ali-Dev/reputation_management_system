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
  if (!code || !state) {
    return NextResponse.redirect(new URL("/connections?error=missing_params", oauthBase(req)));
  }
  const cookieHash = req.cookies.get("oauth_mailchimp_cookie")?.value;
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
      expectedProvider: "mailchimp",
    });
    const app = await loadProviderApp("mailchimp");
    if (!app) throw new Error("mailchimp_not_configured");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", oauthBase(req)).origin;
    const tokens = await exchangeCodeForTokens({
      tokenUrl: app.tokenUrl ?? "https://login.mailchimp.com/oauth2/token",
      clientId: app.clientId,
      clientSecret: app.clientSecret,
      code,
      redirectUri: `${appUrl}/api/connections/mailchimp/callback`,
      authMode: "body",
    });

    // Mailchimp returns access_token + we need to call /metadata to get the data center
    const metaRes = await fetch("https://login.mailchimp.com/oauth2/metadata", {
      headers: { authorization: `OAuth ${tokens.accessToken}`, accept: "application/json" },
    });
    let accountLabel = "Mailchimp";
    let externalId: string | undefined;
    if (metaRes.ok) {
      const data = (await metaRes.json()) as {
        dc?: string;
        login?: { email?: string; login_email?: string };
        user_id?: number;
      };
      accountLabel = data.login?.email ?? data.login?.login_email ?? `Mailchimp (${data.dc})`;
      externalId = data.user_id ? `${data.user_id}@${data.dc}` : data.dc;
    }

    await saveConnection({
      orgId: verified.orgId,
      provider: "mailchimp",
      accountLabel,
      externalId,
      accessToken: tokens.accessToken,
      scopes: app.scopes,
    });

    const response = NextResponse.redirect(
      new URL("/connections?connected=mailchimp", oauthBase(req)),
    );
    response.cookies.delete("oauth_mailchimp_cookie");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "mailchimp", error: msg });
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(msg)}`, oauthBase(req)),
    );
  }
}
