"use server";

import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { REVIEW_SOURCES, type ReviewSource } from "@/lib/reviews/queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AutoReplyRuleFormState } from "./form-state";

/**
 * CRUD server actions for auto-reply rules. Pattern:
 *
 *   const [state, action] = useActionState(createAutoReplyRule, initialState);
 *   <form action={action}>...</form>
 *
 * Errors surface in `state.error` so the UI can show inline messages
 * instead of dropping the host on the Next error page. Successful
 * submits redirect to the rules list (createXyz) or back to the edit
 * page (updateXyz).
 *
 * Auth: every mutating action calls `requireRole("manager")` first. If the
 * session is missing we 302 to /login; an insufficient role throws
 * ForbiddenError — never silently ignore. Org isolation is enforced by
 * withTenant.
 */

// ----- schema -----

const SOURCE_VALUES = REVIEW_SOURCES as readonly string[];

/**
 * Schema is shared between create + update. We coerce numbers explicitly
 * because FormData values come in as strings (and "" should be treated
 * as the field's default, not NaN).
 */
const RuleSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
    enabled: z.coerce.boolean(),
    establishmentId: z
      .string()
      .uuid()
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    matchMinRating: z.coerce.number().int().min(1).max(5),
    matchMaxRating: z.coerce.number().int().min(1).max(5),
    matchKeywords: z
      .string()
      .max(2000)
      .optional()
      .transform((s) =>
        (s ?? "")
          .split(/[,\n]/)
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
          // Cap at 32 keywords per rule — anything beyond is unmanageable
          // and a sign the host should split into multiple rules.
          .slice(0, 32),
      ),
    matchSources: z
      .array(z.string())
      .optional()
      .default([])
      .transform((arr) =>
        arr.filter((s): s is ReviewSource => (SOURCE_VALUES as readonly string[]).includes(s)),
      ),
    action: z.enum(["draft_only", "auto_publish_after_delay"]),
    delayMinutes: z.coerce.number().int().min(0).max(1440),
    replyTone: z.enum(["concise", "warm", "detailed"]),
  })
  .refine((v) => v.matchMinRating <= v.matchMaxRating, {
    path: ["matchMaxRating"],
    message: "Max rating must be ≥ min rating",
  });

// ----- helpers -----

/**
 * Pull array values from FormData (selects render as one field-name per
 * picked option). Zod's `z.array(z.string())` doesn't auto-coerce, so we
 * normalize before passing in.
 */
function toShape(form: FormData) {
  return {
    name: form.get("name"),
    enabled: form.get("enabled") === "on" || form.get("enabled") === "true",
    establishmentId: form.get("establishmentId"),
    matchMinRating: form.get("matchMinRating"),
    matchMaxRating: form.get("matchMaxRating"),
    matchKeywords: form.get("matchKeywords"),
    matchSources: form.getAll("matchSources").map(String),
    action: form.get("action"),
    delayMinutes: form.get("delayMinutes"),
    replyTone: form.get("replyTone"),
  };
}

function pickFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ----- create -----

export async function createAutoReplyRule(
  _prev: AutoReplyRuleFormState,
  form: FormData,
): Promise<AutoReplyRuleFormState> {
  const { orgId, userId } = await requireRole("manager");
  const parsed = RuleSchema.safeParse(toShape(form));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: pickFieldErrors(parsed.error),
    };
  }
  const data = parsed.data;

  // Defense-in-depth: confirm the establishmentId belongs to this org.
  // RLS would already filter, but we want a clean error message rather
  // than a "constraint" error from Postgres.
  const establishmentIdToCheck = data.establishmentId;
  if (establishmentIdToCheck) {
    const owned = await withTenant(orgId, (tx) =>
      tx.establishment.count({
        where: { id: establishmentIdToCheck, deletedAt: null },
      }),
    );
    if (owned === 0) {
      return {
        error: "Establishment not found.",
        fieldErrors: { establishmentId: "Pick a listing you own or leave blank for org-wide." },
      };
    }
  }

  const created = await withTenant(orgId, async (tx) => {
    const rule = await tx.autoReplyRule.create({
      data: {
        organizationId: orgId,
        establishmentId: data.establishmentId,
        name: data.name,
        enabled: data.enabled,
        matchMinRating: data.matchMinRating,
        matchMaxRating: data.matchMaxRating,
        matchKeywords: data.matchKeywords,
        matchSources: data.matchSources,
        action: data.action,
        delayMinutes: data.delayMinutes,
        replyTone: data.replyTone,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "auto_reply_rule.created",
        resourceType: "auto_reply_rule",
        resourceId: rule.id,
        afterData: {
          name: data.name,
          establishmentId: data.establishmentId,
          action: data.action,
          ratingRange: [data.matchMinRating, data.matchMaxRating],
          keywordsCount: data.matchKeywords.length,
        },
      },
    });
    return rule;
  });

  logger.info(
    { orgId, ruleId: created.id, event: "auto_reply_rule.created" },
    "auto-reply rule created",
  );

  revalidatePath("/reviews/auto-reply");
  redirect("/reviews/auto-reply");
}

