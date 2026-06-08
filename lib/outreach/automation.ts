/**
 * Automation Rules service (07_review_requests) — the only net-new backend engine.
 *
 * Model: `AutomationRule` (singleton per org+establishment+trigger). It links a
 * connected platform event (Shopify `orders/create`, etc.) to an automatic,
 * delayed, frequency-capped review request.
 *
 * ── Fail-soft (Postgres pre-migration) ──
 * `automation_rules` is a NEW table not migrated in this build. Every access
 * fail-softs on 42P01/42703 (treat as "no rule / not enabled") so deploying the
 * code before the migration can't 500 the hub or the webhook.
 *
 * ── FK correctness (verifier fix #1) ──
 * The rule's `templateId` IS a valid FK → `OutreachTemplate`. But the
 * `ReviewRequest` it schedules must NOT receive that id via `ReviewRequest.templateId`
 * (a FK → `ReviewRequestTemplate`). We pass the rule's OutreachTemplate id forward
 * out-of-band (the dispatch worker reloads the rule's template by id) and leave
 * `ReviewRequest.templateId` null. Send-time hydration is handled by the dispatch
 * cron via the row's resolution; for automation we render at send from the default
 * template path (templateId stays null on the request row).
 */

import { auth } from "@/lib/auth/config";
import { assertEntitled } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hasSmsConsent, isUnsubscribed } from "./suppression";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trigger values MUST match the DB CHECK constraint `automation_rules_trigger_chk`
 * (frozen Wave-0 migration): trigger IN ('review_request','post_purchase',
 * 'post_visit','shopify_order','square_sale','manual','negative_review',
 * 'positive_review'). We expose the two product triggers as `post_purchase`
 * (After Purchase) and `post_visit` (After Appointment) so an insert never
 * violates the CHECK on the live DB.
 */
export const TRIGGERS = ["post_purchase", "post_visit"] as const;
export type AutomationTrigger = (typeof TRIGGERS)[number];

/**
 * Provider values MUST match `automation_rules_provider_chk`: provider IS NULL OR
 * provider IN ('email','sms','both','shopify','square'). The connection platform
 * (shopify/woocommerce/hubspot) is only persisted when it's an allowed value;
 * otherwise we store NULL (provider isn't used for trigger matching).
 */
const ALLOWED_PROVIDERS = new Set(["email", "sms", "both", "shopify", "square"]);
function sanitizeProvider(p: string | undefined): string | null {
  return p && ALLOWED_PROVIDERS.has(p) ? p : null;
}

export type AutomationRuleView = {
  id: string | null;
  enabled: boolean;
  trigger: string;
  provider: string | null;
  delayHours: number;
  frequencyCapPerCustomer: number;
  frequencyCapWindowDays: number;
  templateId: string | null;
  aiPersonalize: boolean;
  establishmentId: string | null;
};

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022" || code === "42P01" || code === "42703";
}

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  const userId = session?.user?.id;
  if (!session || !orgId || !userId) redirect("/login");
  return { orgId, userId };
}

/**
 * Load all automation rules for an org (for the Automation tab). Fail-soft to
 * an empty list if the table isn't migrated yet.
 */
export async function listAutomationRules(orgId: string): Promise<AutomationRuleView[]> {
  try {
    const rows = await withTenant(orgId, (tx) =>
      tx.automationRule.findMany({ orderBy: { createdAt: "asc" } }),
    );
    return rows.map((r) => ({
      id: r.id,
      enabled: r.enabled,
      trigger: r.trigger,
      provider: r.provider,
      delayHours: r.delayHours,
      frequencyCapPerCustomer: r.frequencyCapPerCustomer,
      frequencyCapWindowDays: r.frequencyCapWindowDays,
      templateId: r.templateId,
      aiPersonalize: r.aiPersonalize,
      establishmentId: r.establishmentId,
    }));
  } catch (err) {
    if (isMissingRelation(err)) return [];
    throw err;
  }
}

/**
 * Read the single rule for an org+establishment+trigger (null if none / table
 * not ready).
 */
export async function getAutomationRule(
  orgId: string,
  trigger: string,
  establishmentId?: string | null,
): Promise<AutomationRuleView | null> {
  try {
    const row = await withTenant(orgId, (tx) =>
      tx.automationRule.findFirst({
        where: { trigger, establishmentId: establishmentId ?? null },
      }),
    );
    if (!row) return null;
    return {
      id: row.id,
      enabled: row.enabled,
      trigger: row.trigger,
      provider: row.provider,
      delayHours: row.delayHours,
      frequencyCapPerCustomer: row.frequencyCapPerCustomer,
      frequencyCapWindowDays: row.frequencyCapWindowDays,
      templateId: row.templateId,
      aiPersonalize: row.aiPersonalize,
      establishmentId: row.establishmentId,
    };
  } catch (err) {
    if (isMissingRelation(err)) return null;
    throw err;
  }
}

