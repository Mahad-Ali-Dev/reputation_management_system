"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

async function requireSession() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

const CreateSchema = z.object({
  type: z.string().min(1).max(40),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  resourceType: z.string().max(40).optional(),
  resourceId: z.string().uuid().optional(),
  href: z.string().max(500).optional(),
  userId: z.string().uuid().optional(),
});

/**
 * System-side notification creator. Tenant-scoped. Use this from any worker
 * (review-sync, comment-monitor, AI safety classifier, etc.) when something
 * happens the user should see in the bell.
 */
export async function createNotification(
  orgId: string,
  payload: z.infer<typeof CreateSchema>,
): Promise<void> {
  const parsed = CreateSchema.parse(payload);
  await withTenant(orgId, async (tx) => {
    await tx.notification.create({
      data: {
        organizationId: orgId,
        userId: parsed.userId ?? null,
        type: parsed.type,
        title: parsed.title,
        body: parsed.body ?? null,
        resourceType: parsed.resourceType ?? null,
        resourceId: parsed.resourceId ?? null,
        href: parsed.href ?? null,
      },
    });
  });
}

export async function markNotificationRead(formData: FormData): Promise<void> {
  const { orgId, userId } = await requireSession();
  const id = z.string().uuid().parse(formData.get("id"));
  await withTenant(orgId, async (tx) => {
    // Per-user filter: only the addressee (or anyone, if userId is null = org-wide
    // broadcast) may mark a notification read. Without this, any member of the
    // org could clear another member's bell.
    await tx.notification.updateMany({
      where: {
        id,
        readAt: null,
        OR: [{ userId }, { userId: null }],
      },
      data: { readAt: new Date() },
    });
  });
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead(): Promise<void> {
  const { orgId, userId } = await requireSession();
  await withTenant(orgId, async (tx) => {
    await tx.notification.updateMany({
      where: {
        readAt: null,
        OR: [{ userId }, { userId: null }],
      },
      data: { readAt: new Date() },
    });
  });
  revalidatePath("/dashboard");
}
