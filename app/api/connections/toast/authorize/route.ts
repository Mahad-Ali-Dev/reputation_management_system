import { loadProviderApp, signProviderState } from "@/lib/connections/oauth-helpers";
import { toastApiBase, toastEnvConfigured } from "@/lib/connections/adapters/toast";
import { auth } from "@/lib/auth/config";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/toast/authorize — Toast POS OAuth start (env-gated).
 *
 * Toast is a Partner-Program provider. With neither a configured `toast`
 * provider app nor `TOAST_CLIENT_ID` env, redirects to
 * `?error=toast_not_configured` — never a live call without creds.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session?.user || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const app = await loadProviderApp("toast");
  const clientId = app?.clientId ?? process.env.TOAST_CLIENT_ID;
  if (!clientId || (!app && !toastEnvConfigured())) {
    return NextResponse.redirect(new URL("/connections?error=toast_not_configured", req.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL("/", req.url).origin;
  const redirectUri = `${appUrl}/api/connections/toast/callback`;
  const { state, cookieHash } = await signProviderState({ orgId, userId, provider: "toast" });

  // Toast uses a client-credentials-style auth in practice; this authorize hop
  // is kept for parity + future partner-approved interactive flows.
  const url = new URL(`${toastApiBase()}/authentication/v1/authentication/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("oauth_toast_cookie", cookieHash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
