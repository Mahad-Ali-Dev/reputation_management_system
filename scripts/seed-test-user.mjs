/**
 * Seed a ready-to-use PRO test account and mint a login session.
 *
 *   node scripts/seed-test-user.mjs
 *
 * Creates / updates:
 *   - User   testuser1@gmail.com  (emailVerified, argon2 hash of the password)
 *   - Org    "Test Pro Workspace" plan=pro, onboarding dismissed (step 99)
 *   - Owner membership
 *   - A 30-day Session row  → log in by setting the session cookie (see output)
 *
 * Auth here is passwordless (magic-link/Google) + database sessions, so you log in
 * by planting the printed session cookie — no email needed. The password hash is
 * stored too, in case a credentials provider is wired up later.
 *
 * Run on the SAME machine/DB you want the account on (locally, or on the VPS).
 * Uses DIRECT_URL (owner role, bypasses RLS) like scripts/dev-session.mjs.
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const EMAIL = "testuser1@gmail.com";
const PASSWORD = "12345678";
const ORG_NAME = "Test Pro Workspace";
const ORG_SLUG = "testuser1-pro";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("No DIRECT_URL/DATABASE_URL in env");
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const passwordHash = await argon2.hash(PASSWORD);

  // 1) User (idempotent by unique email)
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { name: "Test User", emailVerified: new Date(), passwordHash },
    create: { email: EMAIL, name: "Test User", emailVerified: new Date(), passwordHash },
    select: { id: true },
  });

  // 2) Pro organization (idempotent by unique slug)
  const oneYear = new Date(Date.now() + 365 * 864e5);
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {
      plan: "pro",
      trialEndsAt: oneYear,
      onboardingStep: 99, // 99 = onboarding dismissed/done
      ownerName: "Test User",
      ownerEmail: EMAIL,
    },
    create: {
      name: ORG_NAME,
      slug: ORG_SLUG,
      plan: "pro",
      trialEndsAt: oneYear,
      onboardingStep: 99,
      ownerName: "Test User",
      ownerEmail: EMAIL,
    },
    select: { id: true, plan: true },
  });

  // 3) Owner membership (compound-unique org+user)
  const existing = await prisma.membership.findFirst({
    where: { organizationId: org.id, userId: user.id },
    select: { id: true },
  });
  if (!existing) {
    await prisma.membership.create({
      data: { organizationId: org.id, userId: user.id, role: "owner" },
    });
  }

  // 4) Fresh 30-day login session (clear old ones first)
  await prisma.session.deleteMany({ where: { userId: user.id } });
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires: new Date(Date.now() + 30 * 864e5) },
  });

  const line = "─".repeat(64);
  console.log(`\n${line}`);
  console.log("✅ PRO test account ready");
  console.log(line);
  console.log(`  email   : ${EMAIL}`);
  console.log(`  password: ${PASSWORD}   (stored as argon2 hash; not used by current login)`);
  console.log(`  org     : ${ORG_NAME}  plan=${org.plan}`);
  console.log(`  userId  : ${user.id}`);
  console.log(`\n  LOG IN — set this session cookie in your browser, then open /dashboard:\n`);
  console.log(`  Cookie value (session token):`);
  console.log(`    ${sessionToken}\n`);
  console.log(`  • Local (http://localhost:3000):`);
  console.log(`      cookie name:  authjs.session-token`);
  console.log(`  • Production (https://repulabs.com):`);
  console.log(`      cookie name:  __Secure-authjs.session-token   (Secure + HTTPS)`);
  console.log(`\n  How: DevTools → Application → Cookies → your site → add a cookie with the`);
  console.log(`  name above and the token value, Path = /, then visit /dashboard.`);
  console.log(`${line}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
