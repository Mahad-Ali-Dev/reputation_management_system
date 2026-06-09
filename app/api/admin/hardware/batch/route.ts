import { Readable } from "node:stream";
import { getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import {
  type BatchProduct,
  type BatchRow,
  buildBatchZipStream,
  csvCell,
  encryptCodes,
  generateBatchRows,
  rowsToStoredCodes,
  safeFilenameSegment,
} from "@/lib/hardware/batch";
import { signSlug } from "@/lib/hardware/codes";
import { qrSvgWithLogo, resolvePlatform } from "@/lib/hardware/qr";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
// archiver is a CommonJS module (`module.exports = factory`). It is declared in
// `serverExternalPackages` in next.config.mjs so Next.js skips bundling and Node
// `require`s it normally at runtime. Used here for the NFC ZIP variant (the QR
// variant streams via lib/hardware/batch#buildBatchZipStream).
import archiver from "archiver";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A 500-device run streams its ZIP incrementally, but the whole generation
// (QR rasterization + compression) can still take a few minutes. 300s matches
// the dedicated nginx location (proxy_read_timeout 300s) so neither layer cuts
// the connection mid-stream.
export const maxDuration = 300;

/**
 * POST /api/admin/hardware/batch
 *
 * Admin-initiated bulk QR/NFC generation for factory production runs. Returns a
 * single ZIP, STREAMED incrementally so nginx never trips proxy_read_timeout.
 *
 * THE BUG THIS FIXES
 * ------------------
 * The previous version committed 500 devices + an audit row, THEN synchronously
 * generated 500x1024 QR PNGs and buffered the ENTIRE ZIP in memory before
 * sending a single byte. Behind nginx (proxy_read_timeout 60s) a 500-device run
 * blew the timeout → 502 → the buffered ZIP (the ONLY place plaintext activation
 * codes ever existed — the DB stores SHA-256 hashes only) was lost → bricked
 * devices.
 *
 * THE FIX
 * -------
 *   1. Generate rows (slug/serial/code/qrUrl) in memory — pure, no DB.
 *   2. Persist a `hardware_batches` row with the activation codes ENVELOPE-
 *      ENCRYPTED (AES-256-GCM, see lib/crypto/envelope.ts) + commit the devices
 *      in ONE transaction. This happens BEFORE we stream a single ZIP byte, so
 *      even if the client drops mid-download the codes survive and the batch can
 *      be re-downloaded from /admin/hardware (the encrypted blob is purged after
 *      the first re-download or a short TTL).
 *   3. RETURN A STREAMING ZIP — `Readable.toWeb(stream)` hands nginx bytes
 *      incrementally (README + manifest flush first, then one device at a time),
 *      so the connection stays alive past 60s and the 502 never happens.
 *
 * productKind:
 *   - 'qr'  (default) → full print kit: README + manifest.csv + qr-png/<slug>.png
 *                       (1024px, print-ready) + qr-svg/<slug>.svg (vector, logo).
 *   - 'nfc' / 'wifi'  → NFC encode kit: README + manifest.csv with the encode URL
 *                       per card + an OPTIONAL small qr-svg/<slug>.svg companion
 *                       (no 1024px PNGs — NFC cards are written, not printed).
 *   - 'multi_platform'→ treated as 'qr' artifacts with the multi-platform glyph.
 *
 * Auth: requires admin session with role super_admin or engineering. Mirrors the
 * CSRF/origin + role + rate-limit guards of the original route.
 *
 * Body (form-urlencoded): productSku, quantity (1-500), productKind (optional),
 * notes (optional).
 */

// Restrict SKU character class to defeat CSV-formula injection (=, @, +, -)
// AND filename-injection via `Content-Disposition` (quotes, slashes, CR/LF).
const BatchSchema = z.object({
  productSku: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9][a-z0-9_-]{0,63}$/i,
      "productSku must be alphanumeric with hyphens/underscores",
    ),
  quantity: z.coerce.number().int().min(1).max(500),
  // Physical kind. Defaults to 'qr' so existing forms (no productKind field)
  // keep working unchanged.
  productKind: z.enum(["qr", "nfc", "wifi", "multi_platform"]).default("qr"),
  notes: z.string().max(500).optional(),
});

