"use server";

import { createHash, randomBytes } from "node:crypto";
import { sanitizeTabKeys } from "@/lib/access/tabs";
import { ACTIVE_ORG_COOKIE } from "@/lib/auth/active-org";
import { auth, signOut } from "@/lib/auth/config";
import { ForbiddenError, requireRole } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { sendTeamInviteEmail } from "@/lib/email/team-invite";
import { logger } from "@/lib/logger";
import { validatePublicUrlSync } from "@/lib/net/ssrf";
import { uploadToBlob } from "@/lib/uploads/blob";
import { redirect } from "next/navigation";
import { evaluateInvite } from "./invite-validation";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { NEW_API_KEY_COOKIE, NOTIFICATION_EVENTS } from "./constants";

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

  revalidatePath("/settings", "layout");
  revalidatePath("/dashboard");
}

const LOGO_MAX_BYTES = 5 * 1024 * 1024;

export type LogoUploadResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Upload + persist the org logo from a real file (the Brand settings dropzone).
 *
 * Returns `{ok,url}` so the client island renders inline errors and updates the
 * preview — it must NOT throw to a bare form (that crashes the page). The file
 * goes through the shared blob pipeline (`org_logo`: PNG/JPEG/WebP ≤5 MB,
 * magic-byte checked, SVG rejected as XSS). With no BLOB_READ_WRITE_TOKEN it
 * falls back to a `data:` URL, which the unbounded `logo_url` text column holds,
 * so upload still works in local dev.
 */
export async function uploadOrgLogo(form: FormData): Promise<LogoUploadResult> {
  try {
    const { orgId, userId } = await requireRole("admin");
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose an image file to upload." };
    }
    if (file.size > LOGO_MAX_BYTES) {
      return { ok: false, error: "That image is over 5 MB. Use a smaller PNG, JPG or WebP." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let url: string;
    try {
      ({ url } = await uploadToBlob({
        orgId,
        context: "org_logo",
        buffer,
        mimeType: file.type.toLowerCase(),
        filename: file.name || "logo",
      }));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "upload_failed";
      if (reason.startsWith("mime_type_not_allowed")) {
        return { ok: false, error: "Unsupported format — upload a PNG, JPG or WebP image (SVG isn't allowed)." };
      }
      if (reason.startsWith("file_too_large")) {
        return { ok: false, error: "That image is too large. Use one under 5 MB." };
      }
      if (reason === "file_content_does_not_match_declared_type") {
        return { ok: false, error: "That file doesn't look like a valid image. Try a different PNG, JPG or WebP." };
      }
      logger.error({ event: "account.logo.upload_failed", error: reason });
      return { ok: false, error: "Couldn't upload that image. Try again." };
    }

    await withTenant(orgId, async (tx) => {
      await tx.organization.update({ where: { id: orgId }, data: { logoUrl: url } });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "account.logo.uploaded",
          resourceType: "organization",
          resourceId: orgId,
          afterData: { via: "upload" },
        },
      });
    });

    revalidatePath("/settings", "layout");
    revalidatePath("/dashboard");
    return { ok: true, url };
  } catch (err) {
    // Let Next redirect/notFound control-flow propagate; map role denial inline.
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Only owners and admins can change the logo." };
    }
    logger.error({
      event: "account.logo.upload_error",
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: "Couldn't upload that image. Try again." };
  }
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

  // "Custom access" whitelists specific tabs (lib/access/tabs.ts) on top of
  // whatever the role already permits; missing/invalid entries are dropped
  // rather than rejected. Anything that isn't explicitly "custom" — including
  // a tampered submission — falls back to unrestricted (empty array), same as
  // every invite before this feature existed. That's a deliberate fail-open:
  // the actor here already passed `requireRole("admin")`, so a malformed
  // request degrading to "full access" isn't a privilege escalation, just a
  // no-op on the restriction.
  const accessMode = form.get("accessMode") === "custom" ? "custom" : "full";
  const allowedTabs = accessMode === "custom" ? sanitizeTabKeys(form.getAll("tabs") as string[]) : [];

  const plaintextToken = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(plaintextToken).digest("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await withTenant(orgId, async (tx) => {
    await tx.invitation.create({
      data: {
        organizationId: orgId,
        email: parsed.data.email,
        role: parsed.data.role,
        allowedTabs,
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
        afterData: { email: parsed.data.email, role: parsed.data.role, allowedTabs },
      },
    });
  });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const acceptUrl = `${appUrl}/accept-invite?token=${plaintextToken}`;

  // Actually EMAIL the invitation. Previously this only logged the accept URL,
  // so the invitee never heard anything and the button looked broken.
  const [inviter, org] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    withTenant(orgId, (tx) =>
      tx.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    ),
  ]);
  const delivery = await sendTeamInviteEmail({
    to: parsed.data.email,
    inviterName: inviter?.name ?? inviter?.email ?? "A teammate",
    orgName: org?.name ?? "your workspace",
    acceptUrl,
    orgId,
  });

  logger.info(
    {
      event: "team.invite.created",
      orgId,
      email: parsed.data.email,
      emailSent: delivery.sent,
      // Keep the URL in the log so an admin can still deliver it by hand when
      // email is unconfigured or Resend rejects the send.
      ...(delivery.sent ? {} : { acceptUrl, reason: delivery.reason }),
    },
    delivery.sent
      ? "team invitation created + emailed"
      : "team invitation created but email NOT sent — share the accept URL with the invitee",
  );

  revalidatePath("/settings", "layout");
}

