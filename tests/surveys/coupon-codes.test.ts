import { describe, it, expect } from "vitest";
import { generateCouponCode, hashCouponCode } from "@/lib/surveys/coupons";

describe("generateCouponCode", () => {
  it("returns a 10-char string", () => {
    const code = generateCouponCode();
    expect(code).toHaveLength(10);
  });

  it("uses Crockford base32 alphabet (no I, L, O, U)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCouponCode();
      expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it("produces unique codes (collision check)", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      codes.add(generateCouponCode());
    }
    // With 10 chars × 32 alphabet ≈ 50 bits, 10k samples should be unique
    expect(codes.size).toBe(10_000);
  });
});

describe("hashCouponCode", () => {
  it("produces a 64-char hex SHA-256", () => {
    const h = hashCouponCode("ABCD1234EF");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("is case-insensitive (uppercases before hash)", () => {
    expect(hashCouponCode("abcd1234ef")).toBe(hashCouponCode("ABCD1234EF"));
    expect(hashCouponCode("aBcD1234Ef")).toBe(hashCouponCode("ABCD1234EF"));
  });

  it("trims whitespace before hash", () => {
    expect(hashCouponCode("  ABCD1234EF  ")).toBe(hashCouponCode("ABCD1234EF"));
  });

  it("different codes produce different hashes", () => {
    const h1 = hashCouponCode("ABCD1234EF");
    const h2 = hashCouponCode("ZYXW9876VU");
    expect(h1).not.toBe(h2);
  });
});
