import { auth } from "@/lib/auth/config";
import { cloverApiBase, cloverEnvConfigured } from "@/lib/connections/adapters/clover";
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
 * GET /api/connections/clover/callback — exchange code, capture the Clover
 * `merchant_id` (passed by Clover on the callback) + probe `/v3/merchants/{id}`
 * for the merchant name, save a `clover` connection. Fail-soft on the stale
 * provider CHECK (redirects to `?error=clover_not_configured`).
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
  // Clover returns the merchant id on the callback query string.
  const merchantId = req.nextUrl.searchParams.get("merchant_id");
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

  const cookieHash = req.cookies.get("oauth_clover_cookie")?.value;
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
      expectedProvider: "clover",
    });

    const app = await loadProviderApp("clover");
    const clientId = app?.clientId ?? process.env.CLOVER_APP_ID;
    const clientSecret = app?.clientSecret ?? process.env.CLOVER_APP_SECRET;
    if (!clientId || !clientSecret || (!app && !cloverEnvConfigured())) {
      throw new Error("clover_not_configured");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", oauthBase(req)).origin;
    const redirectUri = `${appUrl}/api/connections/clover/callback`;

    const tokens = await exchangeCodeForTokens({
      tokenUrl: app?.tokenUrl ?? `${cloverApiBase()}/oauth/token`,
      clientId,
      clientSecret,
      code,
      redirectUri,
      contentType: "json",
      authMode: "body",
    });

    // Identity probe: GET /v3/merchants/{merchantId} for the business name.
    let accountLabel = "Clover merchant";
    let externalId: string | undefined = merchantId ?? undefined;
    if (merchantId) {
      try {
        const probe = await fetch(
          `${cloverApiBase()}/v3/merchants/${encodeURIComponent(merchantId)}`,
          {
            headers: {
              authorization: `Bearer ${tokens.accessToken}`,
              accept: "application/json",
            },
          },
        );
        if (probe.ok) {
          const data = (await probe.json()) as { id?: string; name?: string };
          if (data.name) accountLabel = data.name;
          if (data.id) externalId = data.id;
        }
      } catch {
        /* identity probe is best-effort */
      }
    }

    const saved = await saveConnectionSoft({
      orgId: verified.orgId,
      provider: "clover",
      accountLabel,
      externalId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
      scopes: app?.scopes ?? ["read:customers"],
    });
    if (!saved.ok) {
      return NextResponse.redirect(
        new URL("/connections?error=clover_not_configured", oauthBase(req)),
      );
    }

    const response = NextResponse.redirect(
      new URL("/connections?connected=clover", oauthBase(req)),
    );
    response.cookies.delete("oauth_clover_cookie");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "clover", error: msg });
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(msg)}`, oauthBase(req)),
    );
  }
}
