import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Envelope encryption for OAuth tokens and other PII at rest.
 *
 * v1: master-key-derived per-row DEK (no KMS). Migrate to AWS KMS in Phase 0 finalization
 * (CR-3) — this module's interface stays the same; only the DEK derivation changes.
 *
 * Each row has:
 *   - ciphertext (AES-256-GCM)
 *   - dek_ciphertext (the row DEK, encrypted by master key)
 *   - iv (12-byte AES-GCM nonce)
 *   - encryption_ctx (JSONB binding the row to its identity — org_id, provider, purpose)
 *
 * EncryptionContext is verified on decrypt — a stolen ciphertext can't be decrypted under a
 * different context (e.g., reusing a token from one tenant in another).
 *
 * See DATA_MODEL.md §3.3 + INFRASTRUCTURE.md §5.5
 */

const ALG = "aes-256-gcm" as const;
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;
const KEY_VERSION = 1;

function getMasterKey(): Buffer {
  const b64 = process.env.ENCRYPTION_MASTER_KEY;
  if (!b64) throw new Error("ENCRYPTION_MASTER_KEY not set");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_MASTER_KEY must be 32 bytes (got ${buf.length}). Generate with: openssl rand -base64 32`,
    );
  }
  return buf;
}

export type EncryptionContext = {
  orgId: string;
  provider: string;
  purpose: "oauth" | "widget" | "phone" | "general";
};

function contextString(ctx: EncryptionContext): string {
  return `${ctx.orgId}|${ctx.provider}|${ctx.purpose}`;
}

/**
 * Derive a DEK from the master key + context. v1 uses HMAC-SHA256(master, context) which is
 * deterministic — fine for v1, but it means rotating the master key requires re-encrypting all
 * rows. KMS migration replaces this with `kms:GenerateDataKey` (random DEK + KMS-wrapped DEK ct).
 */
function deriveDek(ctx: EncryptionContext, master: Buffer): Buffer {
  return createHmac("sha256", master).update(contextString(ctx)).digest();
}

export type EncryptedRecord = {
  ciphertext: Buffer; // includes 16-byte auth tag at end
  iv: Buffer;
  dekCiphertext: Buffer; // for v1, empty (DEK derived from master); for KMS, the KMS-wrapped DEK
  keyVersion: number;
  encryptionContext: EncryptionContext;
};

export function encrypt(plaintext: string | Buffer, ctx: EncryptionContext): EncryptedRecord {
  const master = getMasterKey();
  const dek = deriveDek(ctx, master);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, dek, iv, { authTagLength: TAG_LEN });
  // Bind context as additional authenticated data (AAD) — wrong context = AEAD failure on decrypt
  cipher.setAAD(Buffer.from(contextString(ctx), "utf8"));
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([ct, tag]),
    iv,
    dekCiphertext: Buffer.alloc(0),
    keyVersion: KEY_VERSION,
    encryptionContext: ctx,
  };
}

export function decrypt(record: EncryptedRecord): string {
  const master = getMasterKey();
  const dek = deriveDek(record.encryptionContext, master);
  if (record.ciphertext.length < TAG_LEN) {
    throw new Error("Ciphertext too short");
  }
  const ct = record.ciphertext.subarray(0, record.ciphertext.length - TAG_LEN);
  const tag = record.ciphertext.subarray(record.ciphertext.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, dek, record.iv, { authTagLength: TAG_LEN });
  decipher.setAAD(Buffer.from(contextString(record.encryptionContext), "utf8"));
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Convenience: encrypt + return columns ready for a Prisma write.
 * Keys match `connections` table column names.
 */
export function encryptForRow(plaintext: string, ctx: EncryptionContext) {
  const r = encrypt(plaintext, ctx);
  return {
    access_token_ct: r.ciphertext, // caller decides which column
    iv: r.iv,
    dek_ciphertext: r.dekCiphertext,
    key_version: r.keyVersion,
    encryption_ctx: ctx,
  };
}