// ----- update -----

export async function updateAutoReplyRule(
  _prev: AutoReplyRuleFormState,
  form: FormData,
): Promise<AutoReplyRuleFormState> {
  const { orgId, userId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Invalid rule id." };

  const parsed = RuleSchema.safeParse(toShape(form));
  if (!parsed.success) {
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors: pickFieldErrors(parsed.error),
    };
  }
  const data = parsed.data;

  const establishmentIdToCheck = data.establishmentId;
  if (establishmentIdToCheck) {
    const owned = await withTenant(orgId, (tx) =>
      tx.establishment.count({
        where: { id: establishmentIdToCheck, deletedAt: null },
      }),
    );
    if (owned === 0) {
      return {
        error: "Establishment not found.",
        fieldErrors: { establishmentId: "Pick a listing you own or leave blank for org-wide." },
      };
    }
  }

  const updated = await withTenant(orgId, async (tx) => {
    const existing = await tx.autoReplyRule.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!existing) return null;
    const updated = await tx.autoReplyRule.update({
      where: { id },
      data: {
        establishmentId: data.establishmentId,
        name: data.name,
        enabled: data.enabled,
        matchMinRating: data.matchMinRating,
        matchMaxRating: data.matchMaxRating,
        matchKeywords: data.matchKeywords,
        matchSources: data.matchSources,
        action: data.action,
        delayMinutes: data.delayMinutes,
        replyTone: data.replyTone,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "auto_reply_rule.updated",
        resourceType: "auto_reply_rule",
        resourceId: id,
        afterData: {
          name: data.name,
          establishmentId: data.establishmentId,
          enabled: data.enabled,
          action: data.action,
        },
      },
    });
    return updated;
  });

  if (!updated) return { error: "Rule not found." };

  revalidatePath("/reviews/auto-reply");
  revalidatePath(`/reviews/auto-reply/${id}`);
  redirect("/reviews/auto-reply");
}

// ----- toggle -----

/**
 * Quick on/off toggle from the list page. Doesn't go through the validation
 * pipeline (no other fields are touched) so it's cheap and predictable.
 */
export async function toggleAutoReplyRule(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  const enable = form.get("enable") === "true";
  if (!isUuid(id)) return;

  await withTenant(orgId, async (tx) => {
    const r = await tx.autoReplyRule.findFirst({
      where: { id },
      select: { id: true, enabled: true },
    });
    if (!r) return;
    if (r.enabled === enable) return; // already in desired state, no-op
    await tx.autoReplyRule.update({
      where: { id },
      data: { enabled: enable },
    });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: enable ? "auto_reply_rule.enabled" : "auto_reply_rule.disabled",
        resourceType: "auto_reply_rule",
        resourceId: id,
      },
    });
  });

  revalidatePath("/reviews/auto-reply");
}

// ----- delete -----

export async function deleteAutoReplyRule(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return;

  await withTenant(orgId, async (tx) => {
    const r = await tx.autoReplyRule.findFirst({
      where: { id },
      select: { id: true, name: true },
    });
    if (!r) return;
    await tx.autoReplyRule.delete({ where: { id } });
    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        actorType: "user",
        actorId: userId,
        action: "auto_reply_rule.deleted",
        resourceType: "auto_reply_rule",
        resourceId: id,
        beforeData: { name: r.name },
      },
    });
  });

  logger.info({ orgId, ruleId: id, event: "auto_reply_rule.deleted" }, "auto-reply rule deleted");

  revalidatePath("/reviews/auto-reply");
  redirect("/reviews/auto-reply");
}

// ----- util -----

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID.test(s);
}

