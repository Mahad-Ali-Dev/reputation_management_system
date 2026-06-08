import { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import { decrypt, encrypt } from "@/lib/crypto/envelope";
import { logger } from "@/lib/logger";
import archiver from "archiver";
import { generateActivationCode, generateSerial, generateSlug } from "./codes";
import { type QrPlatform, qrPngWithLogo, qrSvgWithLogo, resolvePlatform } from "./qr";

/**
 * Shared batch-generation primitives for admin factory production runs.
 *
 * Extracted from the original `app/api/admin/hardware/batch/route.ts`, which
 * had a fatal shape: it pre-generated ALL 500 PNGs/SVGs into memory and buffered
 * the ENTIRE ZIP before sending a single byte. Behind nginx (proxy_read_timeout
 * 60s) a 500-device run blew the timeout → 502 → the streamed ZIP (the only
 * place plaintext activation codes ever exist — the DB stores SHA-256 hashes
 * only) was lost → bricked devices.
 *
 * The fix lives here:
 *   - `generateBatchRows`     — pure row generation (slug/serial/code/qrUrl).
 *   - `buildBatchZipStream`   — returns a Node Readable that emits ZIP bytes
 *                               INCREMENTALLY: README + manifest first, then one
 *                               device at a time (SVG-with-logo + PNG), so bytes
 *                               start flowing to the client immediately and the
 *                               connection stays alive past 60s.
 *   - `encryptCodes` /
 *     `decryptCodes`          — envelope-encrypt the plaintext codes for the
 *                               `hardware_batches.encrypted_codes` re-download
 *                               column (purged after first re-download / TTL).
 *
 * SECURITY: nothing in this module logs the activation-code plaintext or the
 * encoded URL. The plaintext lives only in `rows[].activationCodePlaintext`
 * (in-memory) and, optionally, inside the AES-256-GCM ciphertext.
 */

const DEFAULT_APP_URL = "https://repulabs.com";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
}

/** One generated device's print data. */
export type BatchRow = {
  slug: string;
  /** Plaintext activation code — sensitive, in-memory / ciphertext only. */
  activationCodePlaintext: string;
  /** Display form (== plaintext for the 5-char code; kept for parity). */
  activationCodeDisplay: string;
  /** SHA-256 hash that gets persisted to devices.activation_code_hash. */
  activationCodeHash: string;
  serial: string;
  qrUrl: string;
};

/** The subset of code data persisted (encrypted) for re-download. */
export type StoredCode = {
  slug: string;
  activationCode: string;
  serial: string;
  qrUrl: string;
};

/** Minimal product shape the ZIP needs (matches HardwareProduct columns). */
export type BatchProduct = {
  sku: string;
  name: string;
};

/**
 * Generate `quantity` device rows. Pure (no DB) — the caller persists each
 * row's `activationCodeHash` (NOT the plaintext) and audits the batch.
 *
 * `qrUrl` is the public scan URL `${APP_URL}/r/<slug>` the QR encodes.
 */
export function generateBatchRows(quantity: number): BatchRow[] {
  const base = appUrl();
  const rows: BatchRow[] = [];
  for (let i = 0; i < quantity; i++) {
    const slug = generateSlug();
    const serial = generateSerial();
    const { plaintext, hash, display } = generateActivationCode();
    rows.push({
      slug,
      activationCodePlaintext: plaintext,
      activationCodeDisplay: display,
      activationCodeHash: hash,
      serial,
      qrUrl: `${base}/r/${slug}`,
    });
  }
  return rows;
}

/** Project rows down to the persisted (encrypted) code shape. */
export function rowsToStoredCodes(rows: BatchRow[]): StoredCode[] {
  return rows.map((r) => ({
    slug: r.slug,
    activationCode: r.activationCodePlaintext,
    serial: r.serial,
    qrUrl: r.qrUrl,
  }));
}

// ---------------------------------------------------------------------------
// CSV / filename safety (shared with the admin route)
// ---------------------------------------------------------------------------

/**
 * Neutralize CSV formula-injection (OWASP / CWE-1236): prefix cells starting
 * with =, +, -, @, \t, \r with a single quote; quote cells containing , " \n \r
 * and escape internal quotes by doubling.
 */
export function csvCell(v: string): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Strip anything that could break a Content-Disposition filename token. */
export function safeFilenameSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
}

// ---------------------------------------------------------------------------
// Streaming ZIP
// ---------------------------------------------------------------------------

export type BuildZipOpts = {
  /** Brand glyph centered on each QR. Defaults from productKind via resolvePlatform. */
  platform?: QrPlatform | string;
  /** Device kind, recorded in the README + used to pick a default glyph. */
  productKind?: string;
  /** Free-text notes echoed into the README. Never the activation codes. */
  notes?: string | null;
  /** PNG/SVG pixel width (default 1024, print-ready). */
  width?: number;
  /** ISO timestamp stamped in the manifest/README (defaults to now). */
  generatedAt?: string;
};

