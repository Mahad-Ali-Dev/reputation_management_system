import { type NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import {
  type QrPlatform,
  qrPngWithLogo,
  qrSvgWithLogo,
  resolvePlatform,
} from "@/lib/hardware/qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/devices/{id}/qr?format=svg|png&platform=google|instagram|facebook|multi
 *
 * Returns a QR code for the device's short_slug. Tenant-scoped (RLS).
 * Useful for: in-app QR preview, ad-hoc reprints, admin label generation.
 *
 * `platform` (optional) centers a brand glyph in the QR via lib/hardware/qr.ts:
 *   - svg → `qrSvgWithLogo` (pure string injection; always available).
 *   - png → `qrPngWithLogo` (rasterizes the SVG-with-logo via `sharp` if
 *     present, else falls back to a plain logo-less PNG — never throws).
 * When `platform` is omitted we derive a sensible default from the device's
 * review destination (`redirectUrl`): a google.* / g.page link → the Google
 * glyph, a facebook/instagram link → those glyphs, a multi_platform device →
 * the multi glyph, else the generic `repulabs` mark. Pass `platform=none` (or
 * any unknown value via the legacy plain path) to force the bare QR.
 */

/**
 * Derive the default centered glyph for a device from its review destination
 * and product kind. Returns null when there's nothing to key off — the caller
 * then renders a plain (logo-less) QR, preserving the historical behavior for
 * devices that predate the platform glyph feature.
 */
function defaultPlatformFor(
  redirectUrl: string | null,
  productKind: string,
): QrPlatform | null {
  if (productKind === "multi_platform") return "multi";
  if (!redirectUrl) return null;
  let host = "";
  try {
    host = new URL(redirectUrl).host.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("google.") || host.endsWith("g.page") || host.includes("goo.gl")) {
    return "google";
  }
  if (host.includes("facebook.") || host.includes("fb.")) return "facebook";
  if (host.includes("instagram.")) return "instagram";
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const device = await withTenant(orgId, async (tx) => {
    return tx.device.findFirst({
      where: { id },
      select: { shortSlug: true, redirectUrl: true, productKind: true },
    });
  });
  if (!device) {
    return NextResponse.json({ error: "device_not_found" }, { status: 404 });
  }

  const redirectBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${redirectBase}/r/${device.shortSlug}`;

  const format = req.nextUrl.searchParams.get("format") ?? "svg";
  const platformParam = req.nextUrl.searchParams.get("platform");

  // Resolve the centered glyph:
  //   - explicit ?platform=none → no glyph (bare QR).
  //   - explicit, recognized value → that glyph.
  //   - omitted → derive from the device's destination/kind; null = bare QR.
  let platform: QrPlatform | null;
  if (platformParam === "none") {
    platform = null;
  } else if (platformParam && isKnownPlatformAlias(platformParam)) {
    // resolvePlatform maps unknowns to "repulabs"; only honor it when the input
    // was actually one of the known aliases (otherwise fall through to derive).
    platform = resolvePlatform(platformParam);
  } else {
    platform = defaultPlatformFor(device.redirectUrl, device.productKind);
  }

  const filename = `repulabs-${device.shortSlug}`;

  if (format === "png") {
    let buffer: Buffer;
    if (platform) {
      ({ buffer } = await qrPngWithLogo(url, platform, { width: 512, margin: 2 }));
    } else {
      buffer = await QRCode.toBuffer(url, {
        type: "png",
        width: 512,
        margin: 2,
        errorCorrectionLevel: "M",
      });
    }
    // Coerce Node Buffer to an ArrayBuffer-backed Uint8Array — satisfies the narrow BodyInit type.
    const ab = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(ab).set(buffer);
    return new NextResponse(ab, {
      headers: {
        "content-type": "image/png",
        "cache-control": "private, max-age=300",
        "content-disposition": `attachment; filename="${filename}.png"`,
      },
    });
  }

  // SVG (default)
  const svg = platform
    ? await qrSvgWithLogo(url, platform, { width: 256, margin: 2 })
    : await QRCode.toString(url, {
        type: "svg",
        width: 256,
        margin: 2,
        errorCorrectionLevel: "M",
      });
  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "private, max-age=300",
      "content-disposition": `attachment; filename="${filename}.svg"`,
    },
  });
}

/**
 * True when the raw query value is one of the aliases `resolvePlatform` maps to
 * a *real* glyph — used to distinguish an intentional `?platform=google` from
 * an unrecognized string (which `resolvePlatform` would silently coerce to
 * "repulabs"). Kept in sync with `resolvePlatform`'s alias table.
 */
function isKnownPlatformAlias(raw: string): boolean {
  const k = raw.toLowerCase().trim();
  return [
    "google",
    "google_business",
    "gbp",
    "instagram",
    "ig",
    "facebook",
    "fb",
    "meta",
    "star",
    "review",
    "multi",
    "multi_platform",
    "repulabs",
  ].includes(k);
}
