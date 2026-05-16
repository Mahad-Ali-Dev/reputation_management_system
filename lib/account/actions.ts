"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

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

async function requireSession() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

export async function updateAccountSettings(form: FormData): Promise<void> {
  const { orgId, userId } = await requireSession();

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
  const { orgId, userId } = await requireSession();

  const parsed = InviteSchema.safeParse({
    email: (form.get("email") as string)?.trim().toLowerCase(),
    role: (form.get("role") as string) || "admin",
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
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
  const { orgId, userId } = await requireSession();
  const { membershipId } = RemoveMemberSchema.parse({ membershipId: form.get("membershipId") });

  await withTenant(orgId, async (tx) => {
    // Guard: prevent removing the last owner.
    const target = await tx.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
      select: { role: true, userId: true },
    });
    if (!target) return;
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

/**
 * Persist security preferences as a JSON blob on the organization row. The
 * actual enforcement of `sessionTimeoutMinutes` ships with the Auth.js
 * session-policy update (Phase 0).
 */
export async function updateSecurityPrefs(form: FormData): Promise<void> {
  const { orgId, userId } = await requireSession();
  const parsed = SecurityPrefsSchema.safeParse({
    sessionTimeoutMinutes: form.get("sessionTimeoutMinutes") ?? 30,
    twoFactorRequired: form.get("twoFactorRequired") === "on" || form.get("twoFactorRequired") === "true",
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  await withTenant(orgId, async (tx) => {
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
