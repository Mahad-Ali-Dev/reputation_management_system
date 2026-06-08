"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import {
  bulkResolveModerationItems,
  resolveModerationItem,
  type ResolveAction,
} from "@/lib/moderation/queue";
import { saveModerationConfig } from "@/lib/moderation/rules";

const Schema = z.object({
  keyword: z.string().min(1).max(120),
  matchMode: z.enum(["contains", "exact", "regex"]).default("contains"),
});

async function requireOrg() {
  const session = await auth();
  const orgId = (session as { orgId?: string } | null)?.orgId;
  if (!session || !orgId) redirect("/login");
  return { orgId };
}

export async function addBlacklistKeyword(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const parsed = Schema.safeParse({
    keyword: form.get("keyword"),
    matchMode: form.get("matchMode") ?? "contains",
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));

  await withTenant(orgId, async (tx) => {
    try {
      await tx.commentBlacklist.create({
        data: {
          organizationId: orgId,
          keyword: parsed.data.keyword.toLowerCase(),
          matchMode: parsed.data.matchMode,
        },
      });
    } catch (err) {
      // Unique constraint violation = already exists; silently no-op
      if (err instanceof Error && err.message.includes("Unique")) return;
      throw err;
    }
  });

  revalidatePath("/support");
}

export async function removeBlacklistKeyword(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    await tx.commentBlacklist.delete({ where: { id } });
  });
  revalidatePath("/support");
}

export async function toggleBlacklistKeyword(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    const cur = await tx.commentBlacklist.findUnique({ where: { id } });
    if (!cur) return;
    await tx.commentBlacklist.update({
      where: { id },
      data: { isActive: !cur.isActive },
    });
  });
  revalidatePath("/support");
}

// ---------------------------------------------------------------------------
// Moderation config + queue actions (Module 09 — Inbox, Wave 3c-A).
// The auto-hide-spam / block-profanity / flag-negativity toggles persist to
// Organization.settings.moderation (merge-on-write). DEFAULT action for the
// negativity rule is FLAG-FOR-REVIEW — only keyword + (opt-in) profanity rules
// auto-hide. Manager+ to write.
// ---------------------------------------------------------------------------

const ConfigSchema = z.object({
  enabled: z.coerce.boolean().default(true),
  blockProfanity: z.coerce.boolean().default(true),
  flagNegativity: z.coerce.boolean().default(true),
  autoHideSpam: z.coerce.boolean().default(false),
  negativityThreshold: z.coerce.number().min(0.1).max(1).default(0.7),
});

/** Persist the moderation config toggles (checkbox form → merge-on-write). */
export async function saveModerationConfigAction(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const parsed = ConfigSchema.parse({
    enabled: form.get("enabled") === "on",
    blockProfanity: form.get("blockProfanity") === "on",
    flagNegativity: form.get("flagNegativity") === "on",
    autoHideSpam: form.get("autoHideSpam") === "on",
    negativityThreshold: form.get("negativityThreshold") ?? 0.7,
  });
  await saveModerationConfig(orgId, parsed);
  revalidatePath("/support");
}

const RESOLVE_ACTIONS = new Set<ResolveAction>(["approve", "hide", "reply"]);

/** Resolve a single moderation queue item (approve / hide / reply). */
export async function resolveModerationItemAction(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const itemId = z.string().uuid().parse(form.get("itemId"));
  const action = String(form.get("action") ?? "");
  if (!RESOLVE_ACTIONS.has(action as ResolveAction)) {
    throw new Error("Invalid moderation action.");
  }
  await resolveModerationItem({ orgId, itemId, action: action as ResolveAction, userId });
  revalidatePath("/support");
}

/** Bulk-resolve queue items (comma-separated ids). */
export async function bulkResolveModerationAction(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const action = String(form.get("action") ?? "");
  if (!RESOLVE_ACTIONS.has(action as ResolveAction)) {
    throw new Error("Invalid moderation action.");
  }
  const itemIds = String(form.get("itemIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (itemIds.length === 0) return;
  await bulkResolveModerationItems({ orgId, itemIds, action: action as ResolveAction, userId });
  revalidatePath("/support");
}
