"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

// ─── Validation ──────────────────────────────────────────────

const AddressSchema = z
  .object({
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    region: z.string().max(100).optional(),
    postal: z.string().max(20).optional(),
    // Accept either ISO 2-letter codes or full country names — normalize later.
    country: z.string().max(60).optional(),
  })
  .partial();

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  category: z.string().max(60).optional().or(z.literal("")),
  timezone: z.string().max(60).default("UTC"),
  address: AddressSchema.optional(),
});

// ─── Helpers ──────────────────────────────────────────────────

async function requireOrg(): Promise<{ orgId: string; userId: string; email: string }> {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  const email = session?.user?.email;
  if (!session || !orgId || !userId || !email) redirect("/login");
  return { orgId, userId, email };
}

function fd(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ─── Actions ──────────────────────────────────────────────────

export async function createEstablishment(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();

  const parsed = CreateSchema.safeParse({
    name: fd(form, "name"),
    category: fd(form, "category"),
    timezone: fd(form, "timezone") ?? "UTC",
    address: {
      line1: fd(form, "address_line1"),
      city: fd(form, "address_city"),
      region: fd(form, "address_region"),
      postal: fd(form, "address_postal"),
      country: fd(form, "address_country"),
    },
  });
  if (!parsed.success) {
    throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const data = parsed.data;

  const created = await withTenant(orgId, async (tx) => {
    const e = await tx.establishment.create({
      data: {
        organizationId: orgId,
        name: data.name,
        category: data.category || null,
        timezone: data.timezone,
        address: data.address ?? undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.created",
        resourceType: "establishment",
        resourceId: e.id,
        afterData: { id: e.id, name: e.name },
      },
    });
    return e;
  });

  logger.info(
    { orgId, establishmentId: created.id, event: "establishment.created" },
    "establishment created",
  );

  revalidatePath("/establishments");
  redirect(`/establishments/${created.id}`);
}

export async function updateEstablishment(id: string, form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();

  const parsed = CreateSchema.partial().safeParse({
    name: fd(form, "name"),
    category: fd(form, "category"),
    timezone: fd(form, "timezone"),
    address: {
      line1: fd(form, "address_line1"),
      city: fd(form, "address_city"),
      region: fd(form, "address_region"),
      postal: fd(form, "address_postal"),
      country: fd(form, "address_country"),
    },
  });
  if (!parsed.success) {
    throw new Error(`Validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const data = parsed.data;

  await withTenant(orgId, async (tx) => {
    const before = await tx.establishment.findFirst({ where: { id } });
    if (!before) return; // RLS hid it OR doesn't exist — 404-ish (no leak)

    const after = await tx.establishment.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.category !== undefined && { category: data.category || null }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.address !== undefined && { address: data.address }),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.updated",
        resourceType: "establishment",
        resourceId: after.id,
        beforeData: { name: before.name, category: before.category },
        afterData: { name: after.name, category: after.category },
      },
    });
  });

  revalidatePath(`/establishments/${id}`);
  revalidatePath("/establishments");
}

export async function deleteEstablishment(id: string) {
  const { orgId, userId } = await requireOrg();

  await withTenant(orgId, async (tx) => {
    const before = await tx.establishment.findFirst({ where: { id, deletedAt: null } });
    if (!before) return;
    await tx.establishment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.deleted",
        resourceType: "establishment",
        resourceId: id,
        beforeData: { name: before.name },
      },
    });
  });

  revalidatePath("/establishments");
  redirect("/establishments");
}

export async function setGooglePlaceId(establishmentId: string, placeId: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(placeId)) {
    throw new Error("invalid_place_id");
  }

  await withTenant(orgId, async (tx) => {
    await tx.establishment.update({
      where: { id: establishmentId },
      data: { googlePlaceId: placeId },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "establishment.google_place_linked",
        resourceType: "establishment",
        resourceId: establishmentId,
        afterData: { google_place_id: placeId },
      },
    });
  });

  revalidatePath(`/establishments/${establishmentId}`);
}
