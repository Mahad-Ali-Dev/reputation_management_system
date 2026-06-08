import {
  buildAuthorizeUrl,
  loadProviderApp,
  signProviderState,
} from "@/lib/connections/oauth-helpers";
import { squareApiBase, squareEnvConfigured } from "@/lib/connections/adapters/square";
import { auth } from "@/lib/auth/config";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/square/authorize — Square POS OAuth start (clone).
 *
 * Gated on EITHER a configured `square` provider app OR `SQUARE_APP_ID` env.
 * With neither, redirects to `?error=square_not_configured`.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const app = await loadProviderApp("square");
  const clientId = app?.clientId ?? process.env.SQUARE_APP_ID;
  if (!clientId || (!app && !squareEnvConfigured())) {
    return NextResponse.redirect(new URL("/connections?error=square_not_configured", req.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/square/callback`;
  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "square" });

  const scopes =
    app?.scopes && app.scopes.length > 0 ? app.scopes : ["CUSTOMERS_READ", "MERCHANT_PROFILE_READ"];

  const authorizeUrl = buildAuthorizeUrl({
    baseUrl: `${squareApiBase()}/oauth2/authorize`,
    clientId,
    redirectUri,
    scopes,
    state,
    extraParams: { session: "false" },
  });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("oauth_square_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
