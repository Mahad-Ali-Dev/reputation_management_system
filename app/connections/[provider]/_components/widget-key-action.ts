"use server";

/**
 * Generate a live-chat widget key from the Connections manage route (module
 * 14_connections — completeness pass).
 *
 * The Live Chat widget surfaces in TWO places: the inbox's Live Chat settings
 * (`lib/inbox/widget-actions.ts#generateWidgetKey`, which revalidates /support)
 * and the Connections `/connections/website_widget` detail. This co-located
 * action mirrors that mutator exactly — same key shape, same audit action — but
 * revalidates the connections route so the embed snippet appears in place.
 *
 * RBAC-gated (manager+), tenant-scoped via `withTenant`, audit-logged, and
 * FAIL-SOFT: a pre-migration deploy (missing `widget_keys` table / `ai_mode`
 * column) degrades to a logged no-op + redirect rather than a 500. No paid or
 * external API is touched.
 */

import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function generateWidgetKeyForConnections(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  // The detail page only renders this form for the widget provider, but accept
  // the posted provider to keep the redirect path correct (defaults to the
  // canonical website_widget tile).
  const providerRaw = String(form.get("provider") ?? "website_widget").trim();
  const provider = /^[a-z0-9_]+$/.test(providerRaw) ? providerRaw : "website_widget";

  const origins = String(form.get("originAllowlist") ?? "")
    .split(/[\s,]+/)
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && /^https?:\/\//.test(o))
    .slice(0, 50);

  const publicKey = `wk_${randomBytes(16).toString("base64url")}`;
  const hmacSecret = randomBytes(32).toString("base64url");

  let ok = true;
  try {
    await withTenant(orgId, async (tx) => {
      const created = await tx.widgetKey.create({
        data: { organizationId: orgId, publicKey, hmacSecret, originAllowlist: origins },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "ai.widget_key.created",
          resourceType: "widget_key",
          resourceId: created.id,
          afterData: { origins, via: "connections_widget_detail" },
        },
      });
    });
  } catch (err) {
    ok = false;
    logger.warn({
      event: "connections.widget.generateKey.failed",
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const path = `/connections/${provider}`;
  revalidatePath(path);
  redirect(ok ? path : `${path}?error=not_migrated`);
}
