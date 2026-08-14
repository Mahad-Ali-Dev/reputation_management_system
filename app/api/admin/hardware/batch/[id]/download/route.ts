import { Readable } from "node:stream";
import { getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import {
  type BatchProduct,
  type BatchRow,
  buildBatchZipStream,
  csvCell,
  decryptCodes,
  safeFilenameSegment,
  storedCodesToRows,
} from "@/lib/hardware/batch";
import { qrSvgWithLogo, resolvePlatform } from "@/lib/hardware/qr";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
import archiver from "archiver";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/hardware/batch/[id]/download
 *
 * Re-download a prior batch's ZIP by id. This is the safety net for the
 * 502-on-500 bug: the original streamed download is the only place plaintext
 * activation codes live, so if it's lost the admin can recover the production
 * kit ONCE from here.
 *
 * Flow:
 *   1. Admin-guard (CSRF/origin + super_admin|engineering role + rate limit) —
 *      mirrors the POST batch route.
 *   2. Load the hardware_batches row, decrypt `encrypted_codes` (AES-256-GCM via
 *      lib/crypto/envelope.ts), rebuild the rows, and STREAM the same ZIP.
 *   3. Increment download_count. The encrypted blob is one-time: it is PURGED
 *      (set null + status='expired') so the plaintext codes can't be re-fetched
 *      after this single recovery (and they expire via expiresAt regardless).
 *
 * POST (not GET) so it carries the SameSite=strict admin cookie under a native
 * <form> submit AND so the side-effecting purge isn't triggered by a prefetch /
 * link crawler. Never logs the plaintext codes.
 */

const ALLOWED_ROLES = new Set(["super_admin", "engineering"] as const);
const IdSchema = z.string().uuid();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // ---- CSRF defense — same-origin Origin check (mirrors POST batch route) ----
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

  const rl = await checkRateLimit("hardware_batch", session.adminId);
  if (!rl.success) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Batch operations are limited to 3/hour/admin. Try again in ${rl.retryAfterSeconds}s.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } },
    );
  }

  const { id: rawId } = await ctx.params;
  const idParse = IdSchema.safeParse(rawId);
  if (!idParse.success) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const id = idParse.data;

  // Load the batch. Fail soft if the table is absent (migration pending).
  let batch:
    | {
        id: string;
        productSku: string;
        productKind: string;
        status: string;
        // Prisma returns `Bytes` as Uint8Array; we wrap in Buffer at the
        // decrypt call site (mirrors lib/connections/adapters/refresh.ts).
        encryptedCodes: Uint8Array | null;
        expiresAt: Date | null;
        downloadCount: number;
      }
    | null;
  try {
    batch = await prisma.hardwareBatch.findUnique({
      where: { id },
      select: {
        id: true,
        productSku: true,
        productKind: true,
        status: true,
        encryptedCodes: true,
        expiresAt: true,
        downloadCount: true,
      },
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      return NextResponse.json(
        { error: "unavailable", message: "Batch history is not available on this deployment yet." },
        { status: 503 },
      );
    }
    throw err;
  }

  if (!batch) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!batch.encryptedCodes || batch.status === "expired") {
    return NextResponse.json(
      {
        error: "expired",
        message:
          "This batch's codes have already been re-downloaded or expired. The activation codes are no longer recoverable.",
      },
      { status: 410 },
    );
  }
  if (batch.expiresAt && batch.expiresAt.getTime() < Date.now()) {
    // Past TTL — purge proactively so the blob doesn't linger, then 410.
    await purgeBatch(id).catch(() => {});
    return NextResponse.json(
      { error: "expired", message: "This batch's re-download window has passed." },
      { status: 410 },
    );
  }

  // Decrypt. AEAD failure (tampering / wrong key) throws — surface as 500, never
  // log the plaintext.
  let rows: BatchRow[];
  try {
    const stored = decryptCodes(Buffer.from(batch.encryptedCodes));
    rows = storedCodesToRows(stored);
  } catch {
    logger.error(
      { event: "hardware.batch.redownload_decrypt_failed", batchId: id, adminId: session.adminId },
      "failed to decrypt batch codes for re-download",
    );
    return NextResponse.json(
      { error: "decrypt_failed", message: "Could not decrypt this batch's codes." },
      { status: 500 },
    );
  }

  // ---- One-time recovery: purge the blob + mark expired, BEFORE streaming. ----
  // Doing it first means a client drop mid-stream still consumes the one allowed
  // recovery (intentional: the codes already left our control once they hit the
  // socket). bump download_count for the audit trail.
  try {
    await purgeBatch(id);
  } catch (err) {
    logger.error(
      { event: "hardware.batch.redownload_purge_failed", batchId: id, err: String(err) },
      "failed to purge batch codes after re-download",
    );
    return NextResponse.json(
      { error: "purge_failed", message: "Could not finalize the re-download." },
      { status: 500 },
    );
  }

  await prisma.auditLog
    .create({
      data: {
        organizationId: null,
        actorType: "admin_user",
        actorId: session.adminId,
        action: "hardware.batch.redownloaded",
        resourceType: "hardware_batch",
        resourceId: id,
        afterData: {
          batchId: id,
          productSku: batch.productSku,
          productKind: batch.productKind,
          quantity: rows.length,
          downloadCountAfter: batch.downloadCount + 1,
        },
      },
    })
    .catch((err) => {
      // Audit failure must not block the recovery download.
      logger.warn({ event: "hardware.batch.redownload_audit_failed", err: String(err) });
    });

  logger.info(
    { event: "hardware.batch.redownloaded", batchId: id, adminId: session.adminId },
    "admin re-downloaded hardware batch",
  );

  // ---- Rebuild + stream the same ZIP shape as the original generation. ----
  const product: BatchProduct = { sku: batch.productSku, name: batch.productSku };
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const safeSku = safeFilenameSegment(batch.productSku);
  const zipFilename = `repulabs-batch-${batch.productKind}-${safeSku}-${rows.length}x-redownload-${ts}.zip`;

  const stream =
    batch.productKind === "nfc" || batch.productKind === "wifi"
      ? buildNfcZipStream(rows, product, batch.productKind).stream
      : buildBatchZipStream(rows, product, { productKind: batch.productKind }).stream;

  const webStream = Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zipFilename}"`,
      "cache-control": "no-store, must-revalidate",
      "x-batch-count": String(rows.length),
      "x-batch-product": batch.productSku,
      "x-batch-kind": batch.productKind,
      "x-batch-redownload": "1",
    },
  });
}

