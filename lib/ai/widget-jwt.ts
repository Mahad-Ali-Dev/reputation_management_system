import { SignJWT, jwtVerify } from "jose";

/**
 * Per-visitor JWT for the chatbot widget.
 *
 * Bootstrap flow:
 *   1. Widget script loads from chat.repulabs.com/widget.js?key=PUBLIC_KEY
 *   2. Widget calls /api/ai/widget/bootstrap?key=PUBLIC_KEY → server verifies origin, returns visitor JWT
 *   3. All subsequent /api/ai/chatbot/converse calls carry `Authorization: Bearer <jwt>`
 *
 * Per-tenant HMAC secret signs the JWT. Visitor ID is a random nonce — anonymous.
 */

const ALG = "HS256" as const;
const TTL_SECONDS = 60 * 60; // 1 hour

export type VisitorClaims = {
  orgId: string;
  establishmentId?: string;
  publicKey: string;
  visitorId: string;
};

export async function signVisitorJwt(secret: string, claims: VisitorClaims): Promise<string> {
  return new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyVisitorJwt(secret: string, token: string): Promise<VisitorClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: [ALG],
  });
  return payload as unknown as VisitorClaims;
}

export { TTL_SECONDS as VISITOR_JWT_TTL };
