import { auth } from "@/lib/auth/config";
import { cloverApiBase, cloverEnvConfigured } from "@/lib/connections/adapters/clover";
import {
  buildAuthorizeUrl,
  loadProviderApp,
  signProviderState,
} from "@/lib/connections/oauth-helpers";
import { oauthBase } from "@/lib/oauth/redirect";
import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/clover/authorize — Clover POS OAuth start (clone).
 *
 * Mirrors the Square authorize pattern exactly: session → `loadProviderApp` →
 * `signProviderState` → redirect, with a bound `oauth_clover_cookie`.
 *
 * Gated on EITHER a configured `clover` provider app OR `CLOVER_APP_ID` env.
 * With neither, redirects to `?error=clover_not_configured` — never a live call
 * without creds.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", oauthBase(req)));
  }

  const app = await loadProviderApp("clover");
  const clientId = app?.clientId ?? process.env.CLOVER_APP_ID;
  if (!clientId || (!app && !cloverEnvConfigured())) {
    return NextResponse.redirect(
      new URL("/connections?error=clover_not_configured", oauthBase(req)),
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/clover/callback`;
  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "clover" });

  // Clover's hosted-app OAuth grants merchant scope implicitly (the scopes are
  // configured on the app in the Clover dashboard, not passed here); keep an
  // explicit list for parity + audit. Prefer admin-configured scopes.
  const scopes = app?.scopes && app.scopes.length > 0 ? app.scopes : ["read:customers"];

  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: app?.oauthUrl ?? `${cloverApiBase()}/oauth/authorize`,
    clientId,
    redirectUri,
    scopes,
    state,
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("oauth_clover_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