/** Purge the one-time code blob and mark the batch expired. */
async function purgeBatch(id: string): Promise<void> {
  await prisma.hardwareBatch.update({
    where: { id },
    data: {
      encryptedCodes: null,
      status: "expired",
      downloadCount: { increment: 1 },
    },
  });
}

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703") return true;
  const metaCode = (err as { meta?: { code?: string } } | null)?.meta?.code;
  return metaCode === "42P01" || metaCode === "42703";
}

/**
 * NFC/WiFi re-download ZIP — mirrors the POST route's NFC variant (manifest with
 * the encode URL per card + small QR companion, no 1024px PNGs). Kept local to
 * the route per the no-shared-file-edit guardrail; reuses the QR + CSV helpers
 * from lib/hardware/batch + lib/hardware/qr.
 */
function buildNfcZipStream(
  rows: BatchRow[],
  product: BatchProduct,
  productKind: string,
): { stream: Readable; done: Promise<void> } {
  const platform = resolvePlatform(productKind);
  const generatedAt = new Date().toISOString();
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("warning", (err: unknown) => {
    logger.warn({ event: "hardware.batch.nfc_archiver_warning", err: String(err) });
  });

  archive.append(buildNfcReadme(product, rows.length, generatedAt, productKind), {
    name: "README.txt",
  });
  archive.append(buildNfcManifestCsv(rows, product.sku, generatedAt), { name: "manifest.csv" });

  const done = (async () => {
    for (const r of rows) {
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
      "nfc batch zip re-download failed",
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
): string {
  return [
    "Repulabs NFC batch (re-download)",
    "================================",
    "",
    `Product:    ${product.name} (SKU: ${product.sku})`,
    `Kind:       ${productKind}`,
    `Quantity:   ${quantity}`,
    `Generated:  ${generatedAt}`,
    "",
    "This is a one-time recovery export. The activation codes below are now",
    "PURGED from the server — keep this ZIP safe; it cannot be re-downloaded again.",
    "",
    "How to encode each NFC card",
    "---------------------------",
    "  1. Write the `encode_url` value to the NFC chip as an NDEF URI record.",
    "  2. Print the `activation_code` (5-char) on the card / packaging.",
    "  3. Optional: record the serial for inventory tracking.",
    "",
    "Questions: info@repulabs.com",
    "",
  ].join("\n");
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
  return `﻿${[header, ...lines].join("\r\n")}\r\n`;
}
