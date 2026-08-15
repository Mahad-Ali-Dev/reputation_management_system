/**
 * Inspect ONE device end-to-end and explain exactly what a scan would do.
 *
 * Written because "the audit log says it activated, but the devices tab shows
 * nothing and scanning says not-activated" is impossible to diagnose from the
 * app: /r/{slug} has four different routes to the same "not activated" screen,
 * and the devices tab is org-scoped so a workspace mismatch looks identical to
 * a missing device. This prints the raw row, re-runs the scan decision tree
 * against it, and names the branch that fires.
 *
 * Reads with the direct (BYPASSRLS) client on purpose — this is an ops tool and
 * must see the row regardless of which org owns it.
 *
 * Run on the VPS:
 *   sudo -u repulabs HOME=/opt/repulabs bash -c '
 *     cd /opt/repulabs && set -a && . .env.production && set +a &&
 *     pnpm tsx scripts/device-inspect.ts KVF2YF9KGJ
 *   '
 */

import { prisma } from "@/lib/db/client";
import { isAllowedReviewHost, verifySlugSignature } from "@/lib/hardware/codes";

async function main() {
  const slug = (process.argv[2] ?? "").trim().toUpperCase();
  if (!slug) {
    console.error("Usage: pnpm tsx scripts/device-inspect.ts <SLUG>");
    process.exit(1);
  }

  const device = await prisma.device.findUnique({ where: { shortSlug: slug } });

  if (!device) {
    console.log(`No device row with short_slug = ${slug}.`);
    console.log("A scan would 302 to /not-activated (unknown slug).");
    await prisma.$disconnect();
    return;
  }

  console.log("=== devices row ===");
  console.log(`slug:                 ${device.shortSlug}`);
  console.log(`serial:               ${device.serial}`);
  console.log(`sku / kind:           ${device.productSku} / ${device.productKind}`);
  console.log(`status:               ${device.status}`);
  console.log(`organization_id:      ${device.organizationId ?? "(null — unclaimed)"}`);
  console.log(`establishment_id:     ${device.establishmentId ?? "(null)"}`);
  console.log(`activated_at:         ${device.activatedAt?.toISOString() ?? "(null)"}`);
  console.log(`code_used_at:         ${device.activationCodeUsedAt?.toISOString() ?? "(null)"}`);
  console.log(`redirect_url:         ${device.redirectUrl ?? "(null)"}`);
  console.log(`slug_signature:       ${device.slugSignature ? "present" : "(empty)"}`);
  console.log("");

  // Which workspace owns it, and how many devices that workspace can see. This
  // is the "devices tab shows 0" half: the tab is org-scoped, so viewing a
  // different workspace than the one that claimed the device looks identical
  // to the device not existing.
  if (device.organizationId) {
    const org = await prisma.organization.findUnique({
      where: { id: device.organizationId },
      select: { name: true, slug: true },
    });
    const counts = await prisma.device.groupBy({
      by: ["status"],
      where: { organizationId: device.organizationId },
      _count: { _all: true },
    });
    console.log("=== owning workspace ===");
    console.log(`name:                 ${org?.name ?? "(org row missing!)"}`);
    console.log(`org slug:             ${org?.slug ?? "-"}`);
    console.log(
      `its devices:          ${counts.map((c) => `${c.status}=${c._count._all}`).join(", ") || "(none)"}`,
    );
    console.log("");
    console.log("If your workspace switcher is NOT showing the name above, that");
    console.log("is why My Devices reads 0 — switch to it.");
    console.log("");
  }

  // Replay app/r/[slug]/route.ts against this row, in the same order.
  console.log("=== what a scan of this QR does right now ===");
  if (device.status !== "active") {
    console.log(`-> /not-activated?reason=inactive   (status is "${device.status}")`);
  } else if (device.productKind === "multi_platform") {
    console.log("-> /r/pick/<slug> (multi-platform picker)");
  } else if (!device.redirectUrl) {
    console.log("-> /not-activated?reason=no_target  (redirect_url is null)");
  } else if (!device.activatedAt) {
    console.log("-> /not-activated?reason=inactive   (activated_at is null)");
  } else {
    const expiresAtUnix = Math.floor(device.activatedAt.getTime() / 1000) + 60 * 60 * 24 * 365 * 5;
    const sigOk = verifySlugSignature(
      device.shortSlug,
      device.redirectUrl,
      expiresAtUnix,
      device.slugSignature,
    );
    if (!sigOk) {
      console.log("-> /not-activated?reason=signature  (HMAC does NOT verify)");
      console.log("");
      console.log("   The signature was made with a DIFFERENT SLUG_HMAC_SECRET than");
      console.log("   the one this process is running with. Re-activating the device");
      console.log("   or re-saving its redirect URL will re-sign it under the current");
      console.log("   secret and fix the scan.");
    } else if (!isAllowedReviewHost(device.redirectUrl)) {
      console.log("-> /r/external interstitial (signature OK, but the destination");
      console.log(`   host isn't a known review site: ${device.redirectUrl})`);
      console.log("   This is the open-redirect guard, not a failure.");
    } else {
      console.log(`-> 302 straight to ${device.redirectUrl}`);
      console.log("   Signature verifies. This QR is fully working.");
    }
  }
  console.log("");

  const audits = await prisma.auditLog.findMany({
    where: { resourceType: "device", resourceId: device.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, createdAt: true, organizationId: true, afterData: true },
  });
  console.log(`=== audit history (${audits.length}) ===`);
  for (const a of audits) {
    console.log(`${a.createdAt.toISOString()}  ${a.action}  org=${a.organizationId}`);
    if (a.afterData) console.log(`    ${JSON.stringify(a.afterData)}`);
  }
  if (audits.length === 0) console.log("(none — this device was never activated or edited)");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
