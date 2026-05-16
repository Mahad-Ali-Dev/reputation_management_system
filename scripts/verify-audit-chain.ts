/**
 * Verify the integrity of the audit_log hash chain.
 *
 * Each audit_log row stores:
 *   - prev_hash: the row_hash of the previous row in the same org scope
 *   - row_hash:  sha256(hex(prev_hash) || canonical(this_row))
 *
 * If any row is modified post-insert (which would already require disabling the
 * forbid-UPDATE trigger), the row_hash of THAT row recomputes differently. And
 * because prev_hash → row_hash chains forward, every subsequent row in the same
 * org scope is also broken.
 *
 * Usage:
 *   npx tsx scripts/verify-audit-chain.ts                      # verify all orgs + global
 *   npx tsx scripts/verify-audit-chain.ts --org <uuid>         # only that org
 *   npx tsx scripts/verify-audit-chain.ts --since 2026-05-01   # rows on/after a date
 *
 * Exit codes:
 *   0 = all chains valid
 *   1 = chain integrity failure
 *   2 = usage error
 */

import { createHash } from "node:crypto";
import dotenv from "dotenv";
dotenv.config({ path: ".env", override: true });

import { prisma } from "../lib/db/client";

type Row = {
  id: string;
  organizationId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  beforeData: unknown;
  afterData: unknown;
  ip: string | null;
  userAgent: string | null;
  prevHash: Buffer | null;
  rowHash: Buffer | null;
  createdAt: Date;
};

function canonicalRow(r: Row): string {
  return [
    r.id,
    r.organizationId ?? "",
    r.actorType,
    r.actorId,
    r.action,
    r.resourceType ?? "",
    r.resourceId ?? "",
    r.beforeData ? JSON.stringify(r.beforeData) : "",
    r.afterData ? JSON.stringify(r.afterData) : "",
    r.ip ?? "",
    r.userAgent ?? "",
    r.createdAt.toISOString().replace("T", " ").replace("Z", "+00"),
  ].join("|");
}

function expectedHash(r: Row): Buffer {
  const prevHex = r.prevHash ? r.prevHash.toString("hex") : "";
  return createHash("sha256").update(prevHex + canonicalRow(r)).digest();
}

async function verifyScope(args: { orgId: string | null; since?: Date }): Promise<{
  total: number;
  broken: { id: string; reason: string }[];
}> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
        id::text, organization_id::text AS "organizationId",
        actor_type AS "actorType", actor_id::text AS "actorId",
        action, resource_type AS "resourceType", resource_id::text AS "resourceId",
        before_data AS "beforeData", after_data AS "afterData",
        ip::text, user_agent AS "userAgent",
        prev_hash AS "prevHash", row_hash AS "rowHash",
        created_at AS "createdAt"
     FROM audit_log
     WHERE ${args.orgId === null ? "organization_id IS NULL" : "organization_id = $1::uuid"}
       ${args.since ? `AND created_at >= '${args.since.toISOString()}'::timestamp` : ""}
     ORDER BY created_at ASC, id ASC`,
    ...(args.orgId ? [args.orgId] : []),
  );

  const broken: { id: string; reason: string }[] = [];
  let lastHash: Buffer | null = null;

  for (const r of rows) {
    // Convert SQL timestamp string back to a Date if it came as a string
    if (typeof r.createdAt === "string") r.createdAt = new Date(r.createdAt);

    // Verify prev_hash matches the previous row's row_hash
    if (lastHash === null && r.prevHash !== null) {
      // Could be valid if we started in the middle of a chain (--since flag).
      // Only error if --since was not used.
      if (!args.since) {
        broken.push({ id: r.id, reason: `expected prev_hash NULL (first row); got ${r.prevHash.toString("hex").slice(0, 16)}` });
      }
    } else if (lastHash !== null) {
      if (!r.prevHash || !lastHash.equals(r.prevHash)) {
        broken.push({
          id: r.id,
          reason: `prev_hash mismatch: expected ${lastHash.toString("hex").slice(0, 16)}, got ${r.prevHash?.toString("hex").slice(0, 16) ?? "NULL"}`,
        });
      }
    }

    // Verify row_hash matches what we'd compute
    const expected = expectedHash(r);
    if (!r.rowHash || !expected.equals(r.rowHash)) {
      broken.push({
        id: r.id,
        reason: `row_hash mismatch: expected ${expected.toString("hex").slice(0, 16)}, got ${r.rowHash?.toString("hex").slice(0, 16) ?? "NULL"}`,
      });
    }

    lastHash = r.rowHash;
  }

  return { total: rows.length, broken };
}

async function main() {
  const args = process.argv.slice(2);
  let orgId: string | null | undefined = undefined; // undefined = "all scopes"
  let since: Date | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--org") {
      orgId = args[i + 1] ?? "";
      i++;
    } else if (args[i] === "--since") {
      since = new Date(args[i + 1] ?? "");
      i++;
    }
  }

  let totalRows = 0;
  let totalBroken = 0;

  if (orgId === undefined) {
    // Run for every distinct org + the global scope
    const scopes = await prisma.$queryRaw<{ organizationId: string | null }[]>`
      SELECT DISTINCT organization_id AS "organizationId" FROM audit_log
    `;
    for (const s of scopes) {
      const r = await verifyScope({ orgId: s.organizationId, since });
      totalRows += r.total;
      totalBroken += r.broken.length;
      const label = s.organizationId ?? "GLOBAL";
      if (r.broken.length === 0) {
        console.log(`✓ ${label.toString().slice(0, 8)}  ${r.total} rows OK`);
      } else {
        console.log(`✗ ${label.toString().slice(0, 8)}  ${r.broken.length}/${r.total} broken`);
        for (const b of r.broken.slice(0, 5)) {
          console.log(`    ${b.id.slice(0, 8)}  ${b.reason}`);
        }
      }
    }
  } else {
    const r = await verifyScope({ orgId, since });
    totalRows = r.total;
    totalBroken = r.broken.length;
    if (r.broken.length === 0) {
      console.log(`✓ ${r.total} rows OK`);
    } else {
      console.log(`✗ ${r.broken.length}/${r.total} broken`);
      for (const b of r.broken) {
        console.log(`    ${b.id.slice(0, 8)}  ${b.reason}`);
      }
    }
  }

  console.log("");
  console.log(`Total: ${totalRows} rows, ${totalBroken} broken`);
  await prisma.$disconnect();
  process.exit(totalBroken === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
