"use server";

import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

/**
 * NFC chip-UID recording — co-located server action for the My Devices NFC
 * config card (`nfc-config-card.tsx`).
 *
 * Why it lives here, not in lib/hardware/actions.ts: this wave owns
 * `app/hardware/_components/*` only; the shared actions file is owned by
 * another coder. Co-locating the action keeps the change inside our file set
 * while still being a proper `"use server"` module the client island can call.
 *
 * What it does: lets the operator record the physical chip's UID (the
 * read-only serial every NFC tag exposes) against an NFC-kind device, purely
 * for inventory / "which tag is this" bookkeeping. The UID is NOT a secret and
 * is NOT used in the scan path (scans resolve by `shortSlug` through
 * `/r/[slug]`), so recording or clearing it never affects routing.
 *
 * Security / correctness:
 *   - Tenant-scoped via `withTenant` (RLS) — an org can only touch its own rows.
 *   - `Device.nfcUid` is `@unique`; a collision (same UID already recorded on
 *     another device) surfaces as a friendly redirect param, never a 500.
 *   - Fail-soft on Postgres 42P01 (relation missing) / 42703 (column missing)
 *     so a not-yet-migrated environment degrades gracefully.
 */

// NFC UID: hex bytes, typically 7 (ISO 14443A) or 4/10, optionally separated by
// ':' or '-'. We accept 4-10 bytes, case-insensitive, and normalize to upper
// hex with ':' separators before persisting.
const NfcUidSchema = z.object({
  deviceId: z.string().uuid(),
  nfcUid: z
    .string()
    .trim()
    .max(64)
    // empty string is allowed → clears the recorded UID
    .refine((v) => v === "" || /^[0-9a-fA-F]{2}([:\- ]?[0-9a-fA-F]{2}){3,9}$/.test(v), {
      message: "invalid_uid",
    }),
});

function normalizeUid(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (cleaned.length === 0) return null;
  // group into bytes separated by ':'
  return cleaned.match(/.{1,2}/g)?.join(":") ?? null;
}

function pgCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    return String((err as { code?: unknown }).code);
  }
  return undefined;
}

export async function recordNfcUid(form: FormData): Promise<void> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");

  const parsed = NfcUidSchema.safeParse({
    deviceId: form.get("deviceId"),
    nfcUid: (form.get("nfcUid") as string | null) ?? "",
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "invalid";
    redirect(
      `/hardware?selected=${encodeURIComponent(String(form.get("deviceId") ?? ""))}&nfc=${
        first === "invalid_uid" ? "bad_uid" : "error"
      }#qr-panel`,
    );
  }
  const { deviceId } = parsed.data;
  const normalized = normalizeUid(parsed.data.nfcUid);

  try {
    const outcome = await withTenant(orgId, async (tx) => {
      const device = await tx.device.findFirst({
        where: { id: deviceId },
        select: { id: true, shortSlug: true, nfcUid: true },
      });
      if (!device) return { ok: false as const, reason: "not_found" as const };

      // No-op if unchanged — avoids a redundant write + audit row.
      if ((device.nfcUid ?? null) === normalized) {
        return { ok: true as const, slug: device.shortSlug, changed: false };
      }

      await tx.device.update({
        where: { id: deviceId },
        data: { nfcUid: normalized },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: normalized ? "device.nfc_uid_recorded" : "device.nfc_uid_cleared",
          resourceType: "device",
          resourceId: deviceId,
          beforeData: { nfcUid: device.nfcUid ?? null },
          // Do NOT log the literal UID value in the structured logger below; it
          // is fine in the audit row (tenant-scoped, intended for the owner).
          afterData: { nfcUid: normalized },
        },
      });
      return { ok: true as const, slug: device.shortSlug, changed: true };
    });

    if (!outcome.ok) {
      redirect(`/hardware?selected=${deviceId}&nfc=not_found#qr-panel`);
    }

    logger.info(
      { event: "device.nfc_uid_recorded", orgId, deviceId, cleared: normalized === null },
      "device nfc uid recorded",
    );
    revalidatePath("/hardware");
    redirect(`/hardware?selected=${deviceId}&nfc=saved#qr-panel`);
  } catch (err) {
    // Re-throw Next's control-flow signals (redirect/notFound) untouched.
    if (err && typeof err === "object" && "digest" in err) {
      const digest = String((err as { digest?: unknown }).digest ?? "");
      if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")) throw err;
    }
    const code = pgCode(err);
    // Unique-constraint violation on nfc_uid → another device already has it.
    // P2002 = Prisma's wrapped unique violation; 23505 = raw Postgres code.
    if (code === "P2002" || code === "23505") {
      redirect(`/hardware?selected=${deviceId}&nfc=duplicate#qr-panel`);
    }
    // Not-yet-migrated env (relation/column absent) → fail soft, don't 500.
    // P2021/P2022 = Prisma table/column-not-found; 42P01/42703 = raw Postgres.
    if (code === "42P01" || code === "42703" || code === "P2021" || code === "P2022") {
      logger.warn(
        { event: "device.nfc_uid_unavailable", orgId, deviceId, code },
        "nfc uid column/table unavailable — skipping",
      );
      redirect(`/hardware?selected=${deviceId}&nfc=unavailable#qr-panel`);
    }
    logger.error(
      { event: "device.nfc_uid_error", orgId, deviceId, err: String(err) },
      "failed to record nfc uid",
    );
    redirect(`/hardware?selected=${deviceId}&nfc=error#qr-panel`);
  }
}
