import { type NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/devices/{id}/qr?format=svg|png
 *
 * Returns a QR code for the device's short_slug. Tenant-scoped (RLS).
 * Useful for: in-app QR preview, ad-hoc reprints, admin label generation.
 */
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
      select: { shortSlug: true },
    });
  });
  if (!device) {
    return NextResponse.json({ error: "device_not_found" }, { status: 404 });
  }

  const redirectBase = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = `${redirectBase}/r/${device.shortSlug}`;

  const format = req.nextUrl.searchParams.get("format") ?? "svg";

  const filename = `repulabs-${device.shortSlug}`;

  if (format === "png") {
    const buffer = await QRCode.toBuffer(url, {
      type: "png",
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
    });
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
  const svg = await QRCode.toString(url, {
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
