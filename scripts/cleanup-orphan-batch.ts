/**
 * One-off cleanup: delete unactivated devices from a hardware batch whose
 * activation codes were never returned to the admin (because of the
 * archiver runtime error before the ZIP could be built).
 *
 * Strategy:
 *   1. Find the most recent `hardware.batch.generated` audit row.
 *   2. Read `afterData.slugs` (the array of slugs minted in that batch).
 *   3. For each slug, delete the corresponding Device IF it is still
 *      status='unactivated' AND organizationId IS NULL — i.e. it was never
 *      activated. (Defense against deleting any device that somehow got
 *      activated in the gap between failed-batch and now.)
 *   4. Mark the audit row as superseded so the orphans don't reappear in
 *      reports — leave the original row for forensic history.
 *
 * Run on the VPS as the repulabs user:
 *   sudo -u repulabs HOME=/opt/repulabs pnpm tsx scripts/cleanup-orphan-batch.ts
 *
 * Idempotent: re-running after the cleanup has no effect.
 */

import { prisma } from "@/lib/db/client";

async function main() {
  console.log("Looking for the most recent hardware.batch.generated audit row...");
  const recent = await prisma.auditLog.findFirst({
    where: { action: "hardware.batch.generated" },
    orderBy: { createdAt: "desc" },
  });
  if (!recent) {
    console.log("No batch audit log found. Nothing to do.");
    return;
  }

  const after = recent.afterData as {
    productSku?: string;
    quantity?: number;
    slugs?: string[];
    notes?: string | null;
  };
  const slugs = after?.slugs ?? [];

  console.log("");
  console.log("Most recent batch:");
  console.log(`  audit_log.id: ${recent.id}`);
  console.log(`  created_at:   ${recent.createdAt.toISOString()}`);
  console.log(`  actor:        ${recent.actorType}:${recent.actorId}`);
  console.log(`  productSku:   ${after.productSku ?? "(unknown)"}`);
  console.log(`  quantity:     ${after.quantity ?? "(unknown)"}`);
  console.log(`  notes:        ${after.notes ?? "—"}`);
  console.log(`  slugs:        ${slugs.length} slug(s)`);
  console.log("");

  if (slugs.length === 0) {
    console.log("Audit row has no slugs array. Nothing to delete.");
    return;
  }

  // Look up the devices to see which ones are still unactivated.
  const candidates = await prisma.device.findMany({
    where: { shortSlug: { in: slugs } },
    select: {
      id: true,
      shortSlug: true,
      status: true,
      organizationId: true,
      activationCodeUsedAt: true,
      createdAt: true,
    },
  });

  console.log(`Found ${candidates.length} device(s) matching those slugs.`);
  const orphans = candidates.filter(
    (d) =>
      d.status === "unactivated" &&
      d.organizationId === null &&
      d.activationCodeUsedAt === null,
  );
  const skipped = candidates.length - orphans.length;
  console.log(`  ${orphans.length} are orphans (unactivated + no org) — will delete`);
  console.log(`  ${skipped} have been claimed since the failed batch — will keep`);
  console.log("");

  if (orphans.length === 0) {
    console.log("Nothing to clean up. Exiting.");
    return;
  }

  // Confirm before deleting (skip if --yes is passed).
  const auto = process.argv.includes("--yes");
  if (!auto) {
    console.log("DRY-RUN (re-run with --yes to actually delete):");
    for (const o of orphans) {
      console.log(`  would delete: ${o.shortSlug} (created ${o.createdAt.toISOString()})`);
    }
    return;
  }

  // Real delete + an audit row recording the cleanup.
  const result = await prisma.$transaction(async (tx) => {
    const deleted = await tx.device.deleteMany({
      where: {
        id: { in: orphans.map((o) => o.id) },
        status: "unactivated",
        organizationId: null,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: null,
        actorType: "system",
        actorId: "cleanup-script",
        action: "hardware.batch.orphans_deleted",
        resourceType: "hardware_batch",
        resourceId: recent.id,
        afterData: {
          parentBatchAuditId: recent.id,
          deletedCount: deleted.count,
          deletedSlugs: orphans.map((o) => o.shortSlug),
          productSku: after.productSku ?? null,
          reason:
            "Batch generation failed mid-stream (archiver runtime error); activation codes never returned to admin. Cleaned up unredeemable inventory.",
        },
      },
    });
    return deleted;
  });

  console.log(`Deleted ${result.count} orphan device(s). Audit log written.`);
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
