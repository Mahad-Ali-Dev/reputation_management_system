"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

const TemplateSchema = z.object({
  id: z.string().uuid().optional(),
  channel: z.enum(["email", "sms"]),
  name: z.string().min(1).max(120),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
  bodyHtml: z.string().max(20000).optional(),
  logoUrl: z.string().url().max(500).or(z.literal("")).optional(),
  backgroundColor: z.string().max(20).optional(),
  isDefault: z.coerce.boolean().optional(),
  establishmentId: z.string().uuid().optional(),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

export async function upsertOutreachTemplate(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const parsed = TemplateSchema.safeParse({
    id: (form.get("id") as string) || undefined,
    channel: form.get("channel"),
    name: form.get("name"),
    subject: (form.get("subject") as string) || undefined,
    body: form.get("body"),
    bodyHtml: (form.get("bodyHtml") as string) || undefined,
    logoUrl: (form.get("logoUrl") as string) || undefined,
    backgroundColor: (form.get("backgroundColor") as string) || undefined,
    isDefault: form.get("isDefault") === "on",
    establishmentId: (form.get("establishmentId") as string) || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const data = parsed.data;

  await withTenant(orgId, async (tx) => {
    // If marked default, clear other defaults for same channel
    if (data.isDefault) {
      await tx.outreachTemplate.updateMany({
        where: { channel: data.channel, isDefault: true },
        data: { isDefault: false },
      });
    }

    if (data.id) {
      await tx.outreachTemplate.update({
        where: { id: data.id },
        data: {
          name: data.name,
          subject: data.subject ?? null,
          body: data.body,
          bodyHtml: data.bodyHtml ?? null,
          logoUrl: data.logoUrl || null,
          backgroundColor: data.backgroundColor ?? null,
          isDefault: data.isDefault ?? false,
          establishmentId: data.establishmentId ?? null,
        },
      });
    } else {
      await tx.outreachTemplate.create({
        data: {
          organizationId: orgId,
          establishmentId: data.establishmentId ?? null,
          channel: data.channel,
          name: data.name,
          subject: data.subject ?? null,
          body: data.body,
          bodyHtml: data.bodyHtml ?? null,
          logoUrl: data.logoUrl || null,
          backgroundColor: data.backgroundColor ?? null,
          isDefault: data.isDefault ?? false,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: data.id ? "outreach_template.updated" : "outreach_template.created",
        resourceType: "outreach_template",
        resourceId: data.id ?? null,
        afterData: { channel: data.channel, name: data.name },
      },
    });
  });

  revalidatePath("/outreach/templates");
}

export async function deleteOutreachTemplate(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    await tx.outreachTemplate.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "outreach_template.deleted",
        resourceType: "outreach_template",
        resourceId: id,
      },
    });
  });
  revalidatePath("/outreach/templates");
}