const ALLOWED_ROLES = new Set(["super_admin", "engineering"] as const);

// Re-download window for the encrypted-codes blob. After this the row is treated
// as expired and the blob is unusable even if not yet purged.
const REDOWNLOAD_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export async function POST(req: NextRequest) {
  // ---- CSRF defense — same-origin Origin check ----
  // The cookie is SameSite=strict, so a cross-site form POST already can't carry
  // the session; the Origin check is belt-and-suspenders for older browsers.
  // Behind nginx, compare against the forwarded Host, not nextUrl.host (which is
  // the internal binding host like localhost:3000).
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const requestHost =
        req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
      if (originHost !== requestHost) {
        return NextResponse.json(
          { error: "origin_mismatch", message: "cross-site requests not allowed" },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json({ error: "invalid_origin" }, { status: 400 });
    }
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(session.role as "super_admin" | "engineering")) {
    return NextResponse.json(
      { error: "forbidden", message: "super_admin or engineering role required" },
      { status: 403 },
    );
  }

  // ---- Rate limit — 3 batches/hour/admin. Bounds the DoS surface where a
  // compromised admin token could spam 500-device generations.
  const rl = await checkRateLimit("hardware_batch", session.adminId);
  if (!rl.success) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Batch generation is limited to 3/hour/admin. Try again in ${rl.retryAfterSeconds}s.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }

  const formData = await req.formData();
  const parsed = BatchSchema.safeParse({
    productSku: formData.get("productSku"),
    quantity: formData.get("quantity"),
    productKind: formData.get("productKind") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_input",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 400 },
    );
  }
  const { productSku, quantity, productKind, notes } = parsed.data;

  const product = await prisma.hardwareProduct.findUnique({
    where: { sku: productSku },
    select: { id: true, sku: true, name: true, isActive: true, unitsPerPack: true },
  });
  if (!product) {
    return NextResponse.json({ error: "product_not_found" }, { status: 400 });
  }
  if (!product.isActive) {
    return NextResponse.json({ error: "product_inactive" }, { status: 400 });
  }

  // ---- 1. Generate rows in memory (pure, no DB) ----
  const rows = generateBatchRows(quantity);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  const placeholderRedirect = `${appUrl}/not-activated`;
  const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5;
  const redownloadExpiresAt = new Date(Date.now() + REDOWNLOAD_TTL_MS);

  // ---- 2. Persist BEFORE streaming: devices + envelope-encrypted batch + audit ----
  // Critical ordering: the encrypted-codes blob is written here, so if the
  // streamed download is lost (client drop / proxy hiccup) the admin can still
  // re-download from /admin/hardware. encryptCodes NEVER logs the plaintext.
  let encrypted: Buffer;
  try {
    encrypted = encryptCodes(rowsToStoredCodes(rows));
  } catch {
    // ENCRYPTION_MASTER_KEY missing/invalid — fail loudly BEFORE minting devices,
    // since without the blob a lost download = bricked batch.
    logger.error(
      { event: "hardware.batch.encrypt_failed", adminId: session.adminId },
      "failed to envelope-encrypt batch codes; aborting before device insert",
    );
    return NextResponse.json(
      {
        error: "encryption_unavailable",
        message:
          "Server encryption key not configured; refusing to mint a batch whose codes can't be re-downloaded.",
      },
      { status: 500 },
    );
  }

  let batchId: string | null = null;
  try {
    batchId = await prisma.$transaction(
      async (tx) => {
        // Build the full device payload in memory (pure CPU — signSlug is local),
        // then bulk-insert in chunks. The previous version issued ~500 individual
        // `tx.device.create()` round-trips inside the interactive transaction,
        // which blew Prisma's default 5s timeout on a 500-device run. `createMany`
        // collapses each chunk into a single multi-row INSERT.
        const deviceData = rows.map((row) => ({
          organizationId: null,
          establishmentId: null,
          orderId: null,
          productSku,
          productKind,
          serial: row.serial,
          shortSlug: row.slug,
          slugSignature: signSlug(row.slug, placeholderRedirect, expiresAtUnix),
          activationCodeHash: row.activationCodeHash,
          // redirect_url stays null while status="unactivated" (CHECK allows).
          status: "unactivated",
        }));

        const CHUNK_SIZE = 100;
        for (let i = 0; i < deviceData.length; i += CHUNK_SIZE) {
          await tx.device.createMany({ data: deviceData.slice(i, i + CHUNK_SIZE) });
        }

      // Persist the batch row with the encrypted codes for re-download. Wrapped
      // in a try so a missing hardware_batches table (42P01 — migration not yet
      // run) doesn't brick the whole batch: the devices + audit still commit and
      // the ZIP still streams; only re-download is unavailable until migrated.
      let createdBatchId: string | null = null;
      try {
        const batch = await tx.hardwareBatch.create({
          data: {
            productSku,
            productKind,
            quantity,
            status: "ready",
            notes: notes ?? null,
            createdByAdminId: session.adminId,
            downloadCount: 0,
            encryptedCodes: new Uint8Array(encrypted),
            expiresAt: redownloadExpiresAt,
          },
          select: { id: true },
        });
        createdBatchId = batch.id;
      } catch (err) {
        if (!isMissingRelation(err)) throw err;
        logger.warn(
          { event: "hardware.batch.table_missing", adminId: session.adminId },
          "hardware_batches table absent (migration pending) — re-download disabled for this batch",
        );
      }

      await tx.auditLog.create({
        data: {
          organizationId: null,
          actorType: "admin_user",
          actorId: session.adminId,
          action: "hardware.batch.generated",
          resourceType: "hardware_batch",
          resourceId: createdBatchId,
          afterData: {
            batchId: createdBatchId,
            productSku,
            productKind,
            productName: product.name,
            quantity,
            notes: notes ?? null,
            slugs: rows.map((r) => r.slug),
          },
        },
      });

      return createdBatchId;
      },
      // A 500-device run does real work inside the transaction (createMany chunks
      // + encrypted-batch insert + audit row). The default interactive-transaction
      // timeout (5s) is far too tight; raise it generously. maxWait bounds how long
      // we'll block waiting for a pool connection before starting.
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (err) {
    logger.error(
      { event: "hardware.batch.persist_failed", adminId: session.adminId, err: String(err) },
      "failed to persist hardware batch; no devices committed",
    );
    return NextResponse.json(
      { error: "persist_failed", message: "Could not commit the batch. Nothing was generated." },
      { status: 500 },
    );
  }

  logger.info(
    {
      event: "hardware.batch.generated",
      adminId: session.adminId,
      batchId,
      productSku,
      productKind,
      quantity,
    },
    "admin generated hardware batch",
  );

  // ---- 3. Stream the ZIP ----
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeSku = safeFilenameSegment(product.sku);
  const zipFilename = `repulabs-batch-${productKind}-${safeSku}-${quantity}x-${ts}.zip`;

  const batchProduct: BatchProduct = { sku: product.sku, name: product.name };
  const stream =
    productKind === "nfc" || productKind === "wifi"
      ? buildNfcZipStream(rows, batchProduct, { productKind, notes }).stream
      : buildBatchZipStream(rows, batchProduct, { productKind, notes }).stream;

  // Readable.toWeb gives nginx bytes incrementally. Without this the response
  // would buffer the whole ZIP and re-introduce the 502.
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zipFilename}"`,
      // No content-length — the body is chunked/streamed.
      "cache-control": "no-store, must-revalidate",
      "x-batch-count": String(quantity),
      "x-batch-product": productSku,
      "x-batch-kind": productKind,
      ...(batchId ? { "x-batch-id": batchId } : {}),
    },
  });
}

