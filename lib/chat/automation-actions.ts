"use server";

// Server actions for the Inbox Automation rule-builder (Module 09) + the legacy
// chat-automation surface. Every export here is a client-callable server action.
//
// Pure helpers, consts, and types live in `./automation-shared` (a client-safe
// module) so that "use client" components can import them WITHOUT pulling Prisma
// into the client bundle.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { softInbox } from "@/lib/inbox/fail-soft";
import {
  type AutomationRuleView,
  newRuleKey,
  normalizeAiBehaviour,
  parseRuleForm,
} from "./automation-shared";

const Schema = z.object({
  ruleKey: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  message: z.string().min(1).max(2000),
  trigger: z.enum(["on_open", "after_seconds", "on_inactivity", "on_leave_intent"]),
  delaySeconds: z.coerce.number().int().min(0).max(3600).default(0),
  isActive: z.coerce.boolean().default(false),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return { orgId };
}

export async function upsertChatRule(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = Schema.safeParse({
    ruleKey: form.get("ruleKey"),
    name: form.get("name"),
    message: form.get("message"),
    trigger: form.get("trigger"),
    delaySeconds: form.get("delaySeconds") ?? 0,
    isActive: form.get("isActive") === "on",
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  const d = parsed.data;

  await withTenant(orgId, async (tx) => {
    const existing = await tx.chatAutomationRule.findFirst({
      where: { ruleKey: d.ruleKey },
    });
    if (existing) {
      await tx.chatAutomationRule.update({
        where: { id: existing.id },
        data: { ...d },
      });
    } else {
      await tx.chatAutomationRule.create({
        data: {
          organizationId: orgId,
          ruleKey: d.ruleKey,
          name: d.name,
          message: d.message,
          trigger: d.trigger,
          delaySeconds: d.delaySeconds,
          isActive: d.isActive,
        },
      });
    }
  });

  revalidatePath("/support/chat-automation");
}

export async function toggleChatRule(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    const cur = await tx.chatAutomationRule.findUnique({ where: { id } });
    if (!cur) return;
    await tx.chatAutomationRule.update({
      where: { id },
      data: { isActive: !cur.isActive },
    });
  });
  revalidatePath("/support/chat-automation");
}

// ===========================================================================
// Inbox Automations rule-builder (Module 09 — Inbox, deferred from Wave 3c).
//
// The Automation TAB of /support drives the same `ChatAutomationRule` rows as
// the legacy chat-automation surface, but exposes the channel-aware Wave-0 delta
// columns: `channels`, `triggerKeyword`, `aiBehaviour`, `fixedTemplate`,
// `maxRepliesPerConversation`, `escalateAfterTurns`.
//
// A rule answers: WHEN an inbound message arrives on one of the selected
// `channels`, matching either ALL messages or a `triggerKeyword`, HOW should the
// assistant respond —
//   • kb_reply           → answer from the AI knowledge base (default)
//   • fixed_template     → send a canned `fixedTemplate` reply (merge-tags ok)
//   • kb_then_escalate   → KB-answer, then hand to a human after N turns
// — bounded by `maxRepliesPerConversation` so the bot never loops a customer.
//
// Writes are Manager+ (RBAC), tenant-scoped (`withTenant`), audit-logged, and
// fail-soft on the pre-migration Postgres 42P01/42703 (the delta columns may not
// be applied yet — see lib/inbox/fail-soft).
//
// The pure form→columns mapping (`parseRuleForm`), the channel sanitizer, the
// behaviour normalizer, the consts/types, and `newRuleKey` live in
// `./automation-shared` so the client form/panel can import them safely.
// ===========================================================================

/**
 * Create or update an automation rule from the builder form (Manager+).
 * Tenant-scoped + audit-logged; fail-soft when the delta columns aren't migrated
 * yet (the write is a no-op rather than a 500 — the UI re-reads empty).
 */
export async function upsertAutomationRule(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const d = parseRuleForm(form); // validate BEFORE touching the DB (real errors surface)

  await softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const data = {
          name: d.name,
          // `message` is a NOT-NULL legacy column; mirror the effective reply text
          // so legacy readers still render something sensible.
          message: d.fixedTemplate ?? d.name,
          trigger: d.trigger,
          channels: d.channels,
          triggerKeyword: d.triggerKeyword,
          aiBehaviour: d.aiBehaviour,
          fixedTemplate: d.fixedTemplate,
          maxRepliesPerConversation: d.maxRepliesPerConversation,
          escalateAfterTurns: d.escalateAfterTurns,
          isActive: d.isActive,
        };

        if (d.id) {
          const existing = await tx.chatAutomationRule.findUnique({
            where: { id: d.id },
            select: { id: true },
          });
          if (!existing) return; // tenant-scoped row not found → no-op
          await tx.chatAutomationRule.update({ where: { id: d.id }, data });
          await tx.auditLog.create({
            data: {
              organizationId: orgId,
              actorType: "user",
              actorId: userId,
              action: "inbox.automation_rule.updated",
              resourceType: "chat_automation_rule",
              resourceId: d.id,
              afterData: {
                name: d.name,
                trigger: d.trigger,
                aiBehaviour: d.aiBehaviour,
                channels: d.channels,
                isActive: d.isActive,
              },
            },
          });
        } else {
          const created = await tx.chatAutomationRule.create({
            data: { organizationId: orgId, ruleKey: newRuleKey(), ...data },
            select: { id: true },
          });
          await tx.auditLog.create({
            data: {
              organizationId: orgId,
              actorType: "user",
              actorId: userId,
              action: "inbox.automation_rule.created",
              resourceType: "chat_automation_rule",
              resourceId: created.id,
              afterData: {
                name: d.name,
                trigger: d.trigger,
                aiBehaviour: d.aiBehaviour,
                channels: d.channels,
                isActive: d.isActive,
              },
            },
          });
        }
      }),
    undefined,
    { event: "inbox.automation.upsert.failed", swallowAll: false, context: { orgId } },
  );

  revalidatePath("/support");
}

