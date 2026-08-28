import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

/**
 * TOTP (RFC 6238) two-factor authentication — Google Authenticator / Authy /
 * 1Password etc. compatible. No external OTP library: HMAC-SHA1 + base32 are
 * both a few lines over Node's built-in `crypto`, and this keeps the whole
 * primitive auditable in one file.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SEC = 30;
const TOTP_DIGITS = 6;
const SECRET_BYTES = 20; // 160 bits — the RFC 4226 recommendation

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** New base32 TOTP secret, ready to encrypt + store and to render as a QR code. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

function hotp(secretBytes: Buffer, counter: number): string {
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuf.writeUInt32BE(counter % 2 ** 32, 4);
  const digest = createHmac("sha1", secretBytes).update(counterBuf).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binCode =
    ((digest.readUInt8(offset) & 0x7f) << 24) |
    ((digest.readUInt8(offset + 1) & 0xff) << 16) |
    ((digest.readUInt8(offset + 2) & 0xff) << 8) |
    (digest.readUInt8(offset + 3) & 0xff);
  return (binCode % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Verify a 6-digit code against `secret`, allowing ±`windowSteps` * 30s of
 * clock drift. Returns the matched time-step (to persist as the new
 * "last used" watermark) or `null` if the code is wrong, malformed, or —
 * when `notBefore` is given — was already consumed (replay of a still-valid
 * code within its own window).
 */
export function verifyTotpCode(
  secret: string,
  token: string,
  opts: { windowSteps?: number; notBefore?: number | null } = {},
): number | null {
  const { windowSteps = 1, notBefore = null } = opts;
  const clean = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const secretBytes = base32Decode(secret);
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SEC);
  for (let delta = -windowSteps; delta <= windowSteps; delta++) {
    const step = currentStep + delta;
    if (notBefore != null && step <= notBefore) continue;
    if (timingSafeEqualStr(hotp(secretBytes, step), clean)) return step;
  }
  return null;
}

/** otpauth:// URI for the authenticator app's QR scan / manual entry. */
export function buildOtpAuthUri(secret: string, accountLabel: string, issuer = "Repulabs"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---- Backup codes ----
// No ambiguous glyphs (0/O, 1/I/L) — these get hand-typed from a printout.
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** 10 single-use recovery codes, formatted `XXXXX-XXXXX` for readability. */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    let code = "";
    for (let j = 0; j < 10; j++) {
      if (j === 5) code += "-";
      code += BACKUP_CODE_ALPHABET[randomInt(BACKUP_CODE_ALPHABET.length)];
    }
    codes.push(code);
  }
  return codes;
}

function normalizeBackupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashBackupCode(code: string): string {
  return createHash("sha256").update(normalizeBackupCode(code)).digest("hex");
}

/** Hash a fresh batch of backup codes for storage (never store plaintext). */
export function hashBackupCodes(codes: string[]): string[] {
  return codes.map(hashBackupCode);
}

/**
 * Index of `candidate` within `hashes`, or -1. Used both to check a code and
 * to know which entry to remove (single-use — the caller must persist the
 * array with that index spliced out on a match).
 */
export function findBackupCodeIndex(hashes: string[], candidate: string): number {
  const candidateHash = Buffer.from(hashBackupCode(candidate));
  return hashes.findIndex((h) => {
    const buf = Buffer.from(h);
    return buf.length === candidateHash.length && timingSafeEqual(buf, candidateHash);
  });
}

// ---- At-rest encryption for the secret column ----
// Same AES-256-GCM primitive as lib/crypto/envelope.ts, but keyed off the
// user id rather than an org/provider/purpose triple — a personal TOTP
// secret isn't tenant-scoped the way an OAuth token is, so envelope.ts's
// EncryptionContext shape doesn't fit here.

const ALG = "aes-256-gcm" as const;
const IV_LEN = 12;
const TAG_LEN = 16;
const ENC_PREFIX = "v1";

function getMasterKey(): Buffer {
  const b64 = process.env.ENCRYPTION_MASTER_KEY;
  if (!b64) throw new Error("ENCRYPTION_MASTER_KEY not set");
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_MASTER_KEY must be 32 bytes (got ${buf.length})`);
  }
  return buf;
}

function deriveDek(userId: string, master: Buffer): Buffer {
  return createHmac("sha256", master).update(`totp|${userId}`).digest();
}

/** Encrypt a TOTP secret for storage in `User.totpSecret`. */
export function encryptTotpSecret(secret: string, userId: string): string {
  const dek = deriveDek(userId, getMasterKey());
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, dek, iv, { authTagLength: TAG_LEN });
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const ct = Buffer.concat([cipher.update(secret, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${ENC_PREFIX}:${iv.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a `User.totpSecret` value back to the base32 secret. */
export function decryptTotpSecret(stored: string, userId: string): string {
  const [version, ivB64, ctB64] = stored.split(":");
  if (version !== ENC_PREFIX || !ivB64 || !ctB64) {
    throw new Error("Malformed encrypted TOTP secret");
  }
  const dek = deriveDek(userId, getMasterKey());
  const iv = Buffer.from(ivB64, "base64");
  const raw = Buffer.from(ctB64, "base64");
  const tag = raw.subarray(raw.length - TAG_LEN);
  const ct = raw.subarray(0, raw.length - TAG_LEN);
  const decipher = createDecipheriv(ALG, dek, iv, { authTagLength: TAG_LEN });
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
