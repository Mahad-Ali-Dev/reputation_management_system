"use server";

import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * ROI settings server action (Module 15).
 *
 * Per-establishment revenue assumptions for the estimator. A content/settings
 * write → `requireRole("manager")` (owner/admin/manager). zod-validated, audited,
 * tenant-scoped upsert keyed on (organizationId, establishmentId).
 */

const Schema = z.object({
  establishmentId: z.string().uuid(),
  averageJobValue: z.coerce.number().min(0).max(1_000_000).optional(),
  bookingToJobRate: z.coerce.number().min(0).max(1).optional(),
  reviewToCallRate: z.coerce.number().min(0).max(1).optional(),
  currency: z.string().min(1).max(8).optional(),
});

export async function saveRoiSettings(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  const avgRaw = form.get("averageJobValue");
  const bookRaw = form.get("bookingToJobRate");
  const reviewRaw = form.get("reviewToCallRate");

  const parsed = Schema.safeParse({
    establishmentId: form.get("establishmentId"),
    averageJobValue: avgRaw === "" || avgRaw == null ? undefined : avgRaw,
    bookingToJobRate: bookRaw === "" || bookRaw == null ? undefined : bookRaw,
    reviewToCallRate: reviewRaw === "" || reviewRaw == null ? undefined : reviewRaw,
    currency: (form.get("currency") as string) || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const data = parsed.data;

  await withTenant(orgId, async (tx) => {
    // Confirm the establishment belongs to this org (RLS already scopes, but a
    // bad id would otherwise FK-fail with a less helpful error).
    const estab = await tx.establishment.findFirst({
      where: { id: data.establishmentId },
      select: { id: true },
    });
    if (!estab) throw new Error("Establishment not found");

    await tx.roiSettings.upsert({
      where: {
        organizationId_establishmentId: {
          organizationId: orgId,
          establishmentId: data.establishmentId,
        },
      },
      create: {
        organizationId: orgId,
        establishmentId: data.establishmentId,
        averageJobValue: data.averageJobValue ?? null,
        bookingToJobRate: data.bookingToJobRate ?? 0.6,
        reviewToCallRate: data.reviewToCallRate ?? null,
        currency: data.currency ?? "USD",
      },
      update: {
        averageJobValue: data.averageJobValue ?? null,
        ...(data.bookingToJobRate !== undefined ? { bookingToJobRate: data.bookingToJobRate } : {}),
        reviewToCallRate: data.reviewToCallRate ?? null,
        ...(data.currency ? { currency: data.currency } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "roi.settings.updated",
        resourceType: "roi_settings",
        resourceId: data.establishmentId,
        afterData: {
          averageJobValue: data.averageJobValue ?? null,
          bookingToJobRate: data.bookingToJobRate ?? null,
          currency: data.currency ?? "USD",
        },
      },
    });
  });

  logger.info(
    { orgId, establishmentId: data.establishmentId, event: "roi.settings.saved" },
    "ROI settings saved",
  );
  revalidatePath("/autopilot");
}
