"use server";

import { SESSION_COOKIE_NAME, auth } from "@/lib/auth/config";
import { verifyUserTotpOrBackupCode } from "@/lib/auth/totp-verify";
import { prisma } from "@/lib/db/client";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/ratelimit";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Only allow same-site relative paths — no open redirect via callbackUrl. */
function safeCallback(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

/**
 * Verify the TOTP/backup code for the post-login 2FA step
 * (lib/auth/active-org.ts redirects any signed-in-but-unverified session to
 * /login/2fa once the user has 2FA enabled). On success, marks THIS session
 * verified so `resolveSessionOrg()` stops redirecting here.
 */
export async function verifyLoginTotp(form: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!session?.user || !userId) redirect("/login");

  const callbackUrl = safeCallback(form.get("callbackUrl") as string | null);
  const code = String(form.get("code") ?? "").trim();

  const rl = await checkRateLimit("totp_verify", `user:${userId}`);
  if (!rl.success) {
    redirect(`/login/2fa?error=rate_limited&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const result = await verifyUserTotpOrBackupCode(userId, code);
  if (!result.ok) {
    logger.warn({ userId, event: "totp.login.invalid_code" });
    redirect(`/login/2fa?error=invalid_code&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  if (result.consumedBackupCodeIndex != null) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpBackupCodes: true },
    });
    const codes = [...(user?.totpBackupCodes ?? [])];
    codes.splice(result.consumedBackupCodeIndex, 1);
    await prisma.user.update({ where: { id: userId }, data: { totpBackupCodes: codes } });
  } else if (result.newLastUsedStep != null) {
    await prisma.user.update({
      where: { id: userId },
      data: { totpLastUsedStep: result.newLastUsedStep },
    });
  }

  const jar = await cookies();
  const sessionToken = jar.get(SESSION_COOKIE_NAME)?.value;
  if (sessionToken) {
    await prisma.session.updateMany({ where: { sessionToken }, data: { twoFactorVerified: true } });
  }

  logger.info({ userId, event: "totp.login.verified" });
  redirect(callbackUrl);
}
