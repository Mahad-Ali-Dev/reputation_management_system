/**
 * Rebuild devices that were permanently deleted, from their audit tombstones.
 *
 * `permanentlyDeleteDevice` destroys the `devices` row. For a virtual QR that's
 * fine, but for a PHYSICAL stand it bricks the product: /r/{slug} can no longer
 * find the slug, so the printed QR 302s to /not-activated forever and there is
 * no row left to activate. That is exactly why the purge writes its tombstone
 * BEFORE deleting — `audit_log.beforeData` still holds the slug, serial and SKU,
 * which is everything needed to mint the row again.
 *
 * The rebuilt device comes back as UNACTIVATED inventory (organization_id NULL),
 * not restored to its old owner — same state it shipped in. Scan the plaque and
 * activate it normally.
 *
 * The activation code hash is set from HARDWARE_OVERRIDE_ACTIVATION_CODE (the
 * mis-printed batch code, default 84219), because that is what is physically
 * printed on these cards and the original per-unit hash died with the row.
 *
 * Usage — list what can be rebuilt:
 *   pnpm tsx scripts/device-restore-purged.ts
 *
 * Rebuild one, or all:
 *   pnpm tsx scripts/device-restore-purged.ts --slug KVF2YF9KGJ
 *   pnpm tsx scripts/device-restore-purged.ts --all
 *
 * On the VPS:
 *   sudo -u repulabs HOME=/opt/repulabs bash -c '
 *     cd /opt/repulabs && set -a && . .env.production && set +a &&
 *     pnpm tsx scripts/device-restore-purged.ts --all
 *   '
 */

import { prisma } from "@/lib/db/client";
import { hashActivationCode, signSlug } from "@/lib/hardware/codes";

type Tombstone = {
  shortSlug: string;
  serial: string;
  productSku: string;
  redirectUrl: string | null;
  organizationId: string;
  purgedAt: Date;
};

const PRINTED_CODE = (process.env.HARDWARE_OVERRIDE_ACTIVATION_CODE ?? "84219")
  .replace(/[-\s]/g, "")
  .toUpperCase();

async function collectTombstones(): Promise<Tombstone[]> {
  const rows = await prisma.auditLog.findMany({
    where: { action: "device.purged" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, organizationId: true, beforeData: true },
  });

  const out: Tombstone[] = [];
  for (const r of rows) {
    const b = r.beforeData as Record<string, unknown> | null;
    if (!b || typeof b.shortSlug !== "string" || typeof b.serial !== "string") continue;
    out.push({
      shortSlug: b.shortSlug,
      serial: b.serial,
      productSku: typeof b.productSku === "string" ? b.productSku : "RB-STAND",
      redirectUrl: typeof b.redirectUrl === "string" ? b.redirectUrl : null,
      organizationId: r.organizationId ?? "",
      purgedAt: r.createdAt,
    });
  }
  return out;
}

async function rebuild(t: Tombstone): Promise<"rebuilt" | "exists"> {
  // Slug and serial are both UNIQUE — if either is back, don't duplicate.
  const existing = await prisma.device.findFirst({
    where: { OR: [{ shortSlug: t.shortSlug }, { serial: t.serial }] },
    select: { id: true },
  });
  if (existing) return "exists";

  // Same placeholder signature provisioning uses; the real one is computed at
  // activation once a redirect URL exists.
  const placeholderRedirect = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com"}/not-activated`;
  const expiresAtUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 5;

  await prisma.device.create({
    data: {
      organizationId: null,
      establishmentId: null,
      productSku: t.productSku,
      serial: t.serial,
      shortSlug: t.shortSlug,
      slugSignature: signSlug(t.shortSlug, placeholderRedirect, expiresAtUnix),
      activationCodeHash: hashActivationCode(PRINTED_CODE),
      status: "unactivated",
    },
  });
  return "rebuilt";
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const slugArg = args.includes("--slug")
    ? (args[args.indexOf("--slug") + 1] ?? "").toUpperCase()
    : null;

  const tombstones = await collectTombstones();
  if (tombstones.length === 0) {
    console.log("No device.purged audit entries — nothing to rebuild.");
    await prisma.$disconnect();
    return;
  }

  if (!all && !slugArg) {
    console.log(`${tombstones.length} permanently-deleted device(s) can be rebuilt:\n`);
    for (const t of tombstones) {
      const live = await prisma.device.findUnique({
        where: { shortSlug: t.shortSlug },
        select: { status: true },
      });
      console.log(
        `  ${t.shortSlug}  ${t.productSku.padEnd(16)} purged ${t.purgedAt.toISOString()}`,
      );
      console.log(
        `     serial ${t.serial}${live ? `  [already back, status=${live.status}]` : ""}`,
      );
    }
    console.log("\nRebuild with:  --all      (every one above)");
    console.log("               --slug X   (just that one)");
    console.log("\nThey come back as UNACTIVATED inventory — scan the plaque and");
    console.log(`activate with the printed code (${PRINTED_CODE}).`);
    await prisma.$disconnect();
    return;
  }

  const targets = all ? tombstones : tombstones.filter((t) => t.shortSlug === slugArg);
  if (targets.length === 0) {
    console.error(`No purge record for slug ${slugArg}.`);
    process.exit(1);
  }

  let rebuilt = 0;
  let skipped = 0;
  // Newest tombstone per slug wins; a slug purged twice would otherwise be
  // attempted twice and the second pass would report a confusing "exists".
  const seen = new Set<string>();
  for (const t of targets) {
    if (seen.has(t.shortSlug)) continue;
    seen.add(t.shortSlug);
    const result = await rebuild(t);
    if (result === "rebuilt") {
      rebuilt++;
      console.log(`rebuilt  ${t.shortSlug}  (${t.productSku})`);
    } else {
      skipped++;
      console.log(`skipped  ${t.shortSlug}  — a device with that slug/serial already exists`);
    }
  }

  console.log(`\n${rebuilt} rebuilt, ${skipped} skipped.`);
  if (rebuilt > 0) {
    console.log("Scan the plaque, then enter the printed code to re-activate.");
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
