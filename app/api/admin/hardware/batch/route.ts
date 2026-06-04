import { getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import {
  generateActivationCode,
  generateSerial,
  generateSlug,
  signSlug,
} from "@/lib/hardware/codes";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
// archiver is a CommonJS module (`module.exports = factory`). To get both the
// default export AND the type imports working without webpack mangling the
// runtime value into something non-callable, `archiver` is declared in
// `serverExternalPackages` in next.config.mjs — Next.js skips bundling and
// Node `require`s it normally at runtime.
import archiver from "archiver";
import { type NextRequest, NextResponse } from "next/server";
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

// Restrict SKU character class to defeat CSV-formula injection (=, @, +, -)
// AND filename-injection via `Content-Disposition` (quotes, slashes, CR/LF).
// Real SKUs are kebab-case alphanumerics like "plaque-brass" or "stand-acrylic".
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
  notes: z.string().max(500).optional(),
});

const ALLOWED_ROLES = new Set(["super_admin", "engineering"] as const);

/**
 * Neutralize CSV formula-injection: prefix cells starting with =, +, -, @,
 * \t, \r with a single quote so spreadsheet engines treat them as text. Also
 * quote cells containing , " \n \r and escape internal quotes by doubling.
 * Reference: OWASP "CSV Injection" / CWE-1236.
 */
function csvCell(v: string): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Strip anything that could break a Content-Disposition filename token.
 * RFC 6266 allows only token characters in the unquoted form, and quoted
 * form still can't contain CR/LF or unescaped `"`. We slugify defensively.
 */
function safeFilenameSegment(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64);
}

export async function POST(req: NextRequest) {
  // ---- M-1: CSRF defense — same-origin Origin check ----
  // The cookie is SameSite=strict (see /api/admin/login), so a cross-site form
  // POST already can't carry the session. The Origin check is belt-and-
  // suspenders against older browsers that don't fully honor SameSite.
  //
  // IMPORTANT: behind Nginx, `req.nextUrl.host` is the internal binding host
  // (e.g. `localhost:3000`) — NOT the public host the browser sees. Compare
  // against the forwarded `Host` / `X-Forwarded-Host` header instead, falling
  // back to nextUrl.host for local dev where there's no proxy.
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      const requestHost =
        req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
      if (originHost !== requestHost) {
        return NextResponse.json(
          {
            error: "origin_mismatch",
            message: "cross-site requests not allowed",
          },
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

  // ---- L-1: Rate limit — 3 batches/hour/admin. Bounds the DoS surface where
  // a compromised admin token could spam 500-device generations (each holds
  // ~15 MB of PNG buffers in memory).
  const rl = await checkRateLimit("hardware_batch", session.adminId);
  if (!rl.success) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Batch generation is limited to 3/hour/admin. Try again in ${rl.retryAfterSeconds}s.`,
        retryAfterSeconds: rl.retryAfterSeconds,
      },
      {
        status: 429,
        headers: { "retry-after": String(rl.retryAfterSeconds) },
      },
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
  // M-2: sanitize SKU before interpolation into Content-Disposition filename.
  // Even though BatchSchema restricts the character class, defense in depth.
  const safeSku = safeFilenameSegment(product.sku);
  const zipFilename = `repulabs-batch-${safeSku}-${quantity}x-${ts}.zip`;
  const generatedAt = new Date().toISOString();

  // CSV manifest. Every cell passes through csvCell() to defeat formula
  // injection — productSku is the highest-risk field (admin-supplied via
  // hardware_products row) but we escape everything for consistency.
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
  ]
    .map(csvCell)
    .join(",");
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
    ]
      .map(csvCell)
      .join(","),
  );
  // Excel reads CRLF more reliably and treats it as the canonical CSV line
  // ending. UTF-8 BOM up front helps Excel autodetect encoding.
  const csv = `﻿${[csvHeader, ...csvRows].join("\r\n")}\r\n`;

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
    "  qr-png/<slug>.png  — 1024x1024 PNG QR code (recommended for printing)",
    "  qr-svg/<slug>.svg  — scalable vector QR (use for huge prints or signage)",
    "",
    "What to print on each plaque",
    "----------------------------",
    "  1. The QR image (PNG or SVG) — encodes the scan URL.",
    "  2. The activation_code (e.g. A3M9K) printed BELOW or BESIDE the QR, in a",
    "     clearly legible font (recommend 10-12pt, monospace).",
    "  3. Optional: the serial number, very small, for inventory tracking.",
    "",
    "The activation_code is 5 characters — that exact string is what the",
    "customer types on the activation page (it's case-insensitive).",
    "",
    "After the customer redeems the activation code on repulabs.com/activate,",
    "the QR begins routing scans to that customer's Google review form.",
    "",
    "Questions: ops@repulabs.com",
    "",
  ]
    .filter(Boolean)
    .join("\n");

  // Build the archive in memory. `archiver` is loaded at module scope via
  // createRequire (see top of file).
  const chunks: Buffer[] = [];
  const archive = archiver("zip", {
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
