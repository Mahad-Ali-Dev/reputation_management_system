import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { logger } from "@/lib/logger";
import { signOAuthState } from "@/lib/oauth/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/connections/gmail/authorize
 *
 * Starts the Gmail mailbox-sync OAuth flow. Reuses the existing Google OAuth app
 * (AUTH_GOOGLE_ID/SECRET) but requests the Gmail read + send scopes so the cron
 * poller can ingest inbox mail and the inbox composer can send replies.
 *
 * Mirrors the Google Business Profile connect flow (state JWT + cookie hash +
 * PKCE), but the Gmail mailbox is ORG-level (not tied to an establishment), so
 * there's no establishmentId to stash.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    logger.error({ event: "oauth.gmail.no_client_id" });
    return NextResponse.json({ error: "google_oauth_not_configured" }, { status: 500 });
  }

  const {
    state,
    cookieHash,
    pkceChallenge: challenge,
  } = await signOAuthState({ orgId, userId, provider: "gmail" });

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/connections/gmail/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
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
  res.cookies.set("oauth_state_sig", cookieHash, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
