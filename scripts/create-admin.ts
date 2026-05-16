/**
 * Create an admin user.
 *
 * Usage:
 *   npm run admin:create -- you@example.com super_admin
 *
 * Will prompt for a password (won't echo). argon2id hash stored in admin_users.password_hash.
 *
 * Roles: super_admin | support | finance | engineering
 */
import * as dotenv from "dotenv";
dotenv.config({ override: true });
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

const prisma = new PrismaClient();

const VALID_ROLES = ["super_admin", "support", "finance", "engineering"] as const;
type AdminRole = (typeof VALID_ROLES)[number];

async function promptPassword(label: string): Promise<string> {
  const mutableStdout = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: mutableStdout, terminal: true });
  return new Promise((resolve) => {
    process.stdout.write(`${label}: `);
    rl.question("", (answer) => {
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const email = process.argv[2];
  const roleArg = (process.argv[3] ?? "super_admin") as AdminRole;

  if (!email || !email.includes("@")) {
    console.error("Usage: npm run admin:create -- <email> [role]");
    console.error("Roles: super_admin | support | finance | engineering");
    process.exit(1);
  }
  if (!VALID_ROLES.includes(roleArg)) {
    console.error(`Invalid role: ${roleArg}. Must be one of ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.error(`Admin already exists: ${email} (role=${existing.role}, active=${existing.isActive})`);
    process.exit(1);
  }

  const password = await promptPassword("Password (min 12 chars)");
  if (password.length < 12) {
    console.error("Password must be at least 12 characters");
    process.exit(1);
  }
  const confirm = await promptPassword("Confirm password");
  if (password !== confirm) {
    console.error("Passwords do not match");
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MiB
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      // TOTP deferred to v1.5 — Day 5 ships email+password only. Schema column is NOT NULL,
      // so we store a placeholder; admins enrolling TOTP later will overwrite it.
      totpSecret: "PENDING_ENROLLMENT",
      role: roleArg,
      isActive: true,
    },
  });

  console.log(`\n✓ Admin user created: ${admin.email} (role=${admin.role}, id=${admin.id})\n`);
  console.log(`  Login at http://localhost:3000/admin/login\n`);
}

main()
  .catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
