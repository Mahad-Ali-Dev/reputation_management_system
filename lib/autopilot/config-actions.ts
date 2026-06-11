"use server";

import { ForbiddenError, requireRole } from "@/lib/auth/rbac";
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
 * paid feature.
 *
 * RESULT CONTRACT: both actions return `AutopilotActionResult` instead of
 * throwing. Thrown server-action errors get their messages stripped in
 * production builds (bug 003 in the June 2026 assessment: the toggle looked
 * dead because the typed entitlement error never survived the wire), so the
 * entitlement/role/migration failures are mapped to typed codes the UI can
 * render — never silently enable, never a masked crash.
 *
 * Everything defaults OFF on first write except the safe per-loop toggles
 * (which only take effect once `enabled` is true). The config is a single
 * per-org row (`organizationId @id`).
 */

export type AutopilotActionResult =
  | { ok: true }
  | { ok: false; code: "not_entitled" | "forbidden" | "invalid" | "error"; message: string };

/** Next.js control-flow errors (redirect/notFound) must propagate, never be mapped. */
function isNextControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

/** Prisma P2021/P2022 + raw Postgres 42P01/42703 → table not migrated yet. */
function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") return true;
  const msg = err instanceof Error ? err.message : "";
  return msg.includes("42P01") || msg.includes("42703");
}

function mapActionError(err: unknown, event: string): AutopilotActionResult {
  if (err instanceof AutopilotNotEntitledError) {
    return { ok: false, code: "not_entitled", message: "Reputation Autopilot requires a paid plan." };
  }
  if (err instanceof ForbiddenError) {
    return { ok: false, code: "forbidden", message: "Only workspace admins can change Autopilot." };
  }
  if (isMissingRelation(err)) {
    return {
      ok: false,
      code: "error",
      message: "Autopilot isn't provisioned yet — ask your admin to apply the latest database migration.",
    };
  }
  logger.error({ event, error: err instanceof Error ? err.message : String(err) });
  return { ok: false, code: "error", message: "Could not update Autopilot. Try again." };
}

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
export async function saveAutopilotConfig(form: FormData): Promise<AutopilotActionResult> {
  try {
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
      return {
        ok: false,
        code: "invalid",
        message: `Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
      };
    }

    await persistConfig(orgId, userId, parsed.data);
    revalidatePath("/autopilot");
    return { ok: true };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    return mapActionError(err, "autopilot.config.save_failed");
  }
}

/** Flip the master switch only (the hero toggle). Admin-only + entitlement-gated. */
export async function toggleAutopilot(formData: FormData): Promise<AutopilotActionResult> {
  try {
    const { orgId, userId } = await requireRole("admin");
    const enabled = cb(formData, "enabled");
    const riskParsed = RISK.safeParse(formData.get("riskTolerance"));
    const riskTolerance = riskParsed.success
      ? riskParsed.data
      : RISK.catch("balanced").parse(env.AUTOPILOT_DEFAULT_RISK);

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
    return { ok: true };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    return mapActionError(err, "autopilot.toggle_failed");
  }
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
