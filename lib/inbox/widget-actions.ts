"use server";

/**
 * Live-chat Widget + SMS-handoff — SERVER ACTIONS (Module 09 — Inbox, Wave 3c-B).
 *
 * Split from `lib/inbox/widget.ts` (which carries pure helpers/types the server
 * panels read) because the client islands (`widget-settings.tsx`,
 * `sms-handoff.tsx`) import these mutators directly — Next.js only lets a Client
 * Component import Server Actions from a module with a TOP-LEVEL "use server"
 * directive, which a module exporting sync helpers can't have.
 *
 * Everything is `withTenant` + RBAC-gated (manager+) + fail-soft via the widget
 * lib. Provisioning + handoff are additionally entitlement-gated (Pro) and
 * env-gated (Twilio) inside their lib functions.
 */

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/rbac";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { provisionHandoffNumber } from "@/lib/phone/provision-number";
import { startSmsHandoff } from "./sms-handoff";
import {
  saveWidgetConfig,
  setWidgetKeyAiMode,
  updateWidgetKeyOrigins,
  type BusinessHours,
  type WidgetAiMode,
} from "./widget";

const AI_MODES = new Set<WidgetAiMode>(["always_on", "after_hours", "ai_human_handoff"]);

/** Save the Customize sub-tab (appearance + presence). */
export async function saveWidgetAppearance(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const brandColor = sanitizeColor(String(form.get("brandColor") ?? ""));
  const headerText = clip(String(form.get("headerText") ?? ""), 80);
  const greeting = clip(String(form.get("greeting") ?? ""), 500);
  const position = String(form.get("position") ?? "bottom-right");
  const agentPresence = String(form.get("agentPresence") ?? "online") === "away" ? "away" : "online";

  await saveWidgetConfig({
    orgId,
    ...(brandColor ? { brandColor } : {}),
    ...(headerText ? { headerText } : {}),
    ...(greeting ? { greeting } : {}),
    position: position === "bottom-left" ? "bottom-left" : "bottom-right",
    agentPresence,
  });
  revalidatePath("/support");
}

/** Save the AI Settings sub-tab (aiMode + escalation + SMS toggle + hours). */
export async function saveWidgetAiSettings(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");

  const aiModeRaw = String(form.get("aiMode") ?? "always_on");
  const aiMode: WidgetAiMode = AI_MODES.has(aiModeRaw as WidgetAiMode)
    ? (aiModeRaw as WidgetAiMode)
    : "always_on";

  const escalateAfterTurns = clampInt(form.get("escalateAfterTurns"), 0, 50, 6);
  const smsHandoffEnabled = form.get("smsHandoffEnabled") === "on";

  const businessHours = parseBusinessHours(form);

  await saveWidgetConfig({
    orgId,
    escalateAfterTurns,
    smsHandoffEnabled,
    businessHours,
  });

  // aiMode lives on the WidgetKey — apply to the org's primary key if any.
  const keyId = String(form.get("widgetKeyId") ?? "");
  if (keyId) {
    await setWidgetKeyAiMode({ orgId, keyId, aiMode });
  }

  revalidatePath("/support");
}

/** Update the Deploy sub-tab origin allowlist for a key. */
export async function saveWidgetOrigins(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const keyId = String(form.get("widgetKeyId") ?? "");
  if (!keyId) return;
  const origins = String(form.get("originAllowlist") ?? "")
    .split(/[\s,]+/)
    .map((o) => o.trim())
    .filter(Boolean);
  await updateWidgetKeyOrigins({ orgId, keyId, origins });
  revalidatePath("/support");
}

/**
 * Generate a widget key for the org (Deploy tab "Generate widget key"). Mirrors
 * `createWidgetKey` (lib/ai/actions.ts) but revalidates /support + accepts the
 * origins from the inbox UI. Fail-soft.
 */