/** Enable/disable a rule (Manager+). Fail-soft + audit-logged. */
export async function toggleAutomationRule(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const id = z.string().uuid().parse(form.get("id"));

  await softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const cur = await tx.chatAutomationRule.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        });
        if (!cur) return;
        await tx.chatAutomationRule.update({
          where: { id },
          data: { isActive: !cur.isActive },
        });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorType: "user",
            actorId: userId,
            action: "inbox.automation_rule.toggled",
            resourceType: "chat_automation_rule",
            resourceId: id,
            afterData: { isActive: !cur.isActive },
          },
        });
      }),
    undefined,
    { event: "inbox.automation.toggle.failed", swallowAll: true, context: { orgId } },
  );

  revalidatePath("/support");
}

/** Delete a rule (Manager+). Fail-soft + audit-logged. */
export async function deleteAutomationRule(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const id = z.string().uuid().parse(form.get("id"));

  await softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const cur = await tx.chatAutomationRule.findUnique({
          where: { id },
          select: { id: true, name: true },
        });
        if (!cur) return;
        await tx.chatAutomationRule.delete({ where: { id } });
        await tx.auditLog.create({
          data: {
            organizationId: orgId,
            actorType: "user",
            actorId: userId,
            action: "inbox.automation_rule.deleted",
            resourceType: "chat_automation_rule",
            resourceId: id,
            beforeData: { name: cur.name },
          },
        });
      }),
    undefined,
    { event: "inbox.automation.delete.failed", swallowAll: true, context: { orgId } },
  );

  revalidatePath("/support");
}

/**
 * Read all automation rules for the org as serialized views (newest first).
 * Server action for the Automation tab; fail-soft → [] when the delta columns
 * aren't migrated yet.
 *
 * SECURITY: takes NO arguments — under top-level "use server" every export is a
 * client-callable action, so the org MUST be derived from the session (never a
 * client-supplied id).
 */
export async function listAutomationRules(): Promise<AutomationRuleView[]> {
  const { orgId } = await requireOrg();
  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const rows = await tx.chatAutomationRule.findMany({
          orderBy: { updatedAt: "desc" },
          take: 200,
          select: {
            id: true,
            ruleKey: true,
            name: true,
            isActive: true,
            trigger: true,
            triggerKeyword: true,
            channels: true,
            aiBehaviour: true,
            fixedTemplate: true,
            maxRepliesPerConversation: true,
            escalateAfterTurns: true,
            updatedAt: true,
          },
        });
        return rows.map(
          (r): AutomationRuleView => ({
            id: r.id,
            ruleKey: r.ruleKey,
            name: r.name,
            isActive: r.isActive,
            // Older rows carry chat-greeting triggers (on_open, …) — only "keyword"
            // is meaningful in the builder; everything else reads as "all messages".
            trigger: r.trigger === "keyword" ? "keyword" : "all",
            triggerKeyword: r.triggerKeyword ?? null,
            channels: Array.isArray(r.channels) ? r.channels : [],
            aiBehaviour: normalizeAiBehaviour(r.aiBehaviour),
            fixedTemplate: r.fixedTemplate ?? null,
            maxRepliesPerConversation: r.maxRepliesPerConversation ?? 3,
            escalateAfterTurns: r.escalateAfterTurns ?? 0,
            updatedAt: r.updatedAt.toISOString(),
          }),
        );
      }),
    [],
    { event: "inbox.automation.list.failed", swallowAll: true, context: { orgId } },
  );
}
