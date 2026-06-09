/**
 * Dev-only: mint a tenant session + admin session for headless screenshotting.
 * Bypasses RLS via DIRECT_URL (owner role). Writes .pdf-build/_session.json.
 *
 * Run:  node scripts/dev-session.mjs
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("No DIRECT_URL/DATABASE_URL in env");
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) throw new Error("No AUTH_SECRET in env (needed for admin JWT)");

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function firstId(model, where, sel = { id: true }) {
  try {
    const r = await prisma[model].findFirst({ where, select: sel });
    if (r) return r;
  } catch {}
  try {
    const r = await prisma[model].findFirst({ select: sel });
    if (r) return r;
  } catch {}
  return null;
}

async function main() {
  // 1) pick the data-richest org
  const orgs = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: {
      id: true, name: true, slug: true, plan: true,
      _count: { select: { establishments: true, memberships: true } },
    },
  });
  let org = orgs.sort((a, b) => b._count.establishments - a._count.establishments)[0];

  // Prefer the seeded demo org if present (written by dev-seed-demo.mjs)
  try {
    const demoId = readFileSync(".pdf-build/_demo_org.txt", "utf8").trim();
    const demo = orgs.find((o) => o.id === demoId);
    if (demo) org = demo;
  } catch {}

  // track what we create so cleanup can reverse it
  const created = { userIds: [], orgIds: [], adminIds: [] };

  let userId;
  if (!org) {
    const user = await prisma.user.create({
      data: { email: "demo@repulabs.dev", name: "Demo Owner", emailVerified: new Date() },
    });
    created.userIds.push(user.id);
    org = await prisma.organization.create({
      data: {
        name: "Demo Business", slug: "demo-" + randomBytes(3).toString("hex"), plan: "pro",
        memberships: { create: { userId: user.id, role: "owner" } },
      },
      select: { id: true, name: true, slug: true, plan: true },
    });
    created.orgIds.push(org.id);
    userId = user.id;
  } else {
    let m = await prisma.membership.findFirst({
      where: { organizationId: org.id }, orderBy: { createdAt: "asc" }, select: { userId: true },
    });
    if (!m) {
      const user = await prisma.user.create({
        data: { email: `demo+${org.slug}@repulabs.dev`, name: "Demo Owner", emailVerified: new Date() },
      });
      created.userIds.push(user.id);
      m = await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "owner" }, select: { userId: true },
      });
    }
    userId = m.userId;
  }

  // 2) tenant session row + token
  const tenantToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { sessionToken: tenantToken, userId, expires: new Date(Date.now() + 30 * 864e5) },
  });

  // 3) admin user + signed JWT
  let admin = await prisma.adminUser.findFirst({ where: { isActive: true } });
  if (!admin) {
    admin = await prisma.adminUser.create({
      data: { email: "admin@repulabs.dev", passwordHash: "screenshot-only", totpSecret: "PENDING", role: "super_admin", isActive: true },
    });
    created.adminIds.push(admin.id);
  }
  const adminToken = await new SignJWT({ adminId: admin.id, email: admin.email, role: admin.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(new TextEncoder().encode(AUTH_SECRET));

  // 4) resolve dynamic-route sample ids (scoped to org where possible)
  const oid = { organizationId: org.id };
  const dynamic = {};
  const est = await firstId("establishment", oid);
  if (est) {
    dynamic["/establishments/[id]"] = `/establishments/${est.id}`;
    dynamic["/establishments/[id]/analytics"] = `/establishments/${est.id}/analytics`;
  }
  const rev = await firstId("review", oid);
  if (rev) dynamic["/reviews/[id]"] = `/reviews/${rev.id}`;
  const arr = await firstId("autoReplyRule", oid);
  if (arr) dynamic["/reviews/auto-reply/[id]"] = `/reviews/auto-reply/${arr.id}`;
  const dev = await firstId("device", oid, { id: true, shortSlug: true });
  if (dev) {
    dynamic["/hardware/edit/[deviceId]"] = `/hardware/edit/${dev.id}`;
    if (dev.shortSlug) {
      dynamic["/r/pick/[slug]"] = `/r/pick/${dev.shortSlug}`;
      dynamic["/r/welcome/[slug]"] = `/r/welcome/${dev.shortSlug}`;
    }
  }
  const ho = await firstId("hardwareOrder", oid);
  if (ho) {
    dynamic["/hardware/orders/[id]"] = `/hardware/orders/${ho.id}`;
    dynamic["/admin/refunds/[orderId]"] = `/admin/refunds/${ho.id}`;
  }
  const pc = await firstId("phoneCall", oid);
  if (pc) dynamic["/phone/calls/[id]"] = `/phone/calls/${pc.id}`;
  const sc = await firstId("surveyCampaign", oid);
  if (sc) dynamic["/surveys/[id]"] = `/surveys/${sc.id}`;
  const tok = await firstId("surveyResponseToken", oid, { token: true });
  if (tok?.token) dynamic["/s/[token]"] = `/s/${tok.token}`;
  dynamic["/admin/tenants/[id]"] = `/admin/tenants/${org.id}`;
  dynamic["/admin/providers/[provider]"] = `/admin/providers/google`;

  const out = {
    baseUrl: "http://localhost:3000",
    orgId: org.id, orgName: org.name, orgPlan: org.plan,
    hasData: { establishment: !!est, review: !!rev, device: !!dev, survey: !!sc },
    tenantToken, adminToken, dynamic,
    cleanup: { ...created, sessionToken: tenantToken },
  };
  writeFileSync(".pdf-build/_session.json", JSON.stringify(out, null, 2));
  console.log(`ORG: ${org.name} (${org.id}) plan=${org.plan}`);
  console.log(`DATA: establishment=${!!est} review=${!!rev} device=${!!dev} survey=${!!sc}`);
  console.log(`DYNAMIC routes resolved: ${Object.keys(dynamic).length}`);
  console.log("✔ wrote .pdf-build/_session.json");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