// ============================================================
// Accept invite — pre-membership flow for an invited teammate
// ============================================================

/**
 * Shape returned by `lookupInvite` — a read-only validation result the
 * /accept-invite page renders without consuming the invitation.
 */
export type InviteLookup =
  | { ok: true; orgName: string; role: string; email: string }
  | { ok: false; reason: "not_found" | "expired" | "used" | "wrong_email" };

/**
 * Read-only validation of an invite token for the currently authenticated user.
 *
 * The lookup is by tokenHash on the base (BYPASSRLS) client — same pattern as
 * the public survey-token page — because the accepting user is NOT yet a member
 * of the inviting org, so the tenant-scoped RLS context can't find the row. The
 * token hash is a 24-byte secret, so a direct hash lookup is safe and the read
 * never exposes cross-tenant data beyond the org name the invite is for.
 *
 * Does NOT consume the invitation — that only happens in `acceptInvite`.
 */
export async function lookupInvite(token: string): Promise<InviteLookup> {
  const session = await auth();
  const sessionEmail = session?.user?.email?.toLowerCase();
  if (!sessionEmail) return { ok: false, reason: "not_found" };

  if (!token || token.length < 8 || token.length > 200) {
    return { ok: false, reason: "not_found" };
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const invite = await prisma.invitation.findFirst({
    where: { tokenHash },
    select: {
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      organization: { select: { name: true } },
    },
  });
  // The invited email must match the signed-in user (citext column, but we also
  // compare case-insensitively in app code so behaviour is independent of
  // collation). evaluateInvite is the single source of accept/reject rules.
  const verdict = evaluateInvite(invite, sessionEmail);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  // verdict.ok already implies invite !== null (evaluateInvite returns not_found
  // for null); this guard makes that explicit for the type checker.
  if (!invite) return { ok: false, reason: "not_found" };

  return {
    ok: true,
    orgName: invite.organization.name,
    role: invite.role,
    email: invite.email,
  };
}

/**
 * Accept a team invitation. Idempotently creates the membership and atomically
 * marks the invitation accepted (single-use). The created membership's role is
 * ALWAYS the role stored on the invitation — never anything the client supplies.
 *
 * Security properties:
 *   - Requires an authenticated session; the signed-in email MUST equal the
 *     invitation email (case-insensitive) or the request is rejected.
 *   - Rejects expired / already-accepted invitations.
 *   - The `updateMany(... acceptedAt: null)` guard makes acceptance a single
 *     atomic compare-and-set: two concurrent accepts can't both consume it.
 */
export async function acceptInvite(form: FormData): Promise<void> {
  const session = await auth();
  const userId = session?.user?.id;
  const sessionEmail = session?.user?.email?.toLowerCase();
  if (!userId || !sessionEmail) redirect("/login");

  const token = ((form.get("token") as string) || "").trim();
  if (!token || token.length < 8 || token.length > 200) {
    throw new Error("Invalid invitation token.");
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Base-client lookup (see lookupInvite) — the user isn't a member yet.
  const invite = await prisma.invitation.findFirst({
    where: { tokenHash },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      allowedTabs: true,
      expiresAt: true,
      acceptedAt: true,
    },
  });
  const verdict = evaluateInvite(invite, sessionEmail);
  if (!verdict.ok) {
    const messages: Record<string, string> = {
      not_found: "Invitation not found.",
      used: "This invitation has already been used.",
      expired: "This invitation has expired.",
      wrong_email: "This invitation was sent to a different email address.",
    };
    throw new Error(messages[verdict.reason] ?? "Invitation could not be accepted.");
  }
  // verdict.ok implies invite !== null — make it explicit for the type checker.
  if (!invite) throw new Error("Invitation not found.");

  // The stored role (and tab whitelist) is the source of truth — never
  // user-supplied at accept time.
  const role = invite.role;
  const orgId = invite.organizationId;
  const allowedTabs = invite.allowedTabs;

  await withTenant(orgId, async (tx) => {
    // Atomic single-use consume: only succeeds if it's still unaccepted.
    const consumed = await tx.invitation.updateMany({
      where: { id: invite.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (consumed.count === 0) {
      // Lost the race (already accepted between our read and this write).
      throw new Error("This invitation has already been used.");
    }

    // Idempotently create the membership. The unique (organizationId, userId)
    // constraint means a re-run (or an already-a-member user) is a no-op.
    const existing = await tx.membership.findFirst({
      where: { organizationId: orgId, userId },
      select: { id: true },
    });
    if (!existing) {
      await tx.membership.create({
        data: { organizationId: orgId, userId, role, allowedTabs },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "team.invite.accepted",
        resourceType: "invitation",
        resourceId: invite.id,
        afterData: { role, email: invite.email, alreadyMember: !!existing },
      },
    });
  });

  logger.info(
    { event: "team.invite.accepted", orgId, userId, role },
    "team invitation accepted",
  );

  // A brand-new user gets their OWN workspace auto-created on first sign-in
  // (see ensureOrgForUser in lib/auth/config.ts), before they ever reach this
  // action — so by now they typically have two memberships, and the session's
  // default org is the older (their own), never this one. Set the active-org
  // cookie so /dashboard actually opens the workspace they just joined instead
  // of silently falling back to their own empty workspace.
  const jar = await cookies();
  jar.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
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

  revalidatePath("/settings", "layout");
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

  revalidatePath("/settings", "layout");
}

// ============================================================
// Notifications — per-event email / in-app preferences
// (event catalog lives in ./constants — "use server" can't export non-functions)
// ============================================================

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

  revalidatePath("/settings", "layout");
}

// ============================================================
// API & webhooks — workspace API key + outbound webhook endpoint
// ============================================================

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
    path: "/settings",
    maxAge: 120,
  });

  revalidatePath("/settings", "layout");
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

  // Reject obviously-internal targets up front (scheme, credentials, literal
  // private IPs, localhost). The DNS-resolving guard in lib/notifications/webhook.ts
  // is the load-bearing check at delivery time; this just gives fast feedback.
  if (webhookUrl) {
    const ssrf = validatePublicUrlSync(webhookUrl);
    if (ssrf) {
      throw new Error(
        ssrf === "non_http_scheme"
          ? "Webhook URL must start with https://"
          : "Webhook URL must be a public https endpoint (no localhost or private addresses).",
      );
    }
  }

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

  revalidatePath("/settings", "layout");
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
