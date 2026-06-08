"use server";

import { requireRole } from "@/lib/auth/rbac";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AutopilotNotEntitledError } from "./errors";

/**
 * Autopilot config server actions (Module 15).
 *
 * Enabling Autopilot changes spend (SMS/AI) + automation posture → an
 * ADMIN-level op (`requireRole("admin")`) gated behind the `ai_autopilot`
 * paid feature. We throw a TYPED error (`AutopilotNotEntitledError`, from
 * `./errors` so this `"use server"` module exports only async functions) the UI
 * maps to the upsell when the org isn't entitled — never silently enable.
 *
 * Everything defaults OFF on first write except the safe per-loop toggles
 * (which only take effect once `enabled` is true). The config is a single
 * per-org row (`organizationId @id`).
 */

const RISK = z.enum(["conservative", "balanced", "aggressive"]);

const ConfigSchema = z.object({
  enabled: z.boolean(),
  riskTolerance: RISK,
  autoReply5Star: z.boolean(),
  draftLowStar: z.boolean(),
  sendReviewRequests: z.boolean(),
  voiceToReviewEnabled: z.boolean(),
  draftDisputes: z.boolean(),
  geoPosts: z.boolean(),
  inboxAutoReply: z.boolean(),
  escalateToHuman: z.boolean(),
  weeklyDigestEnabled: z.boolean(),
});

type ConfigInput = z.infer<typeof ConfigSchema>;

function cb(form: FormData, key: string): boolean {
  const v = form.get(key);
  return v === "on" || v === "true" || v === "1";
}

/**
 * Persist the full Autopilot config from the controls form. Admin-only.
 * Gated: if `enabled` is being turned on, the org must have `ai_autopilot`.
 */
export async function saveAutopilotConfig(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");

  const parsed = ConfigSchema.safeParse({
    enabled: cb(form, "enabled"),
    riskTolerance: (form.get("riskTolerance") as string) || env.AUTOPILOT_DEFAULT_RISK,
    autoReply5Star: cb(form, "autoReply5Star"),
    draftLowStar: cb(form, "draftLowStar"),
    sendReviewRequests: cb(form, "sendReviewRequests"),
    voiceToReviewEnabled: cb(form, "voiceToReviewEnabled"),
    draftDisputes: cb(form, "draftDisputes"),
    geoPosts: cb(form, "geoPosts"),
    inboxAutoReply: cb(form, "inboxAutoReply"),
    escalateToHuman: cb(form, "escalateToHuman"),
    weeklyDigestEnabled: cb(form, "weeklyDigestEnabled"),
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }

  await persistConfig(orgId, userId, parsed.data);
  revalidatePath("/autopilot");
}

/** Flip the master switch only (the hero toggle). Admin-only + entitlement-gated. */
export async function toggleAutopilot(formData: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("admin");
  const enabled = cb(formData, "enabled");
  const riskTolerance = RISK.catch(env.AUTOPILOT_DEFAULT_RISK).parse(
    (formData.get("riskTolerance") as string) || env.AUTOPILOT_DEFAULT_RISK,
  );

  // Entitlement gate: only enforced when turning Autopilot ON. Checked before
  // the tenant transaction (it does its own auth-domain read).
  if (enabled && !(await orgHasFeature(orgId, "ai_autopilot"))) {
    throw new AutopilotNotEntitledError();
  }

  await withTenant(orgId, async (tx) => {
    // Read the current row (if any) so we keep the first enabledAt stamp.
    const existing = await tx.autopilotConfig.findUnique({
      where: { organizationId: orgId },
      select: { enabledAt: true },
    });

    await tx.autopilotConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        enabled,
        riskTolerance,
        enabledAt: enabled ? new Date() : null,
      },
      update: {
        enabled,
        // The hero control sends the desired risk on every toggle — always apply.
        riskTolerance,
        // Stamp enabledAt the first time it flips on; keep prior value otherwise.
        enabledAt: enabled ? (existing?.enabledAt ?? new Date()) : null,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "autopilot.config.updated",
        resourceType: "autopilot_config",
        resourceId: orgId,
        afterData: { enabled, riskTolerance },
      },
    });
  });

  logger.info({ orgId, enabled, event: "autopilot.toggle" }, "autopilot toggled");
  revalidatePath("/autopilot");
}

async function persistConfig(orgId: string, userId: string, data: ConfigInput): Promise<void> {
  // Entitlement gate: only enforced when turning Autopilot ON.
  if (data.enabled && !(await orgHasFeature(orgId, "ai_autopilot"))) {
    throw new AutopilotNotEntitledError();
  }

  await withTenant(orgId, async (tx) => {
    const existing = await tx.autopilotConfig.findUnique({
      where: { organizationId: orgId },
      select: { enabledAt: true },
    });
    await tx.autopilotConfig.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        ...data,
        enabledAt: data.enabled ? new Date() : null,
      },
      update: {
        ...data,
        enabledAt: data.enabled ? (existing?.enabledAt ?? new Date()) : null,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "autopilot.config.updated",
        resourceType: "autopilot_config",
        resourceId: orgId,
        afterData: { enabled: data.enabled, riskTolerance: data.riskTolerance },
      },
    });
  });

  logger.info({ orgId, enabled: data.enabled, event: "autopilot.config.saved" }, "autopilot config saved");
}