function buildReadme(
  product: BatchProduct,
  quantity: number,
  generatedAt: string,
  productKind: string,
  notes?: string | null,
): string {
  return [
    "Repulabs hardware batch",
    "=======================",
    "",
    `Product:    ${product.name} (SKU: ${product.sku})`,
    `Kind:       ${productKind}`,
    `Quantity:   ${quantity}`,
    `Generated:  ${generatedAt}`,
    notes ? `Notes:      ${notes}` : "",
    "",
    "What's inside",
    "-------------",
    "  README.txt         — this file",
    "  manifest.csv       — table mapping each unit to its slug + activation code",
    "  qr-png/<slug>.png  — 1024x1024 PNG QR code (recommended for printing)",
    "  qr-svg/<slug>.svg  — scalable vector QR with centered logo (signage / large prints)",
    "",
    "What to print on each unit",
    "--------------------------",
    "  1. The QR image (PNG or SVG) — encodes the scan URL.",
    "  2. The activation_code (e.g. A3M9K) printed BELOW or BESIDE the QR, in a",
    "     clearly legible font (recommend 10-12pt, monospace).",
    "  3. Optional: the serial number, very small, for inventory tracking.",
    "",
    "The activation_code is 5 characters — that exact string is what the",
    "customer types on the activation page (it's case-insensitive).",
    "",
    "After the customer redeems the activation code on repulabs.com/activate,",
    "the QR begins routing scans to that customer's review destination.",
    "",
    "KEEP THIS ZIP SAFE: the activation codes are stored ONLY here (the database",
    "keeps a one-way hash). If you lose it, an admin can re-download ONCE from the",
    "batch history before it expires; after that the codes are unrecoverable.",
    "",
    "Questions: ops@repulabs.com",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildManifestCsv(rows: BatchRow[], productSku: string, generatedAt: string): string {
  const header = [
    "slug",
    "activation_code",
    "activation_code_display",
    "serial",
    "product_sku",
    "qr_url",
    "qr_png_filename",
    "qr_svg_filename",
    "generated_at",
  ]
    .map(csvCell)
    .join(",");
  const lines = rows.map((r) =>
    [
      r.slug,
      r.activationCodePlaintext,
      r.activationCodeDisplay,
      r.serial,
      productSku,
      r.qrUrl,
      `qr-png/${r.slug}.png`,
      `qr-svg/${r.slug}.svg`,
      generatedAt,
    ]
      .map(csvCell)
      .join(","),
  );
  // UTF-8 BOM + CRLF for Excel autodetect.
  return `﻿${[header, ...lines].join("\r\n")}\r\n`;
}

/**
 * Build a streaming ZIP of the whole batch.
 *
 * Returns the `archiver` instance (a Node Readable — `archiver extends
 * stream.Transform`) so the caller can hand it straight to a `Response` body /
 * pipe it to the socket, plus a `done` promise that resolves when the archive
 * has fully finalized (or rejects on a fatal archive error).
 *
 * Incrementality is the whole point: we append README + manifest synchronously,
 * then `await` each device's SVG+PNG generation INSIDE a detached pump loop and
 * append them one unit at a time, respecting backpressure. Bytes therefore
 * begin flowing to the client within milliseconds and the run never buffers all
 * 500 PNGs at once — defeating the nginx 60s read timeout that caused the 502.
 *
 * The pump is intentionally NOT awaited here; failures surface on `done` AND are
 * propagated to the stream via `archive.abort()` so a consumer piping the
 * Readable sees an error rather than a silently truncated ZIP.
 */
export function buildBatchZipStream(
  rows: BatchRow[],
  product: BatchProduct,
  opts: BuildZipOpts = {},
): { stream: Readable; done: Promise<void> } {
  const productKind = opts.productKind ?? "qr";
  const platform: QrPlatform =
    typeof opts.platform === "string"
      ? resolvePlatform(opts.platform)
      : (opts.platform ?? resolvePlatform(productKind));
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const width = opts.width ?? 1024;

  // level 6 (not 9): PNGs are already DEFLATE-compressed, so max effort buys
  // almost nothing but burns CPU per chunk — and we want to emit chunks FAST.
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("warning", (err: unknown) => {
    logger.warn({ event: "hardware.batch.archiver_warning", err: String(err) });
  });

  // Header files first — these flush immediately so the download "starts".
  archive.append(buildReadme(product, rows.length, generatedAt, productKind, opts.notes), {
    name: "README.txt",
  });
  archive.append(buildManifestCsv(rows, product.sku, generatedAt), { name: "manifest.csv" });

  // Detached pump: generate + append one device at a time so the event loop can
  // flush compressed bytes between units. `done` reflects pump + finalize.
  const done = (async () => {
    for (const r of rows) {
      // SVG-with-logo (vector, always has the centered glyph).
      const svg = await qrSvgWithLogo(r.qrUrl, platform, { width });
      archive.append(svg, { name: `qr-svg/${r.slug}.svg` });

      // PNG (logo if sharp is present, plain otherwise — both scannable).
      const { buffer } = await qrPngWithLogo(r.qrUrl, platform, { width });
      archive.append(buffer, { name: `qr-png/${r.slug}.png` });

      // Respect backpressure: if the consumer hasn't drained the archiver's
      // internal buffer, wait so memory stays bounded across a 500-unit run.
      if (archive.writableNeedDrain) {
        await once(archive, "drain");
      }
    }
    await archive.finalize();
  })();

  // Surface pump failures to BOTH the promise and the stream consumer.
  done.catch((err) => {
    logger.error(
      { event: "hardware.batch.zip_failed", err: String(err) },
      "batch zip generation failed",
    );
    // abort() makes the Readable emit 'error' so a piped response fails loudly
    // instead of delivering a truncated ZIP.
    try {
      archive.abort();
    } catch {
      // already destroyed — ignore
    }
  });

  return { stream: archive, done };
}

/** Promisified `EventEmitter.once` for a single named event. */
function once(emitter: NodeJS.EventEmitter, event: string): Promise<void> {
  return new Promise((resolve) => {
    emitter.once(event, () => resolve());
  });
}

/**
 * Collect a Readable into a single Buffer. Convenience for callers that still
 * need a full buffer (e.g. mirroring the ZIP to @vercel/blob for re-download).
 * The PRIMARY path should stream the Readable straight to the client — only
 * buffer when you genuinely need the bytes in hand.
 */
export async function collectStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Envelope encryption of activation codes (for re-download)
// ---------------------------------------------------------------------------

/**
 * Fixed encryption context for batch code blobs. `hardware_batches` is a global
 * admin table with no org, so we bind a stable synthetic context. The context
 * is AAD'd into the AES-256-GCM tag (see lib/crypto/envelope.ts), so a blob from
 * one purpose can't be decrypted under another.
 */
const BATCH_ENC_CTX = {
  orgId: "__admin_hardware__",
  provider: "hardware_batch",
  purpose: "general" as const,
};

/**
 * Envelope-encrypt the plaintext codes for the `encrypted_codes` column.
 *
 * Layout: `iv (12 bytes) || ciphertext+tag`. We pack the GCM nonce in front of
 * the ciphertext so the whole thing fits one `bytea` column (no separate iv
 * column on hardware_batches, unlike `connections`).
 *
 * NEVER log the input or output.
 */
export function encryptCodes(codes: StoredCode[]): Buffer {
  const json = JSON.stringify(codes);
  const rec = encrypt(json, BATCH_ENC_CTX);
  return Buffer.concat([rec.iv, rec.ciphertext]);
}

const IV_LEN = 12; // must match envelope.ts GCM nonce length

/**
 * Reverse of `encryptCodes`. Throws on AEAD failure (tampering / wrong context)
 * or malformed input. Returns the original code list for ZIP re-generation.
 */
export function decryptCodes(packed: Buffer): StoredCode[] {
  if (packed.length <= IV_LEN) {
    throw new Error("encrypted_codes: ciphertext too short");
  }
  const iv = packed.subarray(0, IV_LEN);
  const ciphertext = packed.subarray(IV_LEN);
  const json = decrypt({
    ciphertext,
    iv,
    dekCiphertext: Buffer.alloc(0),
    keyVersion: 1,
    encryptionContext: BATCH_ENC_CTX,
  });
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("encrypted_codes: not an array");
  return parsed as StoredCode[];
}

/**
 * Rebuild `BatchRow`s (with the activation hash recomputed) from decrypted
 * stored codes, so the streaming ZIP can be regenerated on re-download exactly
 * as the original was. `activationCodeDisplay === activationCode` for the 5-char
 * code, matching `generateActivationCode`.
 */
export function storedCodesToRows(codes: StoredCode[]): BatchRow[] {
  return codes.map((c) => ({
    slug: c.slug,
    activationCodePlaintext: c.activationCode,
    activationCodeDisplay: c.activationCode,
    // Recompute the hash so the row shape is complete; callers re-downloading
    // don't re-insert devices, but keeping parity avoids surprising consumers.
    activationCodeHash: "",
    serial: c.serial,
    qrUrl: c.qrUrl,
  }));
}
