/**
 * Reverse everything scripts/dev-session.mjs created: the temp tenant session,
 * any demo user/org/membership, and the temp admin user. Reads .pdf-build/_session.json.
 *
 * Run:  node scripts/dev-session-cleanup.mjs
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const S = JSON.parse(readFileSync(".pdf-build/_session.json", "utf8"));
  const c = S.cleanup || {};
  let n = 0;

  if (c.sessionToken) {
    const r = await prisma.session.deleteMany({ where: { sessionToken: c.sessionToken } });
    n += r.count; console.log(`deleted ${r.count} session(s)`);
  }
  for (const uid of c.userIds || []) {
    try { await prisma.user.delete({ where: { id: uid } }); n++; console.log(`deleted demo user ${uid}`); }
    catch (e) { console.warn(`user ${uid}: ${e.message}`); }
  }
  for (const oid of c.orgIds || []) {
    try {
      await prisma.membership.deleteMany({ where: { organizationId: oid } });
      await prisma.organization.delete({ where: { id: oid } }); n++; console.log(`deleted demo org ${oid}`);
    } catch (e) { console.warn(`org ${oid}: ${e.message}`); }
  }
  for (const aid of c.adminIds || []) {
    try { await prisma.adminUser.delete({ where: { id: aid } }); n++; console.log(`deleted temp admin ${aid}`); }
    catch (e) { console.warn(`admin ${aid}: ${e.message}`); }
  }
  console.log(`✔ cleanup done (${n} records removed)`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
