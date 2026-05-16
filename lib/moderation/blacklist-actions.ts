"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { withTenant } from "@/lib/db/with-tenant";

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

  revalidatePath("/support/blacklist");
}

export async function removeBlacklistKeyword(form: FormData): Promise<void> {
  const { orgId } = await requireOrg();
  const id = z.string().uuid().parse(form.get("id"));
  await withTenant(orgId, async (tx) => {
    await tx.commentBlacklist.delete({ where: { id } });
  });
  revalidatePath("/support/blacklist");
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
  revalidatePath("/support/blacklist");
}
