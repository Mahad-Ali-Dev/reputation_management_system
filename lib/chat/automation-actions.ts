"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

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