/**
 * Postgres "undefined table" (42P01) / "undefined column" (42703) detection, so
 * a not-yet-migrated hardware_batches table fails soft (per the build's
 * no-prisma-migrate rule) instead of bricking the batch.
 */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703") return true;
  // Prisma wraps the PG code in meta.code on P2010 raw-query errors.
  const metaCode = (err as { meta?: { code?: string } } | null)?.meta?.code;
  return metaCode === "42P01" || metaCode === "42703";
}

/**
 * NFC/WiFi-card encode kit. Unlike the QR variant, NFC cards are WRITTEN (the
 * encode URL goes on the chip), not printed — so we skip the 1024px PNGs and
 * emit a manifest with the per-card encode URL + an OPTIONAL small SVG QR
 * companion (handy for a printed fallback sticker). Streams incrementally with
 * the same backpressure discipline as buildBatchZipStream.
 */
function buildNfcZipStream(
  rows: BatchRow[],
  product: BatchProduct,
  opts: { productKind: string; notes?: string | null },
): { stream: Readable; done: Promise<void> } {
  const platform = resolvePlatform(opts.productKind);
  const generatedAt = new Date().toISOString();
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("warning", (err: unknown) => {
    logger.warn({ event: "hardware.batch.nfc_archiver_warning", err: String(err) });
  });

  archive.append(buildNfcReadme(product, rows.length, generatedAt, opts.productKind, opts.notes), {
    name: "README.txt",
  });
  archive.append(buildNfcManifestCsv(rows, product.sku, generatedAt), { name: "manifest.csv" });

  const done = (async () => {
    for (const r of rows) {
      // Small companion QR (256px) so the same card can be printed with a
      // fallback sticker. NO 1024px PNG — NFC is written, not printed.
      const svg = await qrSvgWithLogo(r.qrUrl, platform, { width: 256 });
      archive.append(svg, { name: `qr-svg/${r.slug}.svg` });
      if (archive.writableNeedDrain) {
        await new Promise<void>((resolve) => archive.once("drain", () => resolve()));
      }
    }
    await archive.finalize();
  })();

  done.catch((err) => {
    logger.error(
      { event: "hardware.batch.nfc_zip_failed", err: String(err) },
      "nfc batch zip generation failed",
    );
    try {
      archive.abort();
    } catch {
      // already destroyed
    }
  });

  return { stream: archive, done };
}

