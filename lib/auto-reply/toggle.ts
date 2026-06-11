"use server";

import { ForbiddenError, requireRole } from "@/lib/auth/rbac";
import { assertEntitled, PlanInactiveError } from "@/lib/billing/entitlements";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { MANAGED_5STAR_RULE_NAME } from "./managed-rule";
import { AUTO_REPLY_RANDOMIZED_SENTINEL } from "./schedule";

/**
 * Page-level "Auto-Reply to 5-Star Reviews" toggle — the WRITE action.
 *
 * Backed by a single managed org-wide `AutoReplyRule` (reserved name; see
 * `./managed-rule.ts` for the constant + read path). Flipping the switch
 * upserts/flips that rule so the existing executor + publish-cron pipeline
 * drives it — there is no second timing/publish path to keep in sync.
 *
 * Compliance: the managed rule is 5★-ONLY (matchMinRating = matchMaxRating =
 * 5). We never auto-post anything ≤4★ — those always wait for a human.
 *
 * Auth: admin-or-owner (`requireRole("admin")`) + `assertEntitled` (auto-reply
 * spends AI budget — a paid feature). Mirrors the existing security posture.
 *
 * RESULT CONTRACT: returns `{ok}` / `{ok:false, error}` instead of throwing.
 * The old throwing version crashed the whole /reviews page with a digest when
 * the org wasn't entitled or the table wasn't migrated (bug 004 in the June
 * 2026 assessment) — entitlement/role/migration failures are expected states,
 * not exceptions.
 */
export type AutoReplyToggleResult = { ok: true; enabled: boolean } | { ok: false; error: string };

export async function setAutoReply5Star(form: FormData): Promise<AutoReplyToggleResult> {
  // The toggle island submits the DESIRED next state (computed `!current`).
  const enable = form.get("enable") === "true";

  try {
    const { orgId, userId } = await requireRole("admin");
    await assertEntitled(orgId);

    await withTenant(orgId, async (tx) => {
      const existing = await tx.autoReplyRule.findFirst({
        where: { name: MANAGED_5STAR_RULE_NAME, establishmentId: null },
        select: { id: true, enabled: true },
      });

      if (existing) {
        if (existing.enabled !== enable) {
          await tx.autoReplyRule.update({
            where: { id: existing.id },
            data: { enabled: enable },
          });
        }
      } else if (enable) {
        // Only materialize the rule on first enable. Creating a disabled managed
        // rule on the very first "off" submit would be pointless clutter.
        await tx.autoReplyRule.create({
          data: {
            organizationId: orgId,
            establishmentId: null,
            name: MANAGED_5STAR_RULE_NAME,
            enabled: true,
            matchMinRating: 5,
            matchMaxRating: 5,
            matchKeywords: [],
            matchSources: [],
            action: "auto_publish_after_delay",
            // Randomized 2–4h window — the executor reads this sentinel and
            // calls nextScheduledPublishAt() instead of a fixed delay.
            delayMinutes: AUTO_REPLY_RANDOMIZED_SENTINEL,
            replyTone: "warm",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: enable ? "auto_reply.5star.enabled" : "auto_reply.5star.disabled",
          resourceType: "auto_reply_rule",
          resourceId: existing?.id ?? orgId,
        },
      });
    });

    logger.info(
      { orgId, enabled: enable, event: "auto_reply.5star.toggled" },
      "5-star auto-reply toggle flipped",
    );

    revalidatePath("/reviews");
    revalidatePath("/reviews/auto-reply");
    return { ok: true, enabled: enable };
  } catch (err) {
    // Next.js control flow (requireRole's /login redirect) must propagate.
    const digest = (err as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;

    if (err instanceof PlanInactiveError) {
      return { ok: false, error: "Auto-reply is a paid feature — upgrade to enable it." };
    }
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Only workspace admins can change auto-reply." };
    }
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2021" || code === "P2022" || code === "42P01" || code === "42703") {
      return {
        ok: false,
        error: "Auto-reply isn't provisioned yet — ask your admin to apply the latest database migration.",
      };
    }
    logger.error(
      { event: "auto_reply.5star.toggle_failed", error: err instanceof Error ? err.message : String(err) },
      "5-star auto-reply toggle failed",
    );
    return { ok: false, error: "Could not update auto-reply. Try again." };
  }
}
