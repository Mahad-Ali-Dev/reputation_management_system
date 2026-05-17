/**
 * Dev/ops helper: print every currently-active device + the QR URL it scans
 * to + the PNG filename inside the most recent admin batch ZIP.
 *
 * Useful when a user is unsure which PNG inside the batch ZIP corresponds to
 * the activation code they just redeemed.
 *
 * Run on the VPS:
 *   sudo -u repulabs HOME=/opt/repulabs bash -c '
 *     cd /opt/repulabs && set -a && . .env.production && set +a &&
 *     pnpm tsx scripts/list-active-devices.ts
 *   '
 */

import { prisma } from "@/lib/db/client";

async function main() {
  const rows = await prisma.device.findMany({
    where: { status: "active" },
    select: {
      shortSlug: true,
      redirectUrl: true,
      activatedAt: true,
      productSku: true,
      establishmentId: true,
    },
    orderBy: { activatedAt: "desc" },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  console.log(`Found ${rows.length} active device(s).`);
  console.log("");
  for (const r of rows) {
    console.log(`slug:      ${r.shortSlug}`);
    console.log(`sku:       ${r.productSku}`);
    console.log(`activated: ${r.activatedAt?.toISOString() ?? "(null)"}`);
    console.log(`redirect:  ${r.redirectUrl ?? "(none)"}`);
    console.log(`QR scans to: ${base}/r/${r.shortSlug}`);
    console.log(`In admin ZIP: qr-png/${r.shortSlug}.png  AND  qr-svg/${r.shortSlug}.svg`);
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