function buildNfcReadme(
  product: BatchProduct,
  quantity: number,
  generatedAt: string,
  productKind: string,
  notes?: string | null,
): string {
  return [
    "Repulabs NFC batch",
    "==================",
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
    "  manifest.csv       — table mapping each card to its slug, encode URL + activation code",
    "  qr-svg/<slug>.svg  — OPTIONAL small QR companion (printed fallback sticker)",
    "",
    "How to encode each NFC card",
    "---------------------------",
    "  1. Write the `encode_url` value (column in manifest.csv) to the NFC chip as",
    "     an NDEF URI record. That URL is the public scan endpoint for the card.",
    "  2. The `activation_code` (5-char code) is what the customer types on the",
    "     activation page to claim the card — print it on the card or its packaging.",
    "  3. Optional: write the serial number to the chip's user memory / print it",
    "     small for inventory tracking.",
    "",
    "The encode_url and the QR companion encode the SAME URL, so a phone that taps",
    "the chip OR scans the printed QR lands in the same place.",
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

function buildNfcManifestCsv(rows: BatchRow[], productSku: string, generatedAt: string): string {
  const header = [
    "slug",
    "encode_url",
    "activation_code",
    "activation_code_display",
    "serial",
    "product_sku",
    "qr_svg_filename",
    "generated_at",
  ]
    .map(csvCell)
    .join(",");
  const lines = rows.map((r) =>
    [
      r.slug,
      // encode_url is the URL written to the NFC chip — identical to qrUrl.
      r.qrUrl,
      r.activationCodePlaintext,
      r.activationCodeDisplay,
      r.serial,
      productSku,
      `qr-svg/${r.slug}.svg`,
      generatedAt,
    ]
      .map(csvCell)
      .join(","),
  );
  // UTF-8 BOM + CRLF for Excel autodetect.
  return `﻿${[header, ...lines].join("\r\n")}\r\n`;
}
