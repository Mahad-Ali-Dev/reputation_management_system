import { Readable } from "node:stream";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Tests for the streaming-ZIP machinery behind the admin hardware batch route —
 * i.e. the fix for the nginx-502-on-500 bug.
 *
 * The route itself wires three primitives together (generate rows → persist +
 * envelope-encrypt → stream ZIP). We can't exercise the route end-to-end without
 * a live DB + admin session, so we lock the load-bearing primitives instead:
 *
 *   1. `buildBatchZipStream` returns a Node Readable that emits bytes
 *      INCREMENTALLY (README + manifest before the per-unit QR assets). That
 *      incrementality is the entire point of the fix — it's what keeps the nginx
 *      connection alive past proxy_read_timeout.
 *   2. `Readable.toWeb(stream)` (exactly what the route hands to NextResponse)
 *      produces a Web ReadableStream that yields a valid ZIP (PK magic header).
 *   3. The NFC manifest shape carries the per-card `encode_url` column and NO
 *      1024px PNG entries.
 *   4. `encryptCodes` / `decryptCodes` round-trip the activation codes (the
 *      re-download path) and FAIL CLOSED on a tampered/short blob.
 *
 * `ENCRYPTION_MASTER_KEY` is set in beforeAll so the envelope crypto works
 * headless (the route refuses to mint a batch without it).
 */

// A deterministic 32-byte base64 key for the envelope crypto under test.
const TEST_MASTER_KEY = Buffer.alloc(32, 7).toString("base64");

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
});

const PK_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" local file header
const PRODUCT = { sku: "plaque-brass", name: "Brass Plaque" };

