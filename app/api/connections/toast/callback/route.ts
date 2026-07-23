import { auth } from "@/lib/auth/config";
import { saveConnectionSoft } from "@/lib/connections/adapters/route-helpers";
import { toastApiBase, toastEnvConfigured } from "@/lib/connections/adapters/toast";
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
 * GET /api/connections/toast/callback — exchange code, capture the Toast
 * restaurant GUID (Toast scopes its API per restaurant; the GUID arrives on the
 * callback query string) + probe `/restaurants/v1/restaurants/{guid}` for the
 * restaurant name, save a `toast` connection. Fail-soft on the stale provider
 * CHECK (redirects to `?error=toast_not_configured`).
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
  // Toast's API is restaurant-GUID scoped; the partner callback carries it.
  const restaurantGuid =
    req.nextUrl.searchParams.get("restaurantGuid") ??
    req.nextUrl.searchParams.get("restaurant_guid");
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

  const cookieHash = req.cookies.get("oauth_toast_cookie")?.value;
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
      expectedProvider: "toast",
    });

    const app = await loadProviderApp("toast");
    const clientId = app?.clientId ?? process.env.TOAST_CLIENT_ID;
    const clientSecret = app?.clientSecret ?? process.env.TOAST_CLIENT_SECRET;
    if (!clientId || !clientSecret || (!app && !toastEnvConfigured())) {
      throw new Error("toast_not_configured");
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", oauthBase(req)).origin;
    const redirectUri = `${appUrl}/api/connections/toast/callback`;

    const tokens = await exchangeCodeForTokens({
      tokenUrl: app?.tokenUrl ?? `${toastApiBase()}/authentication/v1/authentication/login`,
      clientId,
      clientSecret,
      code,
      redirectUri,
      contentType: "json",
      authMode: "body",
    });

    // Identity probe: best-effort restaurant name when a GUID is present.
    let accountLabel = "Toast restaurant";
    let externalId: string | undefined = restaurantGuid ?? undefined;
    if (restaurantGuid) {
      try {
        const probe = await fetch(
          `${toastApiBase()}/restaurants/v1/restaurants/${encodeURIComponent(restaurantGuid)}`,
          {
            headers: {
              authorization: `Bearer ${tokens.accessToken}`,
              "Toast-Restaurant-External-ID": restaurantGuid,
              accept: "application/json",
            },
          },
        );
        if (probe.ok) {
          const data = (await probe.json()) as {
            guid?: string;
            general?: { name?: string };
            name?: string;
          };
          const name = data.general?.name ?? data.name;
          if (name) accountLabel = name;
          if (data.guid) externalId = data.guid;
        }
      } catch {
        /* identity probe is best-effort */
      }
    }

    const saved = await saveConnectionSoft({
      orgId: verified.orgId,
      provider: "toast",
      accountLabel,
      externalId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
      scopes: app?.scopes ?? ["customers.read"],
    });
    if (!saved.ok) {
      return NextResponse.redirect(
        new URL("/connections?error=toast_not_configured", oauthBase(req)),
      );
    }

    const response = NextResponse.redirect(new URL("/connections?connected=toast", oauthBase(req)));
    response.cookies.delete("oauth_toast_cookie");
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: "connection.oauth.callback_failed", provider: "toast", error: msg });
    return NextResponse.redirect(
      new URL(`/connections?error=${encodeURIComponent(msg)}`, oauthBase(req)),
    );
  }
}
