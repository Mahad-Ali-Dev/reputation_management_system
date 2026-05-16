/**
 * Envelope encryption round-trip test.
 *
 * Asserts:
 *   1. encrypt → decrypt returns original plaintext
 *   2. Decrypting with wrong context (orgId, provider, or purpose) fails AEAD verification
 *   3. Decrypting with a tampered ciphertext fails
 *   4. Two encryptions of the same plaintext produce different ciphertext (IV uniqueness)
 */
import { beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt, type EncryptionContext } from "@/lib/crypto/envelope";

const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";

const ctxA: EncryptionContext = { orgId: ORG_A, provider: "google_business", purpose: "oauth" };
const ctxB: EncryptionContext = { orgId: ORG_B, provider: "google_business", purpose: "oauth" };

describe("envelope encryption", () => {
  beforeAll(() => {
    // Tests need a master key set. Use a deterministic dev key.
    if (!process.env.ENCRYPTION_MASTER_KEY) {
      process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
    }
  });

  it("round-trips a plaintext", () => {
    const plaintext = "ya29.a0AS3...some_fake_access_token";
    const enc = encrypt(plaintext, ctxA);
    const dec = decrypt(enc);
    expect(dec).toBe(plaintext);
  });

  it("rejects decryption with mismatched context (orgId)", () => {
    const enc = encrypt("secret", ctxA);
    // Forge the encryption_context to claim it's for org B
    const forged = { ...enc, encryptionContext: ctxB };
    expect(() => decrypt(forged)).toThrow();
  });

  it("rejects decryption with mismatched context (provider)", () => {
    const enc = encrypt("secret", ctxA);
    const forged = {
      ...enc,
      encryptionContext: { ...ctxA, provider: "meta" } satisfies EncryptionContext,
    };
    expect(() => decrypt(forged)).toThrow();
  });

  it("rejects decryption with mismatched context (purpose)", () => {
    const enc = encrypt("secret", ctxA);
    const forged = {
      ...enc,
      encryptionContext: { ...ctxA, purpose: "phone" } satisfies EncryptionContext,
    };
    expect(() => decrypt(forged)).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const enc = encrypt("secret", ctxA);
    const tampered = {
      ...enc,
      ciphertext: Buffer.concat([Buffer.from([enc.ciphertext[0]! ^ 0xff]), enc.ciphertext.subarray(1)]),
    };
    expect(() => decrypt(tampered)).toThrow();
  });

  it("produces unique IVs (different ciphertext for same plaintext)", () => {
    const plaintext = "same_value_twice";
    const enc1 = encrypt(plaintext, ctxA);
    const enc2 = encrypt(plaintext, ctxA);
    expect(enc1.iv.equals(enc2.iv)).toBe(false);
    expect(enc1.ciphertext.equals(enc2.ciphertext)).toBe(false);
    // But both decrypt back correctly
    expect(decrypt(enc1)).toBe(plaintext);
    expect(decrypt(enc2)).toBe(plaintext);
  });

  it("rejects ciphertext shorter than the auth tag", () => {
    const enc = encrypt("x", ctxA);
    const truncated = { ...enc, ciphertext: enc.ciphertext.subarray(0, 5) };
    expect(() => decrypt(truncated)).toThrow();
  });
});
