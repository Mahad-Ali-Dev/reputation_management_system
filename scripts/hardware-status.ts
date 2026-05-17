/**
 * One-shot ops sanity check: confirms the full hardware flow is recording
 * everything the admin needs to see.
 *
 *   - Devices: how many unactivated / active / retired
 *   - Audit log: how many batches generated, how many activations
 *   - Most recent activations with org + redirect target
 *
 * Run on the VPS:
 *   sudo -u repulabs HOME=/opt/repulabs bash -c '
 *     cd /opt/repulabs && set -a && . .env.production && set +a &&
 *     pnpm tsx scripts/hardware-status.ts
 *   '
 */

import { prisma } from "@/lib/db/client";

async function main() {
  const [
    unactivated,
    active,
    retired,
    batches,
    activations,
    recentActivations,
  ] = await Promise.all([
    prisma.device.count({ where: { status: "unactivated" } }),
    prisma.device.count({ where: { status: "active" } }),
    prisma.device.count({ where: { status: "retired" } }),
    prisma.auditLog.count({
      where: { action: "hardware.batch.generated" },
    }),
    prisma.auditLog.count({ where: { action: "device.activated" } }),
    prisma.auditLog.findMany({
      where: { action: "device.activated" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        createdAt: true,
        organizationId: true,
        actorId: true,
        afterData: true,
      },
    }),
  ]);

  console.log("=== Hardware fleet status ===");
  console.log("Unactivated inventory:", unactivated);
  console.log("Active QRs (registered products):", active);
  console.log("Retired:", retired);
  console.log("");
  console.log("=== Audit log ===");
  console.log("Batches generated:", batches);
  console.log("Activations recorded:", activations);
  console.log("");
  console.log("=== Recent activations ===");
  if (recentActivations.length === 0) {
    console.log("(none yet)");
  } else {
    for (const r of recentActivations) {
      const data = r.afterData as {
        slug?: string;
        establishmentId?: string;
        redirectUrl?: string;
        redirectSource?: string;
      };
      console.log(`  ${r.createdAt.toISOString()}`);
      console.log(`    org=${r.organizationId} user=${r.actorId}`);
      console.log(`    slug=${data.slug} -> ${data.redirectUrl}`);
      console.log(`    source=${data.redirectSource}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
