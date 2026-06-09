"use server";

import { createHash, randomBytes } from "node:crypto";
import { signOut } from "@/lib/auth/config";
import { ForbiddenError, requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
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

// ============================================================
// Notifications — per-event email / in-app preferences
// ============================================================

/** Notification events the user can opt in/out of. Shared with the settings page. */
export const NOTIFICATION_EVENTS = [
  {
    key: "new_review",
    label: "New review",
    sub: "When a new review lands on any connected platform",
  },
  { key: "negative_review", label: "Negative review", sub: "When a review is 3 stars or lower" },
  { key: "weekly_report", label: "Weekly summary", sub: "Your reputation digest, every Monday" },
  {
    key: "campaign_completed",
    label: "Campaign completed",
    sub: "When a review-request campaign finishes sending",
  },
  {
    key: "survey_response",
    label: "New survey response",
    sub: "When a customer completes one of your surveys",
  },
  { key: "teammate_joined", label: "Teammate joined", sub: "When someone accepts a team invite" },
] as const;

export async function updateNotificationPrefs(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");

  const prefs: Record<string, { email: boolean; inApp: boolean }> = {};
  for (const ev of NOTIFICATION_EVENTS) {
    prefs[ev.key] = {
      email: form.get(`${ev.key}_email`) === "on",
      inApp: form.get(`${ev.key}_inApp`) === "on",
    };
  }

  await withTenant(orgId, async (tx) => {
    const current = await tx.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const existing = asJsonObject(current?.settings);
    const next = { ...existing, notifications: prefs };
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: next as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "notifications.prefs.updated",
        resourceType: "organization",
        resourceId: orgId,
        afterData: prefs,
      },
    });
  });

  revalidatePath("/settings/account");
}

// ============================================================
// API & webhooks — workspace API key + outbound webhook endpoint
// ============================================================

/** Cookie used to surface a freshly generated API key exactly once (then it expires). */
export const NEW_API_KEY_COOKIE = "rl_new_api_key";

/**
 * Generate (or rotate) the workspace API key. We persist only a sha256 hash + a
 * non-secret prefix; the plaintext is surfaced once via a short-lived, path-scoped
 * httpOnly cookie that the settings page reads on its next render and never again.
 */
export async function rotateApiKey(): Promise<void> {
  const { orgId, userId } = await requireRole("admin");

  const plaintext = `rl_live_${randomBytes(24).toString("base64url")}`;
  const keyHash = createHash("sha256").update(plaintext).digest("hex");
  const keyPrefix = plaintext.slice(0, 16); // e.g. rl_live_AbC123 — safe to display

  await withTenant(orgId, async (tx) => {
    const current = await tx.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const existing = asJsonObject(current?.settings);
    const api = asJsonObject(existing.api);
    const next = {
      ...existing,
      api: { ...api, keyHash, keyPrefix, keyCreatedAt: new Date().toISOString() },
    };
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: next as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "api.key.rotated",
        resourceType: "organization",
        resourceId: orgId,
        afterData: { keyPrefix },
      },
    });
  });

  const jar = await cookies();
  jar.set(NEW_API_KEY_COOKIE, plaintext, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/settings/account",
    maxAge: 120,
  });

  revalidatePath("/settings/account");
}

const WebhookSchema = z.object({
  webhookUrl: z.string().url().max(500).or(z.literal("")).optional(),
});

/** Save the outbound webhook endpoint; mint a signing secret when one is first set. */
export async function saveWebhook(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");
  const parsed = WebhookSchema.safeParse({
    webhookUrl: (form.get("webhookUrl") as string) || "",
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const webhookUrl = parsed.data.webhookUrl || "";

  await withTenant(orgId, async (tx) => {
    const current = await tx.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const existing = asJsonObject(current?.settings);
    const api = asJsonObject(existing.api);
    let webhookSecret = typeof api.webhookSecret === "string" ? api.webhookSecret : undefined;
    if (webhookUrl && !webhookSecret) {
      webhookSecret = `whsec_${randomBytes(20).toString("base64url")}`;
    }
    const next = {
      ...existing,
      api: {
        ...api,
        webhookUrl: webhookUrl || null,
        webhookSecret: webhookUrl ? webhookSecret : null,
      },
    };
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: next as Prisma.InputJsonValue },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "api.webhook.updated",
        resourceType: "organization",
        resourceId: orgId,
        afterData: { hasWebhook: !!webhookUrl },
      },
    });
  });

  revalidatePath("/settings/account");
}

// ============================================================
// Danger zone — delete (soft-delete) the workspace
// ============================================================

/**
 * Soft-delete the workspace: requires owner role + typing the exact business name
 * to confirm. We set `deletedAt` (reversible by support) + suspend the plan, write
 * an audit record, then sign the user out. Hard purge is a separate retention job.
 */
export async function deleteAccount(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("owner");
  const confirm = ((form.get("confirm") as string) || "").trim();

  await withTenant(orgId, async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    if (!org) throw new Error("Workspace not found");
    if (confirm.toLowerCase() !== org.name.trim().toLowerCase()) {
      throw new Error("Confirmation text does not match the business name.");
    }
    await tx.organization.update({
      where: { id: orgId },
      data: { deletedAt: new Date(), plan: "suspended" },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "account.deleted",
        resourceType: "organization",
        resourceId: orgId,
        beforeData: { name: org.name },
      },
    });
  });

  logger.warn({ event: "account.deleted", orgId, userId }, "workspace soft-deleted by owner");

  // Ends the session and redirects to /login (throws NEXT_REDIRECT).
  await signOut({ redirectTo: "/login" });
}
