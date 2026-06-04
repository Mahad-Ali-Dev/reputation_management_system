"use server";

import { createHash, randomBytes } from "node:crypto";
import { ForbiddenError, requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const ProfileSchema = z.object({
  ownerName: z.string().max(120).optional(),
  ownerEmail: z.string().email().max(200).optional(),
  businessName: z.string().min(1).max(120),
  phone: z.string().max(40).optional(),
  country: z.string().max(60).optional(),
  websiteUrl: z.string().url().max(500).or(z.literal("")).optional(),
  logoUrl: z.string().url().max(500).or(z.literal("")).optional(),
  businessDescription: z.string().max(2000).optional(),
});

export async function updateAccountSettings(form: FormData): Promise<void> {
  // Workspace settings are an owner/admin concern.
  const { orgId, userId } = await requireRole("admin");

  const parsed = ProfileSchema.safeParse({
    ownerName: (form.get("ownerName") as string) || undefined,
    ownerEmail: (form.get("ownerEmail") as string) || undefined,
    businessName: form.get("businessName"),
    phone: (form.get("phone") as string) || undefined,
    country: (form.get("country") as string) || undefined,
    websiteUrl: (form.get("websiteUrl") as string) || undefined,
    logoUrl: (form.get("logoUrl") as string) || undefined,
    businessDescription: (form.get("businessDescription") as string) || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const data = parsed.data;

  // Both writes happen inside the same tenant-scoped transaction so RLS
  // enforces that this org can only mutate its own row + its own audit log.
  await withTenant(orgId, async (tx) => {
    await tx.organization.update({
      where: { id: orgId },
      data: {
        name: data.businessName,
        ownerName: data.ownerName ?? null,
        ownerEmail: data.ownerEmail ?? null,
        phone: data.phone ?? null,
        country: data.country ?? null,
        websiteUrl: data.websiteUrl || null,
        logoUrl: data.logoUrl || null,
        businessDescription: data.businessDescription ?? null,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "account.settings.updated",
        resourceType: "organization",
        resourceId: orgId,
        afterData: {
          businessName: data.businessName,
          phone: data.phone,
          country: data.country,
          hasLogoUrl: !!data.logoUrl,
        },
      },
    });
  });

  revalidatePath("/settings/account");
  revalidatePath("/dashboard");
}

// ============================================================
// Team — invite teammate + change role + remove
// ============================================================

const InviteSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(["owner", "admin", "manager", "viewer"]).default("admin"),
});

const INVITE_TTL_DAYS = 14;

/**
 * Send an invitation to a teammate. Creates an `invitations` row with a hashed
 * single-use token. The accept URL is /accept-invite?token=<plaintext>.
 *
 * For v1 we don't send the email automatically (Resend integration lands
 * later — the same shape as the digest sender). The accept URL is logged so
 * ops can deliver it manually until then.
 */
export async function inviteTeammate(form: FormData): Promise<void> {
  // Managing the team is an owner/admin action.
  const { orgId, userId, role } = await requireRole("admin");

  const parsed = InviteSchema.safeParse({
    email: (form.get("email") as string)?.trim().toLowerCase(),
    role: (form.get("role") as string) || "admin",
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  // Only an owner may mint privileged (owner/admin) invitations — otherwise an
  // admin could escalate themselves or others to owner.
  if ((parsed.data.role === "owner" || parsed.data.role === "admin") && role !== "owner") {
    throw new ForbiddenError("owner", role);
  }

  const plaintextToken = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(plaintextToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await withTenant(orgId, async (tx) => {
    await tx.invitation.create({
      data: {
        organizationId: orgId,
        email: parsed.data.email,
        role: parsed.data.role,
        tokenHash,
        expiresAt,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "team.invited",
        resourceType: "invitation",
        afterData: { email: parsed.data.email, role: parsed.data.role },
      },
    });
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const acceptUrl = `${appUrl}/accept-invite?token=${plaintextToken}`;
  logger.info(
    { event: "team.invite.created", orgId, email: parsed.data.email, acceptUrl },
    "team invitation created — share the accept URL with the invitee",
  );

  revalidatePath("/settings/account");
}

const RemoveMemberSchema = z.object({
  membershipId: z.string().uuid(),
});

export async function removeMember(form: FormData): Promise<void> {
  // Managing the team is an owner/admin action.
  const { orgId, userId, role } = await requireRole("admin");
  const { membershipId } = RemoveMemberSchema.parse({ membershipId: form.get("membershipId") });

  await withTenant(orgId, async (tx) => {
    // Guard: prevent removing the last owner.
    const target = await tx.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
      select: { role: true, userId: true },
    });
    if (!target) return;
    // Only an owner may remove another owner or an admin.
    if ((target.role === "owner" || target.role === "admin") && role !== "owner") {
      throw new ForbiddenError("owner", role);
    }
    if (target.role === "owner") {
      const ownerCount = await tx.membership.count({
        where: { organizationId: orgId, role: "owner" },
      });
      if (ownerCount <= 1) {
        throw new Error("Cannot remove the last owner");
      }
    }
    await tx.membership.delete({ where: { id: membershipId } });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "team.removed",
        resourceType: "membership",
        resourceId: membershipId,
        beforeData: { removedUserId: target.userId, role: target.role },
      },
    });
  });

  revalidatePath("/settings/account");
}

// ============================================================
// Security preferences (lightweight v1)
// ============================================================

const SecurityPrefsSchema = z.object({
  sessionTimeoutMinutes: z.coerce.number().int().min(5).max(720),
  twoFactorRequired: z.coerce.boolean().optional(),
});

/** Narrow an unknown Json value to a plain object (not array / scalar / null). */
function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Persist security preferences as a JSON blob on the organization row, merged
 * into `settings.security` so other setting groups aren't clobbered. The actual
 * enforcement of `sessionTimeoutMinutes` ships with the Auth.js session-policy
 * update (Phase 0); until then this stores the preference durably.
 */
export async function updateSecurityPrefs(form: FormData): Promise<void> {
  // Security settings are an owner/admin concern.
  const { orgId, userId } = await requireRole("admin");
  const parsed = SecurityPrefsSchema.safeParse({
    sessionTimeoutMinutes: form.get("sessionTimeoutMinutes") ?? 30,
    twoFactorRequired:
      form.get("twoFactorRequired") === "on" || form.get("twoFactorRequired") === "true",
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  await withTenant(orgId, async (tx) => {
    // Read-merge-write inside the txn so concurrent setting-group writes don't
    // race away each other's keys. RLS scopes both the read and the write to
    // this org.
    const current = await tx.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const existing = asJsonObject(current?.settings);
    const nextSettings = {
      ...existing,
      security: {
        ...asJsonObject(existing.security),
        sessionTimeoutMinutes: parsed.data.sessionTimeoutMinutes,
        twoFactorRequired: parsed.data.twoFactorRequired ?? false,
      },
    };

    await tx.organization.update({
      where: { id: orgId },
      data: { settings: nextSettings as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "security.prefs.updated",
        resourceType: "organization",
        resourceId: orgId,
        afterData: parsed.data,
      },
    });
  });

  revalidatePath("/settings/account");
}