const UpsertSchema = z.object({
  enabled: z.coerce.boolean().optional().default(false),
  trigger: z.enum(TRIGGERS),
  provider: z.string().max(40).optional(),
  delayHours: z.coerce.number().int().min(0).max(720).default(72),
  frequencyCapPerCustomer: z.coerce.number().int().min(1).max(20).default(1),
  frequencyCapWindowDays: z.coerce.number().int().min(1).max(365).default(30),
  templateId: z.string().uuid().optional(),
  aiPersonalize: z.coerce.boolean().optional().default(false),
  establishmentId: z.string().uuid().optional(),
});

/**
 * Server action: create/update an automation rule. Pro-gated (sends incur cost).
 * Fail-soft if the table isn't migrated — surfaces a friendly error instead of a
 * 500, so the UI can show "Automation requires the latest deploy".
 */
export async function upsertAutomationRule(form: FormData): Promise<void> {
  const { orgId, userId } = await requireOrg();
  await assertEntitled(orgId);

  const parsed = UpsertSchema.safeParse({
    enabled: form.get("enabled") === "on",
    trigger: form.get("trigger"),
    provider: (form.get("provider") as string) || undefined,
    delayHours: form.get("delayHours") ?? 72,
    frequencyCapPerCustomer: form.get("frequencyCapPerCustomer") ?? 1,
    frequencyCapWindowDays: form.get("frequencyCapWindowDays") ?? 30,
    templateId: (form.get("templateId") as string) || undefined,
    aiPersonalize: form.get("aiPersonalize") === "on",
    establishmentId: (form.get("establishmentId") as string) || undefined,
  });
  if (!parsed.success) {
    throw new Error(`Validation: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  const d = parsed.data;
  const provider = sanitizeProvider(d.provider);

  const establishmentId = d.establishmentId ?? null;
  try {
    await withTenant(orgId, async (tx) => {
      // Manual upsert (not `tx.automationRule.upsert`): the composite unique
      // `@@unique([organizationId, establishmentId, trigger])` has a NULLABLE
      // `establishmentId`, so Prisma's generated `…_establishmentId_trigger`
      // WhereUniqueInput types that field as non-null and an org-wide rule
      // (establishmentId = null) can't be targeted through it. Find-then-
      // update/create on a regular `where` handles the null case correctly.
      const existing = await tx.automationRule.findFirst({
        where: { organizationId: orgId, establishmentId, trigger: d.trigger },
        select: { id: true },
      });
      if (existing) {
        await tx.automationRule.update({
          where: { id: existing.id },
          data: {
            enabled: d.enabled,
            provider,
            delayHours: d.delayHours,
            frequencyCapPerCustomer: d.frequencyCapPerCustomer,
            frequencyCapWindowDays: d.frequencyCapWindowDays,
            templateId: d.templateId ?? null,
            aiPersonalize: d.aiPersonalize,
          },
        });
      } else {
        await tx.automationRule.create({
          data: {
            organizationId: orgId,
            establishmentId,
            enabled: d.enabled,
            trigger: d.trigger,
            provider,
            delayHours: d.delayHours,
            frequencyCapPerCustomer: d.frequencyCapPerCustomer,
            frequencyCapWindowDays: d.frequencyCapWindowDays,
            templateId: d.templateId ?? null,
            aiPersonalize: d.aiPersonalize,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "automation_rule.upserted",
          resourceType: "automation_rule",
          afterData: { trigger: d.trigger, enabled: d.enabled, delayHours: d.delayHours },
        },
      });
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      throw new Error(
        "Automation isn't available yet on this deploy. Apply the latest database migration to enable it.",
      );
    }
    throw err;
  }

  revalidatePath("/outreach");
}

export type EvaluateArgs = {
  orgId: string;
  trigger: AutomationTrigger;
  /** Email or phone the request will be sent to. */
  recipient: string;
  recipientName?: string | null;
  /** The location this event maps to (optional — null rule matches org-wide). */
  establishmentId?: string | null;
};

export type EvaluateResult =
  | { scheduled: true; reviewRequestId: string; scheduledFor: Date }
  | { skipped: "no_rule" | "frequency_cap" | "unsubscribed" | "no_consent" | "bad_recipient" | "no_establishment" | "table_not_ready" };

/**
 * The shared entry the webhook adapters call when a connected platform fires.
 *
 * 1. Load the matching ENABLED rule for org+trigger; none/disabled → no_rule.
 * 2. Frequency cap: count this recipient's requests in the window; at/over cap
 *    → frequency_cap.
 * 3. Suppression: unsubscribed (and SMS consent) → unsubscribed/no_consent.
 * 4. Insert a `ReviewRequest` (status:"scheduled", scheduledFor = now+delayHours,
 *    triggerSource:"automation", templateId:null — see FK note above). The
 *    dispatch cron then sends it.
 *
 * NO external/paid calls here — the only side effect is enqueuing a row.
 */
export async function evaluateTrigger(args: EvaluateArgs): Promise<EvaluateResult> {
  // Channel inference from the recipient shape (E.164 → sms, else email).
  const channel: "sms" | "email" = PHONE_RE.test(args.recipient) ? "sms" : "email";
  if (channel === "email" && !EMAIL_RE.test(args.recipient)) {
    return { skipped: "bad_recipient" };
  }

  let rule: {
    id: string;
    enabled: boolean;
    delayHours: number;
    frequencyCapPerCustomer: number;
    frequencyCapWindowDays: number;
    establishmentId: string | null;
  } | null;
  try {
    rule = await withTenant(args.orgId, (tx) =>
      tx.automationRule.findFirst({
        where: { trigger: args.trigger, enabled: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          enabled: true,
          delayHours: true,
          frequencyCapPerCustomer: true,
          frequencyCapWindowDays: true,
          establishmentId: true,
        },
      }),
    );
  } catch (err) {
    if (isMissingRelation(err)) return { skipped: "table_not_ready" };
    throw err;
  }
  if (!rule || !rule.enabled) return { skipped: "no_rule" };
  // Capture into a const so the value stays non-null inside the closure below
  // (control-flow narrowing of a mutable `let` is lost across closures).
  const activeRule = rule;

  // Resolve the establishment to attach the request to: the rule's, else the
  // event's, else the org's first active establishment.
  const establishmentId = activeRule.establishmentId ?? args.establishmentId ?? null;

  // Suppression: never schedule for an unsubscribed recipient.
  if (await isUnsubscribed({ channel, recipient: args.recipient, organizationId: args.orgId })) {
    return { skipped: "unsubscribed" };
  }
  if (channel === "sms") {
    const consent = await hasSmsConsent({ organizationId: args.orgId, phoneE164: args.recipient });
    if (!consent) return { skipped: "no_consent" };
  }

  const now = Date.now();
  const windowStart = new Date(now - activeRule.frequencyCapWindowDays * 24 * 60 * 60 * 1000);

  const result = await withTenant(args.orgId, async (tx) => {
    // Frequency cap — count recent requests to this recipient.
    const recentCount = await tx.reviewRequest.count({
      where: { recipient: args.recipient, createdAt: { gte: windowStart } },
    });
    if (recentCount >= activeRule.frequencyCapPerCustomer) {
      return { kind: "frequency_cap" as const };
    }

    // Need a concrete establishment (FK is NOT NULL on ReviewRequest).
    const estId =
      establishmentId ??
      (
        await tx.establishment.findFirst({
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      )?.id ??
      null;
    if (!estId) return { kind: "no_establishment" as const };

    const scheduledFor = new Date(now + activeRule.delayHours * 60 * 60 * 1000);
    const created = await tx.reviewRequest.create({
      data: {
        organizationId: args.orgId,
        establishmentId: estId,
        channel,
        recipient: args.recipient,
        recipientName: args.recipientName ?? null,
        scheduledFor,
        status: "scheduled",
        triggerSource: "automation",
        // FK correctness: do NOT set templateId from the rule's OutreachTemplate.
        // ReviewRequest.templateId is a ReviewRequestTemplate FK. Leave null;
        // dispatch renders from the default body.
      },
    });
    return { kind: "scheduled" as const, id: created.id, scheduledFor };
  });

  if (result.kind === "frequency_cap") return { skipped: "frequency_cap" };
  if (result.kind === "no_establishment") return { skipped: "no_establishment" };

  logger.info({
    orgId: args.orgId,
    trigger: args.trigger,
    reviewRequestId: result.id,
    event: "automation.scheduled",
  });
  return { scheduled: true, reviewRequestId: result.id, scheduledFor: result.scheduledFor };
}
