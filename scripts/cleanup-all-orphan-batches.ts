/**
 * Sweep cleanup: delete EVERY unactivated+unclaimed device left behind by
 * any failed batch in the audit log. Useful when the same batch was retried
 * multiple times before the bug was fixed.
 *
 * Cross-references device shortSlugs against the union of all slugs across
 * every `hardware.batch.generated` audit row, so we only delete devices that
 * (a) came from a batch and (b) were never claimed by an org. We do NOT
 * blindly delete every `status=unactivated AND organizationId IS NULL` row,
 * to avoid touching any future inventory provisioning flows.
 *
 * Usage on VPS:
 *   sudo -u repulabs HOME=/opt/repulabs pnpm tsx scripts/cleanup-all-orphan-batches.ts
 *   sudo -u repulabs HOME=/opt/repulabs pnpm tsx scripts/cleanup-all-orphan-batches.ts --yes
 */

import { prisma } from "@/lib/db/client";

async function main() {
  console.log("Collecting all hardware.batch.generated audit rows...");
  const audits = await prisma.auditLog.findMany({
    where: { action: "hardware.batch.generated" },
    orderBy: { createdAt: "desc" },
  });
  console.log(`Found ${audits.length} batch audit row(s).`);

  const allSlugs = new Set<string>();
  for (const a of audits) {
    const after = a.afterData as { slugs?: string[] };
    for (const s of after.slugs ?? []) allSlugs.add(s);
  }
  console.log(`Union of slugs across all batches: ${allSlugs.size}`);

  if (allSlugs.size === 0) {
    console.log("No slugs to look at. Done.");
    return;
  }

  const orphans = await prisma.device.findMany({
    where: {
      shortSlug: { in: Array.from(allSlugs) },
      status: "unactivated",
      organizationId: null,
      activationCodeUsedAt: null,
    },
    select: {
      id: true,
      shortSlug: true,
      productSku: true,
      createdAt: true,
    },
  });

  console.log(`Found ${orphans.length} orphan device(s) across all batches.`);

  if (orphans.length === 0) {
    console.log("Nothing to clean up. Exiting.");
    return;
  }

  const auto = process.argv.includes("--yes");
  if (!auto) {
    console.log("DRY-RUN (re-run with --yes to actually delete):");
    for (const o of orphans) {
      console.log(
        `  would delete: ${o.shortSlug} (sku=${o.productSku}, created ${o.createdAt.toISOString()})`,
      );
    }
    return;
  }

  const result = await prisma.device.deleteMany({
    where: {
      id: { in: orphans.map((o) => o.id) },
      status: "unactivated",
      organizationId: null,
    },
  });
  console.log(`Deleted ${result.count} orphan device(s).`);
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
