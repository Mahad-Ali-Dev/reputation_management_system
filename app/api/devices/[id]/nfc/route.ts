import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/devices/{id}/nfc
 *
 * Returns the NFC encode payload for a device — i.e. the exact value an NFC
 * writer app (NXP TagWriter, NFC Tools, etc.) should write to the chip as an
 * NDEF "URI" record. That value is the device's public scan URL
 * (`{APP_URL}/r/{shortSlug}`), identical to what the printed QR encodes: an NFC
 * tap and a QR scan both resolve through the same `/r/[slug]` edge redirect, so
 * the destination, HMAC signature, and analytics are shared.
 *
 * Tenant-scoped via RLS (`withTenant`) so one org can never read another org's
 * slug. Returns only the public slug + URL plus the recorded chip UID — NOTHING
 * sensitive (no activation code, no signature, no hash).
 *
 * Response (200):
 *   {
 *     id, slug, url,
 *     productKind,          // 'nfc' | 'wifi' | 'qr' | 'multi_platform'
 *     nfcUid,               // recorded chip UID, or null if not yet recorded
 *     recordType: "uri",    // NDEF record hint for writer apps
 *   }
 */
export async function GET(
  _req: NextRequest,
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
      select: { id: true, shortSlug: true, productKind: true, nfcUid: true, status: true },
    });
  });
  if (!device) {
    return NextResponse.json({ error: "device_not_found" }, { status: 404 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  const url = `${base}/r/${device.shortSlug}`;

  return NextResponse.json(
    {
      id: device.id,
      slug: device.shortSlug,
      url,
      productKind: device.productKind,
      nfcUid: device.nfcUid,
      status: device.status,
      recordType: "uri",
    },
    { headers: { "cache-control": "private, max-age=300" } },
  );
}
