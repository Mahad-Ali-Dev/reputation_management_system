import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";
import { SignJWT, jwtVerify } from "jose";

/**
 * OAuth state JWT — CSRF + tenant fixation defense.
 *
 * Flow (see API_SURFACE.md §2.4):
 *   1. /authorize: signOAuthState({ orgId, userId, provider }) → returns { state, cookieHash }
 *      We redirect to the IdP with `state=<jwt>` and Set-Cookie: oauth_state_sig=<cookieHash>
 *   2. /callback: read state from query + cookieHash from cookie → verifyAndConsumeOAuthState
 *      Verifies signature, expiry, cookie binding, and single-use (DB nonce table).
 *
 * PKCE verifier is generated here too — for providers that support it.
 */

const ALG = "HS256" as const;
const TTL_SECONDS = 600; // 10 minutes

function getSecret(): Uint8Array {
  const s = process.env.OAUTH_STATE_SECRET;
  if (!s) throw new Error("OAUTH_STATE_SECRET not set");
  if (s.length < 32) {
    throw new Error("OAUTH_STATE_SECRET must be at least 32 chars");
  }
  return new TextEncoder().encode(s);
}

export type OAuthStateClaims = {
  orgId: string;
  userId: string;
  provider: string;
  nonce: string;
  pkceVerifier: string;
};

function generatePkceVerifier(): string {
  // 32 bytes → 43-char base64url, complies with RFC 7636
  return randomBytes(32).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function signOAuthState(params: {
  orgId: string;
  userId: string;
  provider: string;
}): Promise<{ state: string; cookieHash: string; pkceVerifier: string; pkceChallenge: string }> {
  const nonce = randomBytes(24).toString("base64url");
  const pkceVerifier = generatePkceVerifier();
  const challenge = pkceChallenge(pkceVerifier);

  const claims: OAuthStateClaims = {
    orgId: params.orgId,
    userId: params.userId,
    provider: params.provider,
    nonce,
    pkceVerifier,
  };

  const state = await new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(getSecret());

  // Bind the cookie to the state so CSRF attempts that don't have the cookie fail
  const cookieHash = createHash("sha256").update(state).digest("base64url");

  return { state, cookieHash, pkceVerifier, pkceChallenge: challenge };
}

export type VerifiedState = {
  orgId: string;
  userId: string;
  provider: string;
  pkceVerifier: string;
};

export async function verifyAndConsumeOAuthState(args: {
  state: string;
  cookieHash: string;
  expectedProvider: string;
  sessionUserId: string;
  /**
   * The org currently active in the caller's session. When provided, the
   * state's `orgId` claim MUST match it — otherwise a user who belongs to
   * multiple orgs (or who influenced the orgId placed into the state) could
   * complete a callback that attaches encrypted tokens to the wrong tenant.
   */
  sessionOrgId?: string;
}): Promise<VerifiedState> {
  // 1. Cookie binding check
  const expectedCookie = createHash("sha256").update(args.state).digest("base64url");
  if (expectedCookie !== args.cookieHash) {
    throw new Error("oauth_state: cookie binding mismatch");
  }

  // 2. Signature + expiry
  const { payload } = await jwtVerify(args.state, getSecret(), { algorithms: [ALG] });
  const claims = payload as unknown as OAuthStateClaims;

  // 3. Provider match
  if (claims.provider !== args.expectedProvider) {
    throw new Error("oauth_state: provider mismatch");
  }

  // 4. Session user must match — defends against tenant fixation
  if (claims.userId !== args.sessionUserId) {
    throw new Error("oauth_state: session user mismatch");
  }

  // 4b. Org binding — the state's org must match the caller's active org so a
  // multi-org user can't land tokens under a different tenant than intended.
  if (args.sessionOrgId !== undefined && claims.orgId !== args.sessionOrgId) {
    throw new Error("oauth_state: session org mismatch");
  }

  // 5. Single-use enforcement via DB nonce table
  try {
    await prisma.oAuthStateConsumed.create({
      data: {
        nonce: claims.nonce,
        organizationId: claims.orgId,
        userId: claims.userId,
        provider: claims.provider,
      },
    });
  } catch (err) {
    // Unique violation = replay
    throw new Error("oauth_state: replay or nonce already consumed");
  }

  return {
    orgId: claims.orgId,
    userId: claims.userId,
    provider: claims.provider,
    pkceVerifier: claims.pkceVerifier,
  };
}

/**
 * Cleanup job: delete consumed nonces older than 1 hour. Run hourly via QStash.
 */
export async function cleanupConsumedOAuthStates(): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000);
  const result = await prisma.oAuthStateConsumed.deleteMany({
    where: { consumedAt: { lt: cutoff } },
  });
  return result.count;
}