export async function generateWidgetKey(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");
  const origins = String(form.get("originAllowlist") ?? "")
    .split(/[\s,]+/)
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && /^https?:\/\//.test(o))
    .slice(0, 50);

  const publicKey = `wk_${randomBytes(16).toString("base64url")}`;
  const hmacSecret = randomBytes(32).toString("base64url");

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
        afterData: { origins, via: "inbox_widget_tab" },
      },
    });
  }).catch((err) => {
    logger.warn({
      event: "inbox.widget.generateKey.failed",
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  revalidatePath("/support");
}

/**
 * Provision (or reuse) a handoff number for the SMS tab. Entitlement + env gated
 * inside `provisionHandoffNumber`. Returns nothing (UI re-reads from the server);
 * surfaces the reason via the audit log + revalidate.
 */
export async function provisionHandoffNumberAction(form: FormData): Promise<void> {
  const { orgId, userId } = await requireRole("manager");

  // Pro gate (provisioning incurs monthly cost). Non-Pro → no-op (UI shows upsell).
  if (!(await isOrgEntitled(orgId))) {
    logger.info({ event: "inbox.widget.provision.not_entitled", orgId });
    return;
  }

  const areaCode = String(form.get("areaCode") ?? "").trim() || undefined;
  const result = await provisionHandoffNumber({ orgId, areaCode });

  // Also enable SMS handoff on the config when a number is now available.
  if (result.provisioned) {
    await saveWidgetConfig({ orgId, smsHandoffEnabled: true });
    await withTenant(orgId, async (tx) => {
      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorType: "user",
          actorId: userId,
          action: "inbox.handoff_number.provisioned",
          resourceType: "phone_number",
          resourceId: result.phoneNumberId,
          afterData: { phoneE164: result.phoneE164, reused: result.reused },
        },
      });
    }).catch(() => {});
  } else {
    logger.warn({ event: "inbox.widget.provision.failed", orgId, reason: result.reason });
  }

  revalidatePath("/support");
}

/**
 * Agent "Move to SMS" action (from the customer panel / SMS tab). Starts an SMS
 * handoff for an existing conversation given a phone number.
 */
export async function moveConversationToSms(form: FormData): Promise<void> {
  const { orgId } = await requireRole("manager");
  const phone = String(form.get("phone") ?? "").trim();
  const conversationId = String(form.get("conversationId") ?? "").trim() || null;
  const fromThreadId = String(form.get("threadId") ?? "").trim() || null;
  if (!phone) return;

  await startSmsHandoff({
    orgId,
    visitorPhone: phone,
    conversationId,
    fromThreadId,
  });

  revalidatePath("/support");
}

/* ---------------------------------- utils --------------------------------- */

function clip(s: string, max: number): string {
  return s.trim().slice(0, max);
}

function sanitizeColor(v: string): string | null {
  const t = v.trim();
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : null;
}

function clampInt(raw: FormDataEntryValue | null, min: number, max: number, fallback: number): number {
  const n = Number(String(raw ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

/**
 * Parse business hours from the AI settings form. Each day has `hours_<day>_open`
 * and `hours_<day>_close` HH:MM inputs + a `hours_<day>_enabled` checkbox. Absent
 * inputs → no schedule (null = always open).
 */
function parseBusinessHours(form: FormData): BusinessHours | null {
  const tz = String(form.get("hoursTz") ?? "").trim();
  let any = false;
  const days: BusinessHours["days"] = {};
  for (const d of DAYS) {
    const enabled = form.get(`hours_${d}_enabled`) === "on";
    if (!enabled) {
      days[d] = null;
      continue;
    }
    const open = String(form.get(`hours_${d}_open`) ?? "").trim();
    const close = String(form.get(`hours_${d}_close`) ?? "").trim();
    if (/^\d{1,2}:\d{2}$/.test(open) && /^\d{1,2}:\d{2}$/.test(close)) {
      days[d] = [open, close];
      any = true;
    } else {
      days[d] = null;
    }
  }
  if (!any && !tz) return null;
  return { ...(tz ? { tz } : {}), days };
}
