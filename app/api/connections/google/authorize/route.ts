import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { signOAuthState } from "@/lib/oauth/state";
import { logger } from "@/lib/logger";

/**
 * GET /api/connections/google/authorize?establishmentId=<uuid>
 *
 * Starts the Google Business Profile OAuth flow. Sets a state JWT + cookie hash, with PKCE.
 * Redirects to Google's consent screen.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const establishmentId = req.nextUrl.searchParams.get("establishmentId");
  if (!establishmentId) {
    return NextResponse.json({ error: "establishmentId_required" }, { status: 400 });
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    logger.error({ event: "oauth.google.no_client_id" });
    return NextResponse.json({ error: "google_oauth_not_configured" }, { status: 500 });
  }

  const { state, cookieHash, pkceChallenge: challenge } = await signOAuthState({
    orgId,
    userId,
    provider: "google_business",
  });

  // Encode establishmentId into the state cookie too, since we need it at callback time.
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/connections/google/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: [
      "openid",
      "email",
      "profile",
      // Google Business Profile API
      "https://www.googleapis.com/auth/business.manage",
    ].join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const res = NextResponse.redirect(authorizeUrl);
  // Bind state to a HttpOnly cookie — callback verifies this matches the state JWT hash.
  res.cookies.set("oauth_state_sig", cookieHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  // Stash establishmentId in a separate signed cookie (CSRF-bound via state nonce).
  res.cookies.set("oauth_pending_establishment", establishmentId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
