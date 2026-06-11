import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { signOAuthState } from "@/lib/oauth/state";
import { logger } from "@/lib/logger";

/**
 * GET /api/connections/google/authorize?establishmentId=<uuid>
 *
 * Starts the Google Business Profile OAuth flow. Sets a state JWT + cookie hash, with PKCE.
 * Redirects to Google's consent screen.
 *
 * `establishmentId` is optional for browser entry points (onboarding setup
 * steps + the /connections hub link without location context — bug 002 in the
 * June 2026 assessment served those users raw JSON). When omitted we resolve
 * it: a single-location org auto-uses its only establishment; otherwise we
 * redirect to /establishments to pick (or create) one — never raw JSON.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  let establishmentId = req.nextUrl.searchParams.get("establishmentId");
  // This is a browser navigation — resolve or redirect, never raw JSON.
  if (!establishmentId) {
    const candidates = await withTenant(orgId, (tx) =>
      tx.establishment.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
        take: 2,
      }),
    ).catch(() => []);
    if (candidates.length === 1) {
      establishmentId = candidates[0]?.id ?? null;
    } else if (candidates.length === 0) {
      return NextResponse.redirect(
        new URL("/establishments?connect=google&connect_error=no_location", req.url),
      );
    } else {
      // Multiple locations — the user must pick which one to connect.
      return NextResponse.redirect(new URL("/establishments?connect=google", req.url));
    }
  }
  if (!establishmentId) {
    return NextResponse.redirect(
      new URL("/establishments?connect=google&connect_error=no_location", req.url),
    );
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    logger.error({ event: "oauth.google.no_client_id" });
    return NextResponse.redirect(
      new URL("/connections?connect_error=google_not_configured", req.url),
    );
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