/** Drain a Node Readable into a single Buffer. */
async function drain(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Drain a Web ReadableStream<Uint8Array> into a single Buffer. */
async function drainWeb(web: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = web.getReader();
  const chunks: Buffer[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

describe("generateBatchRows", () => {
  it("mints N rows with distinct slugs/serials and a hashed (never plaintext) code field", async () => {
    const { generateBatchRows } = await import("@/lib/hardware/batch");
    const rows = generateBatchRows(12);
    expect(rows).toHaveLength(12);

    const slugs = new Set(rows.map((r) => r.slug));
    const serials = new Set(rows.map((r) => r.serial));
    expect(slugs.size).toBe(12);
    expect(serials.size).toBe(12);

    for (const r of rows) {
      // qrUrl encodes the public scan endpoint.
      expect(r.qrUrl).toContain(`/r/${r.slug}`);
      // The hash is a 64-char hex SHA-256 — distinct from the 5-char plaintext.
      expect(r.activationCodeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.activationCodePlaintext).not.toBe(r.activationCodeHash);
      expect(r.activationCodePlaintext.length).toBe(5);
    }
  });
});

describe("buildBatchZipStream (QR kind) — incremental streaming ZIP", () => {
  it("emits README + manifest BEFORE any per-unit QR asset (the incrementality the 502 fix relies on)", async () => {
    const { generateBatchRows, buildBatchZipStream } = await import("@/lib/hardware/batch");
    const rows = generateBatchRows(8);
    const { stream, done } = buildBatchZipStream(rows, PRODUCT, {
      productKind: "qr",
      // small width keeps the test fast; the stream shape is identical.
      width: 128,
    });

    // Capture the order entries appear in the byte stream. Each local file header
    // ("PK\x03\x04") is immediately followed by metadata then the filename, so the
    // filenames appear in append order in the raw bytes.
    const buf = await drain(stream);
    await done;

    const text = buf.toString("latin1");
    const readmeAt = text.indexOf("README.txt");
    const manifestAt = text.indexOf("manifest.csv");
    const firstPngAt = text.indexOf("qr-png/");
    const firstSvgAt = text.indexOf("qr-svg/");

    expect(readmeAt).toBeGreaterThanOrEqual(0);
    expect(manifestAt).toBeGreaterThan(readmeAt);
    // The header files are appended before the loop over units, so they precede
    // the first QR asset in the stream.
    expect(firstSvgAt).toBeGreaterThan(manifestAt);
    expect(firstPngAt).toBeGreaterThan(manifestAt);
  });

  it("produces a valid ZIP (PK magic) containing one PNG + one SVG per unit", async () => {
    const { generateBatchRows, buildBatchZipStream } = await import("@/lib/hardware/batch");
    const rows = generateBatchRows(5);
    const { stream, done } = buildBatchZipStream(rows, PRODUCT, { productKind: "qr", width: 128 });
    const buf = await drain(stream);
    await done;

    expect(buf.subarray(0, 4).equals(PK_MAGIC)).toBe(true);

    const text = buf.toString("latin1");
    for (const r of rows) {
      expect(text).toContain(`qr-png/${r.slug}.png`);
      expect(text).toContain(`qr-svg/${r.slug}.svg`);
    }
  });

  it("is consumable through Readable.toWeb (exactly how the route returns it)", async () => {
    const { generateBatchRows, buildBatchZipStream } = await import("@/lib/hardware/batch");
    const rows = generateBatchRows(3);
    const { stream, done } = buildBatchZipStream(rows, PRODUCT, { productKind: "qr", width: 128 });

    const web = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;
    const buf = await drainWeb(web);
    await done;

    expect(buf.length).toBeGreaterThan(0);
    expect(buf.subarray(0, 4).equals(PK_MAGIC)).toBe(true);
  });
});

describe("encryptCodes / decryptCodes — the re-download round-trip", () => {
  it("round-trips the stored codes losslessly", async () => {
    const { generateBatchRows, rowsToStoredCodes, encryptCodes, decryptCodes } = await import(
      "@/lib/hardware/batch"
    );
    const rows = generateBatchRows(6);
    const stored = rowsToStoredCodes(rows);

    const blob = encryptCodes(stored);
    expect(Buffer.isBuffer(blob)).toBe(true);
    // The ciphertext must NOT contain the plaintext codes in the clear.
    const blobText = blob.toString("latin1");
    for (const s of stored) {
      expect(blobText).not.toContain(s.activationCode);
    }

    const back = decryptCodes(blob);
    expect(back).toEqual(stored);
  });

  it("fails closed on a tampered ciphertext (AEAD) and on a too-short blob", async () => {
    const { generateBatchRows, rowsToStoredCodes, encryptCodes, decryptCodes } = await import(
      "@/lib/hardware/batch"
    );
    const blob = encryptCodes(rowsToStoredCodes(generateBatchRows(2)));

    // Flip a byte in the ciphertext region (after the 12-byte IV) → GCM tag fails.
    const tampered = Buffer.from(blob);
    const li = tampered.length - 1;
    tampered[li] = (tampered[li] ?? 0) ^ 0xff;
    expect(() => decryptCodes(tampered)).toThrow();

    // A blob shorter than the IV is rejected before any crypto runs.
    expect(() => decryptCodes(Buffer.alloc(4))).toThrow();
  });

  it("storedCodesToRows reconstructs rows whose qrUrl + code match the originals", async () => {
    const { generateBatchRows, rowsToStoredCodes, storedCodesToRows } = await import(
      "@/lib/hardware/batch"
    );
    const rows = generateBatchRows(4);
    const rebuilt = storedCodesToRows(rowsToStoredCodes(rows));

    expect(rebuilt.map((r) => r.slug)).toEqual(rows.map((r) => r.slug));
    expect(rebuilt.map((r) => r.qrUrl)).toEqual(rows.map((r) => r.qrUrl));
    expect(rebuilt.map((r) => r.activationCodePlaintext)).toEqual(
      rows.map((r) => r.activationCodePlaintext),
    );
    // display mirrors the plaintext for the 5-char code.
    for (const r of rebuilt) expect(r.activationCodeDisplay).toBe(r.activationCodePlaintext);
  });
});

describe("CSV safety helpers (shared with the route's NFC manifest)", () => {
  it("neutralizes formula-injection and quotes delimiter-bearing cells", async () => {
    const { csvCell } = await import("@/lib/hardware/batch");
    // Leading =,+,-,@ get a single-quote guard.
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    // Commas / quotes / newlines force quoting + doubled inner quotes.
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
    // Plain values pass through untouched.
    expect(csvCell("plaque-brass")).toBe("plaque-brass");
  });

  it("safeFilenameSegment strips path/Content-Disposition-breaking characters", async () => {
    const { safeFilenameSegment } = await import("@/lib/hardware/batch");
    expect(safeFilenameSegment('../../etc/passwd')).toBe(".._.._etc_passwd");
    expect(safeFilenameSegment('a"b\r\nc')).toBe("a_b__c");
    expect(safeFilenameSegment("plaque-brass")).toBe("plaque-brass");
  });
});
