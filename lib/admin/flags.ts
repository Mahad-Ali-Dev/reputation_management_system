"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { type AdminSessionClaims, getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/client";
import { invalidateFlagCache } from "@/lib/flags/client";

const UpsertSchema = z.object({
  key: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/, "lowercase, alnum, underscores only"),
  organizationId: z.string().uuid().nullable().optional(),
  enabled: z.coerce.boolean(),
  rolloutPct: z.coerce.number().int().min(0).max(100).default(100),
  metadata: z.string().max(2000).optional(),
});

// Roles allowed to mutate feature flags. Support / finance roles can READ
// flags via the admin dashboard but should not be able to toggle them — that's
// engineering-level config and changes ship code paths.
const FLAG_MUTATING_ROLES = new Set<AdminSessionClaims["role"]>(["super_admin", "engineering"]);

/**
 * Upsert a feature flag — org-scoped if organizationId provided, otherwise global.
 */
export async function upsertFeatureFlag(form: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!FLAG_MUTATING_ROLES.has(session.role)) {
    throw new Error("forbidden: feature flag writes require super_admin or engineering role");
  }

  const parsed = UpsertSchema.safeParse({
    key: form.get("key"),
    organizationId: form.get("organizationId") || null,
    enabled: form.get("enabled") === "on" || form.get("enabled") === "true",
    rolloutPct: form.get("rolloutPct") ?? 100,
    metadata: form.get("metadata") || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  const { key, organizationId, enabled, rolloutPct, metadata } = parsed.data;
  let parsedMetadata: Prisma.InputJsonValue | undefined = undefined;
  if (metadata) {
    try {
      const v = JSON.parse(metadata);
      if (typeof v !== "object" || v === null) throw new Error("not an object");
      parsedMetadata = v as Prisma.InputJsonValue;
    } catch {
      throw new Error("Metadata must be valid JSON object or empty");
    }
  }

  // Prisma's compound unique key doesn't allow null for nullable fields
  // ("organizationId_key" requires a non-null org_id). We split into findFirst
  // → upsert manually so null org IDs work as "global default" lookups.
  const existing = await prisma.featureFlag.findFirst({
    where: {
      key,
      organizationId: organizationId ?? null,
    },
  });
  if (existing) {
    await prisma.featureFlag.update({
      where: { id: existing.id },
      data: {
        enabled,
        rolloutPct,
        ...(parsedMetadata === undefined ? {} : { metadata: parsedMetadata }),
      },
    });
  } else {
    await prisma.featureFlag.create({
      data: {
        organizationId: organizationId ?? null,
        key,
        enabled,
        rolloutPct,
        ...(parsedMetadata === undefined ? {} : { metadata: parsedMetadata }),
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: organizationId ?? null,
      actorType: "admin_user",
      actorId: session.adminId,
      action: "feature_flag.upserted",
      resourceType: "feature_flag",
      afterData: { key, organizationId, enabled, rolloutPct, metadata: parsedMetadata ?? null },
    },
  });

  invalidateFlagCache(key);
  revalidatePath("/admin/flags");
}

const DeleteSchema = z.object({
  id: z.string().uuid(),
});

export async function deleteFeatureFlag(form: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!FLAG_MUTATING_ROLES.has(session.role)) {
    throw new Error("forbidden: feature flag writes require super_admin or engineering role");
  }
  const { id } = DeleteSchema.parse({ id: form.get("id") });

  const before = await prisma.featureFlag.findUnique({ where: { id } });
  if (!before) return;

  await prisma.featureFlag.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      organizationId: before.organizationId,
      actorType: "admin_user",
      actorId: session.adminId,
      action: "feature_flag.deleted",
      resourceType: "feature_flag",
      resourceId: id,
      beforeData: {
        key: before.key,
        enabled: before.enabled,
        rolloutPct: before.rolloutPct,
        organizationId: before.organizationId,
      },
    },
  });

  invalidateFlagCache(before.key);
  revalidatePath("/admin/flags");
}
