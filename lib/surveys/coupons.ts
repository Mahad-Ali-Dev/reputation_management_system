import { createHash, randomBytes } from "node:crypto";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Survey coupon engine.
 *
 * Promoters (NPS ≥ 9) get a unique one-time coupon code. The code is presented
 * inline on the thank-you page + emailed alongside the review request.
 *
 * Codes use Crockford base32 (no ambiguous chars). 10 chars = ~50 bits of
 * entropy, enough to make brute-forcing impractical. We store both the
 * plaintext (for display) and a SHA-256 hash (for redemption lookup).
 */

// Crockford base32 — drops I, L, O, U
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateCouponCode(): string {
  const bytes = randomBytes(10);
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}

export function hashCouponCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

const COUPON_TTL_DAYS = 60;

/**
 * Issue a coupon for a survey response. Idempotent — if a coupon already exists
 * for this response, returns the existing one.
 */
export async function issueCouponForResponse(args: {
  responseId: string;
  organizationId: string;
  campaignId: string;
  valueCents: number;
  description?: string;
}): Promise<{ code: string; expiresAt: Date; alreadyIssued: boolean }> {
  return withTenant(args.organizationId, async (tx) => {
    // Check if already issued
    const existing = await tx.surveyCoupon.findUnique({
      where: { responseId: args.responseId },
      select: { code: true, expiresAt: true },
    });
    if (existing) {
      return { code: existing.code, expiresAt: existing.expiresAt, alreadyIssued: true };
    }

    const code = generateCouponCode();
    const codeHash = hashCouponCode(code);
    const expiresAt = new Date(Date.now() + COUPON_TTL_DAYS * 24 * 60 * 60 * 1000);

    await tx.surveyCoupon.create({
      data: {
        responseId: args.responseId,
        organizationId: args.organizationId,
        campaignId: args.campaignId,
        code,
        codeHash,
        valueCents: args.valueCents,
        currency: "USD",
        description: args.description ?? null,
        expiresAt,
      },
    });

    logger.info(
      { event: "survey.coupon.issued", orgId: args.organizationId, responseId: args.responseId },
      "coupon issued for promoter",
    );

    return { code, expiresAt, alreadyIssued: false };
  });
}

export type CouponRedeemResult =
  | { ok: true; valueCents: number; description: string | null; code: string }
  | { ok: false; reason: "not_found" | "expired" | "already_redeemed" | "wrong_org" };

/**
 * Redeem a coupon at the POS. Caller (POS terminal / staff page) provides:
 *   - organizationId : the calling org (must match the coupon's org)
 *   - code           : the plaintext from the customer
 *   - note           : optional free-text staff note
 *
 * On success the coupon's `redeemed_at` is set. Single-use: a 2nd redemption returns
 * `already_redeemed`.
 */
export async function redeemCoupon(args: {
  organizationId: string;
  code: string;
  note?: string;
}): Promise<CouponRedeemResult> {
  const codeHash = hashCouponCode(args.code);
  return withTenant(args.organizationId, async (tx) => {
    // Inside the tenant transaction, the RLS predicate already filters to
    // this org. A coupon hashed to the same codeHash but belonging to a
    // different org will be invisible to findFirst — same effect as the old
    // explicit wrong_org check.
    const coupon = await tx.surveyCoupon.findFirst({ where: { codeHash } });
    if (!coupon) return { ok: false, reason: "not_found" };
    // Defensive check kept in case RLS is ever loosened.
    if (coupon.organizationId !== args.organizationId) return { ok: false, reason: "wrong_org" };
    if (coupon.redeemedAt) return { ok: false, reason: "already_redeemed" };
    if (coupon.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };

    // CRITICAL: race-safe redemption via conditional UPDATE.
    // Two concurrent POS terminals scanning the same code both pass the
    // `redeemedAt` null-check above, but only ONE can win the UPDATE — the
    // other gets count=0 because `redeemed_at IS NULL` no longer holds.
    // We use updateMany (which returns count) instead of update (which throws on 0).
    const updated = await tx.surveyCoupon.updateMany({
      where: { id: coupon.id, redeemedAt: null },
      data: { redeemedAt: new Date(), redeemedByNote: args.note ?? null },
    });

    if (updated.count === 0) {
      // Another worker claimed it between our find and update.
      return { ok: false, reason: "already_redeemed" };
    }

    return {
      ok: true,
      valueCents: coupon.valueCents,
      description: coupon.description,
      code: coupon.code,
    };
  });
}
