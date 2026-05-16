"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

const Schema = z.object({
  id: z.string().uuid().optional(),
  establishmentId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  position: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.coerce.boolean().default(true),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return { orgId };
}

export async function upsertFaq(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = Schema.safeParse({
    id: (form.get("id") as string) || undefined,
    establishmentId: (form.get("establishmentId") as string) || undefined,
    title: form.get("title"),
    description: form.get("description"),
    position: form.get("position") ?? 0,
    isActive: form.get("isActive") !== "off",
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const d = parsed.data;

  await withTenant(orgId, async (tx) => {
    if (d.id) {
      await tx.faq.update({
        where: { id: d.id },
        data: {
          title: d.title,
          description: d.description,
          position: d.position,
          isActive: d.isActive,
          establishmentId: d.establishmentId ?? null,
        },
      });
    } else {
      await tx.faq.create({
        data: {
          organizationId: orgId,
          establishmentId: d.establishmentId ?? null,
          title: d.title,
          description: d.description,
          position: d.position,
          isActive: d.isActive,
        },
      });
    }
  });

  revalidatePath("/faqs");
  revalidatePath("/ai");
}

export async function deleteFaq(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    await tx.faq.delete({ where: { id } });
  });
  revalidatePath("/faqs");
  revalidatePath("/ai");
}
