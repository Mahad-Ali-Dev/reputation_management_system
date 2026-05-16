// archiver is a CommonJS module (`module.exports = factory`). Next's bundler
// emits "no default export" when imported via `import archiver from "archiver"`.
// Namespace-import + extract via `.default` (esModuleInterop wrapper) avoids
// the warning AND works at runtime.
import * as archiverModule from "archiver";
import type { Archiver, ArchiverOptions, Format } from "archiver";
import { getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import {
  generateActivationCode,
  generateSerial,
  generateSlug,
  signSlug,
} from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generating + PNG-encoding 500 QRs can take 10-20 seconds; default 10s
// timeout is too tight.
export const maxDuration = 60;

/**
 * POST /api/admin/hardware/batch
 *
 * Admin-initiated bulk QR generation for factory production runs. Returns a
 * single ZIP file containing everything the factory needs to print:
 *
 *   - README.txt       — workflow instructions
 *   - manifest.csv     — table of (slug, activation_code, serial, qr_url, ...)
 *   - qr-png/<slug>.png  — 1024x1024 PNG QR per device (high-res, print-ready)
 *   - qr-svg/<slug>.svg  — vector QR per device (scale to any size)
 *
 * Critical UX rule: activation codes are SHA-256 hashed on insert. The plaintext
 * exists only in memory during this request — once the response stream ends,
 * there is NO WAY to recover it from the DB. The CSV in this ZIP is the only
 * place the codes appear in plaintext. Lose the ZIP → batch is bricked.
 *
 * The endpoint is form-encoded so a regular <form action="/api/..." method="post">
 * triggers a native browser download — no JS / fetch needed.
 *
 * Auth: requires admin session with role super_admin or engineering.
 *
 * Body (form-urlencoded):
 *   - productSku   (required, must exist + is_active=true in hardware_products)
 *   - quantity     (1-500)
 *   - notes        (optional, free text — recorded on the audit log only)
 *
 * Response: 200 application/zip with Content-Disposition: attachment
 */

const BatchSchema = z.object({
  productSku: z.string().min(1).max(64),
  quantity: z.coerce.number().int().min(1).max(500),
  notes: z.string().max(500).optional(),
});

const ALLOWED_ROLES = new Set(["super_admin", "engineering"] as const);

export async function POST(req: NextRequest) {
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

  const formData = await req.formData();
  const parsed = BatchSchema.safeParse({
    productSku: formData.get("productSku"),
    quantity: formData.get("quantity"),
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
  const { productSku, quantity, notes } = parsed.data;

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

  // Pre-generate everything in memory so we have one transactional commit
  // and the ZIP build is straightforward.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  const placeholderRedirect = `${appUrl}/not-activated`;
  const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5;

  type Row = {
    slug: string;
    activationCodePlaintext: string;
    activationCodeDisplay: string;
    activationCodeHash: string;
    serial: string;
    qrUrl: string;
  };

  const rows: Row[] = [];
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
      qrUrl: `${appUrl}/r/${slug}`,
    });
  }

  // Single transaction: insert all devices + one batch-level audit row.
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const slugSignature = signSlug(row.slug, placeholderRedirect, expiresAtUnix);
      await tx.device.create({
        data: {
          organizationId: null,
          establishmentId: null,
          orderId: null,
          productSku,
          serial: row.serial,
          shortSlug: row.slug,
          slugSignature,
          activationCodeHash: row.activationCodeHash,
          // redirect_url stays null while status="unactivated" (CHECK constraint allows).
          status: "unactivated",
        },
      });
    }
    await tx.auditLog.create({
      data: {
        organizationId: null,
        actorType: "admin_user",
        actorId: session.adminId,
        action: "hardware.batch.generated",
        resourceType: "hardware_batch",
        afterData: {
          productSku,
          productName: product.name,
          quantity,
          notes: notes ?? null,
          slugs: rows.map((r) => r.slug),
        },
      },
    });
  });

  logger.info(
    {
      event: "hardware.batch.generated",
      adminId: session.adminId,
      productSku,
      quantity,
    },
    "admin generated hardware batch",
  );

  // ===== Build the ZIP =====
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const zipFilename = `repulabs-batch-${product.sku}-${quantity}x-${ts}.zip`;
  const generatedAt = new Date().toISOString();

  // CSV manifest
  const csvHeader = [
    "slug",
    "activation_code",
    "activation_code_display",
    "serial",
    "product_sku",
    "qr_url",
    "qr_png_filename",
    "qr_svg_filename",
    "generated_at",
  ].join(",");
  const csvRows = rows.map((r) =>
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
    ].join(","),
  );
  const csv = [csvHeader, ...csvRows].join("\n") + "\n";

  // README for the factory
  const readme = [
    "Repulabs hardware batch",
    "=======================",
    "",
    `Product:    ${product.name} (SKU: ${product.sku})`,
    `Quantity:   ${quantity}`,
    `Generated:  ${generatedAt}`,
    notes ? `Notes:      ${notes}` : "",
    "",
    "What's inside",
    "-------------",
    "  README.txt         — this file",
    "  manifest.csv       — table mapping each plaque to its slug + activation code",
    `  qr-png/<slug>.png  — 1024x1024 PNG QR code (recommended for printing)`,
    `  qr-svg/<slug>.svg  — scalable vector QR (use for huge prints or signage)`,
    "",
    "What to print on each plaque",
    "----------------------------",
    "  1. The QR image (PNG or SVG) — encodes the scan URL.",
    "  2. The activation_code_display (e.g. ABCD-EF12) printed BELOW or BESIDE",
    "     the QR, in a clearly legible font (recommend 10-12pt, monospace).",
    "  3. Optional: the serial number, very small, for inventory tracking.",
    "",
    "DO NOT print the raw `activation_code` (no dash). The display form is",
    "what the customer types on the activation page.",
    "",
    "After the customer redeems the activation code on repulabs.com/activate,",
    "the QR begins routing scans to that customer's Google review form.",
    "",
    "Questions: ops@repulabs.com",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  // Resolve archiver's factory — CJS interop yields either .default or the
  // module itself depending on bundler. Cast through unknown to satisfy TS.
  type ArchiverFactory = (format: Format, opts?: ArchiverOptions) => Archiver;
  const createArchive =
    ((archiverModule as unknown as { default?: ArchiverFactory }).default ??
      (archiverModule as unknown as ArchiverFactory)) as ArchiverFactory;

  // Build the archive in memory.
  const chunks: Buffer[] = [];
  const archive = createArchive("zip", {
    zlib: { level: 9 }, // max compression (PNG already compressed, but CSV/SVG benefit)
  });

  archive.on("data", (chunk: Buffer) => chunks.push(chunk));
  archive.on("warning", (err) => {
    logger.warn({ event: "archiver.warning", err: String(err) });
  });

  const done = new Promise<void>((resolve, reject) => {
    archive.on("end", () => resolve());
    archive.on("error", (err) => reject(err));
  });

  archive.append(readme, { name: "README.txt" });
  archive.append(csv, { name: "manifest.csv" });

  // One PNG + one SVG per device.
  // Done in parallel via Promise.all — qrcode.toBuffer/toString are async
  // but CPU-bound; Node's libuv handles them fine in a thread pool.
  const pngs = await Promise.all(
    rows.map(async (r) => ({
      slug: r.slug,
      buf: await QRCode.toBuffer(r.qrUrl, {
        type: "png",
        width: 1024,
        margin: 4,
        errorCorrectionLevel: "M",
      }),
    })),
  );
  for (const p of pngs) {
    archive.append(p.buf, { name: `qr-png/${p.slug}.png` });
  }

  const svgs = await Promise.all(
    rows.map(async (r) => ({
      slug: r.slug,
      svg: await QRCode.toString(r.qrUrl, {
        type: "svg",
        width: 256,
        margin: 4,
        errorCorrectionLevel: "M",
      }),
    })),
  );
  for (const s of svgs) {
    archive.append(s.svg, { name: `qr-svg/${s.slug}.svg` });
  }

  await archive.finalize();
  await done;

  const zipBuffer = Buffer.concat(chunks);

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zipFilename}"`,
      "content-length": String(zipBuffer.length),
      "cache-control": "no-store, must-revalidate",
      "x-batch-count": String(quantity),
      "x-batch-product": productSku,
    },
  });
}
