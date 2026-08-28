import { decryptTotpSecret, findBackupCodeIndex, verifyTotpCode } from "@/lib/auth/totp";
import { prisma } from "@/lib/db/client";

export type TotpVerifyResult =
  | { ok: true; consumedBackupCodeIndex: number | null; newLastUsedStep: number | null }
  | { ok: false };

/**
 * Verify a submitted code against `userId`'s TOTP secret (with replay-window
 * protection via `totpLastUsedStep`), falling back to their single-use backup
 * codes. Shared by the settings-page 2FA actions and the post-login
 * `/login/2fa` check so both enforce identical replay/backup-code semantics.
 *
 * Read-only — callers decide what to persist on success (mark the session
 * verified, bump the watermark, splice out a consumed backup code, etc.).
 */
export async function verifyUserTotpOrBackupCode(
  userId: string,
  code: string,
): Promise<TotpVerifyResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpBackupCodes: true, totpLastUsedStep: true },
  });
  if (!user?.totpSecret) return { ok: false };

  const secret = decryptTotpSecret(user.totpSecret, userId);
  const step = verifyTotpCode(secret, code, { notBefore: user.totpLastUsedStep });
  if (step != null) {
    return { ok: true, consumedBackupCodeIndex: null, newLastUsedStep: step };
  }

  const idx = findBackupCodeIndex(user.totpBackupCodes, code);
  if (idx !== -1) {
    return { ok: true, consumedBackupCodeIndex: idx, newLastUsedStep: null };
  }
  return { ok: false };
}
