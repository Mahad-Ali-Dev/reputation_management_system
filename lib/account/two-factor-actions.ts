"use server";

import { NEW_2FA_BACKUP_CODES_COOKIE } from "@/lib/account/constants";
import { resolveSessionOrg } from "@/lib/auth/active-org";
import { SESSION_COOKIE_NAME } from "@/lib/auth/config";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCodes,
  verifyTotpCode,
} from "@/lib/auth/totp";
import { verifyUserTotpOrBackupCode } from "@/lib/auth/totp-verify";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Per-USER two-factor authentication (TOTP / Google Authenticator), managed
 * from /settings/security. This is an account-level protection, not an org
 * policy — any member may enable/disable 2FA on their own login regardless
 * of their role, so these actions gate on `resolveSessionOrg()` alone (which
 * itself requires being authenticated) rather than `requireRole()`.
 *
 * Enforcement at sign-in lives in lib/auth/active-org.ts (`resolveSessionOrg`)
 * — once `totpEnabled` is true, every tenant page redirects an unverified
 * session to /login/2fa before it resolves an org.
 */

function backupCodesCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/settings",
    maxAge: 300,
  };
}

async function requireUserId(): Promise<string> {
  const sessionOrg = await resolveSessionOrg();
  if (!sessionOrg) redirect("/login");
  return sessionOrg.userId;
}

/** Start (or restart) enrollment: generates a fresh secret, not yet enabled. */
export async function startTotpSetup(): Promise<void> {
  const userId = await requireUserId();
  const secret = generateTotpSecret();

  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: encryptTotpSecret(secret, userId),
      totpEnabled: false,
      totpBackupCodes: [],
      totpLastUsedStep: null,
    },
  });

  revalidatePath("/settings/security");
}

/** Abandon an in-progress (unconfirmed) enrollment — never touches a live one. */
export async function cancelTotpSetup(): Promise<void> {
  const userId = await requireUserId();

  await prisma.user.updateMany({
    where: { id: userId, totpEnabled: false },
    data: { totpSecret: null },
  });

  revalidatePath("/settings/security");
}

/** Confirm enrollment with a code from the authenticator app. */
export async function confirmTotpSetup(form: FormData): Promise<void> {
  const userId = await requireUserId();
  const code = String(form.get("code") ?? "").trim();

  const rl = await checkRateLimit("totp_verify", `user:${userId}`);
  if (!rl.success) redirect("/settings/security?totp_error=rate_limited");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user?.totpSecret || user.totpEnabled) {
    redirect("/settings/security?totp_error=no_setup");
  }

  const secret = decryptTotpSecret(user.totpSecret, userId);
  const step = verifyTotpCode(secret, code);
  if (step == null) {
    logger.warn({ userId, event: "totp.setup.invalid_code" });
    redirect("/settings/security?totp_error=invalid_code");
  }

  const backupCodes = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpEnabled: true,
      totpBackupCodes: hashBackupCodes(backupCodes),
      totpLastUsedStep: step,
    },
  });

  // The user just proved possession of the code THIS request — mark their
  // current session verified so they aren't immediately bounced to
  // /login/2fa on their very next click.
  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    await prisma.session.updateMany({
      where: { sessionToken },
      data: { twoFactorVerified: true },
    });
  }

  jar.set(NEW_2FA_BACKUP_CODES_COOKIE, backupCodes.join(","), backupCodesCookieOptions());
  logger.info({ userId, event: "totp.enabled" });

  revalidatePath("/settings", "layout");
  redirect("/settings/security?totp=enabled");
}

/** Disable 2FA — requires a current code or backup code to prove possession. */
export async function disableTotp(form: FormData): Promise<void> {
  const userId = await requireUserId();
  const code = String(form.get("code") ?? "").trim();

  const rl = await checkRateLimit("totp_verify", `user:${userId}`);
  if (!rl.success) redirect("/settings/security?totp_error=rate_limited");

  const result = await verifyUserTotpOrBackupCode(userId, code);
  if (!result.ok) {
    logger.warn({ userId, event: "totp.disable.invalid_code" });
    redirect("/settings/security?totp_error=invalid_code");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: [], totpLastUsedStep: null },
  });
  logger.info({ userId, event: "totp.disabled" });

  revalidatePath("/settings", "layout");
  redirect("/settings/security?totp=disabled");
}

/** Invalidate the old backup codes and mint a fresh batch (shown once). */
export async function regenerateBackupCodes(form: FormData): Promise<void> {
  const userId = await requireUserId();
  const code = String(form.get("code") ?? "").trim();

  const rl = await checkRateLimit("totp_verify", `user:${userId}`);
  if (!rl.success) redirect("/settings/security?totp_error=rate_limited");

  const result = await verifyUserTotpOrBackupCode(userId, code);
  if (!result.ok) {
    logger.warn({ userId, event: "totp.backup_codes.invalid_code" });
    redirect("/settings/security?totp_error=invalid_code");
  }

  const backupCodes = generateBackupCodes();
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpBackupCodes: hashBackupCodes(backupCodes),
      ...(result.newLastUsedStep != null ? { totpLastUsedStep: result.newLastUsedStep } : {}),
    },
  });

  const jar = await cookies();
  jar.set(NEW_2FA_BACKUP_CODES_COOKIE, backupCodes.join(","), backupCodesCookieOptions());
  logger.info({ userId, event: "totp.backup_codes.regenerated" });

  revalidatePath("/settings/security");
  redirect("/settings/security?totp=codes_regenerated");
}
