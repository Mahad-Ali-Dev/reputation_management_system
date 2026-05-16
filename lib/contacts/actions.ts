"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { parseRecipientsCsv } from "@/lib/outreach/bulk";

const ContactSchema = z.object({
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  tags: z.string().max(500).optional(),  // comma-separated
  source: z.enum(["manual", "csv"]).default("manual"),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return { orgId };
}

export async function addContact(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = ContactSchema.safeParse({
    name: (form.get("name") as string) || undefined,
    email: (form.get("email") as string) || undefined,
    phone: (form.get("phone") as string) || undefined,
    tags: (form.get("tags") as string) || undefined,
    source: form.get("source") ?? "manual",
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const { name, email, phone, tags, source } = parsed.data;

  if (!email && !phone) {
    throw new Error("Provide at least an email or phone number");
  }

  await withTenant(orgId, async (tx) => {
    await tx.contact.create({
      data: {
        organizationId: orgId,
        source,
        name: name ?? null,
        email: email || null,
        phone: phone ?? null,
        tags: tags
          ? tags.split(",").map((t) => t.trim()).filter((t) => t.length > 0)
          : [],
      },
    });
  });

  revalidatePath("/contacts");
}

export async function importContactsCsv(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const csvText = z.string().min(1).max(2_000_000).parse(form.get("csvText"));
  const channel = z.enum(["email", "sms"]).parse(form.get("channel"));

  const { rows } = parseRecipientsCsv({ csvText, channel });
  if (rows.length === 0) throw new Error("No valid recipients in CSV");

  await withTenant(orgId, async (tx) => {
    // Bulk insert instead of one INSERT per row.
    await tx.contact.createMany({
      data: rows.map((r) => ({
        organizationId: orgId,
        source: "csv",
        name: r.recipientName,
        email: channel === "email" ? r.recipient : null,
        phone: channel === "sms" ? r.recipient : null,
        tags: [],
      })),
      skipDuplicates: true,
    });
  });

  revalidatePath("/contacts");
}

export async function deleteContact(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    await tx.contact.delete({ where: { id } });
  });
  revalidatePath("/contacts");
}
