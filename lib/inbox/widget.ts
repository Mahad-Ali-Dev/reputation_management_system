/**
 * Live-chat widget configuration helpers (Module 09, Wave 3c — phase 3).
 *
 * One place to read/write the per-org `WidgetConfig` (appearance + AI mode +
 * SMS-handoff settings) and to compute the derived facts the bootstrap/converse
 * routes + the settings UI all need:
 *   - the visitor-facing `WidgetAppearance` (brand color, header, greeting,
 *     position, agent presence)
 *   - whether the AI should answer right now vs. defer to a human / capture a
 *     phone for SMS handoff (`resolveWidgetMode`) — driven by `WidgetKey.aiMode`
 *     + `WidgetConfig.businessHours`
 *   - the embed `<script>` snippet for the Deploy tab
 *
 * EVERYTHING is fail-soft (`softInbox`): the `widget_configs` table + the
 * `widget_keys.ai_mode` column ship via the Wave-0 delta but are applied by the
 * founder as a manual migrate step, so touching them before the migration must
 * degrade to sane defaults (never 500 the inbox or, worse, break the deployed
 * widget bootstrap). Defaults here preserve today's always-on behaviour.
 *
 * Pure config logic (no React) so it imports cleanly into both server routes and
 * server components.
 */

import type { Prisma } from "@prisma/client";
import { withTenant } from "@/lib/db/with-tenant";
import { softInbox } from "./fail-soft";

/** Visitor-facing widget appearance — what bootstrap returns + the preview shows. */
export type WidgetAppearance = {
  brandColor: string;
  headerText: string;
  greeting: string;
  avatarUrl: string | null;
  position: string; // bottom-right | bottom-left
  agentPresence: string; // online | away
};

/** Full config view (appearance + AI/handoff settings) for the settings UI. */
export type WidgetConfigView = WidgetAppearance & {
  escalateAfterTurns: number;
  smsHandoffEnabled: boolean;
  businessHours: BusinessHours | null;
};

/** The widget's AI behaviour mode (mirrors WidgetKey.aiMode). */
export type WidgetAiMode = "always_on" | "after_hours" | "ai_human_handoff";

/**
 * Business-hours window, reusing the `PhoneAssistant.businessHours` JSON shape:
 *   { tz: "America/New_York", days: { mon: ["09:00","17:00"], ... } }
 * A missing/blank day → closed that day. Absent config → treated as always open.
 */
export type DayWindow = [string, string] | null;
export type BusinessHours = {
  tz?: string;
  days?: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayWindow>>;
};

export const WIDGET_DEFAULTS: WidgetConfigView = {
  brandColor: "#4f46e5",
  headerText: "Chat with us",
  greeting: "Hi! How can I help you today?",
  avatarUrl: null,
  position: "bottom-right",
  agentPresence: "online",
  escalateAfterTurns: 6,
  smsHandoffEnabled: false,
  businessHours: null,
};

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function coerceBusinessHours(raw: unknown): BusinessHours | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: BusinessHours = {};
  if (typeof obj.tz === "string") out.tz = obj.tz;
  if (obj.days && typeof obj.days === "object") {
    out.days = obj.days as BusinessHours["days"];
  }
  return out;
}

/**
 * Read the org's WidgetConfig, falling back to defaults for any missing field /
 * the whole row / a not-yet-migrated table. Never throws.
 */
export async function getWidgetConfig(orgId: string): Promise<WidgetConfigView> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const row = await tx.widgetConfig.findUnique({
          where: { organizationId: orgId },
          select: {
            brandColor: true,
            headerText: true,
            greeting: true,
            avatarUrl: true,
            position: true,
            agentPresence: true,
            escalateAfterTurns: true,
            smsHandoffEnabled: true,
            businessHours: true,
          },
        });
        if (!row) return { ...WIDGET_DEFAULTS };
        return {
          brandColor: row.brandColor || WIDGET_DEFAULTS.brandColor,
          headerText: row.headerText || WIDGET_DEFAULTS.headerText,
          greeting: row.greeting || WIDGET_DEFAULTS.greeting,
          avatarUrl: row.avatarUrl ?? null,
          position: row.position || WIDGET_DEFAULTS.position,
          agentPresence: row.agentPresence || WIDGET_DEFAULTS.agentPresence,
          escalateAfterTurns:
            typeof row.escalateAfterTurns === "number"
              ? row.escalateAfterTurns
              : WIDGET_DEFAULTS.escalateAfterTurns,
          smsHandoffEnabled: Boolean(row.smsHandoffEnabled),
          businessHours: coerceBusinessHours(row.businessHours),
        } satisfies WidgetConfigView;
      }),
    { ...WIDGET_DEFAULTS },
    { event: "inbox.widget.getConfig.failed", swallowAll: true, context: { orgId } },
  );
}

/** Narrow a config view to just the visitor-facing appearance. */
export function toAppearance(cfg: WidgetConfigView): WidgetAppearance {
  return {
    brandColor: cfg.brandColor,
    headerText: cfg.headerText,
    greeting: cfg.greeting,
    avatarUrl: cfg.avatarUrl,
    position: cfg.position,
    agentPresence: cfg.agentPresence,
  };
}

export type SaveWidgetConfigInput = {
  orgId: string;
  brandColor?: string;
  headerText?: string;
  greeting?: string;
  avatarUrl?: string | null;
  position?: string;
  agentPresence?: string;
  escalateAfterTurns?: number;
  smsHandoffEnabled?: boolean;
  businessHours?: BusinessHours | null;
};

/**
 * Upsert the org's WidgetConfig. Only provided fields are written (partial
 * update). Fail-soft → returns false when not migrated. The PK is the org id, so
 * this is a natural singleton.
 */
export async function saveWidgetConfig(input: SaveWidgetConfigInput): Promise<boolean> {
  return softInbox(
    () =>
      withTenant(input.orgId, async (tx) => {
        const data: Prisma.WidgetConfigUncheckedCreateInput = {
          organizationId: input.orgId,
          // create needs a greeting (no DB default); use the global default.
          greeting: input.greeting ?? WIDGET_DEFAULTS.greeting,
        };
        if (input.brandColor !== undefined) data.brandColor = input.brandColor;
        if (input.headerText !== undefined) data.headerText = input.headerText;
        if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
        if (input.position !== undefined) data.position = input.position;
        if (input.agentPresence !== undefined) data.agentPresence = input.agentPresence;
        if (input.escalateAfterTurns !== undefined)
          data.escalateAfterTurns = input.escalateAfterTurns;
        if (input.smsHandoffEnabled !== undefined)
          data.smsHandoffEnabled = input.smsHandoffEnabled;
        if (input.businessHours !== undefined)
          data.businessHours = (input.businessHours as Prisma.InputJsonValue) ?? undefined;

        const update: Prisma.WidgetConfigUncheckedUpdateInput = {};
        if (input.brandColor !== undefined) update.brandColor = input.brandColor;
        if (input.headerText !== undefined) update.headerText = input.headerText;
        if (input.greeting !== undefined) update.greeting = input.greeting;
        if (input.avatarUrl !== undefined) update.avatarUrl = input.avatarUrl;
        if (input.position !== undefined) update.position = input.position;
        if (input.agentPresence !== undefined) update.agentPresence = input.agentPresence;
        if (input.escalateAfterTurns !== undefined)
          update.escalateAfterTurns = input.escalateAfterTurns;
        if (input.smsHandoffEnabled !== undefined)
          update.smsHandoffEnabled = input.smsHandoffEnabled;
        if (input.businessHours !== undefined)
          update.businessHours = (input.businessHours as Prisma.InputJsonValue) ?? undefined;

        await tx.widgetConfig.upsert({
          where: { organizationId: input.orgId },
          create: data,
          update,
        });
        return true;
      }),
    false,
    { event: "inbox.widget.saveConfig.failed", context: { orgId: input.orgId } },
  );
}

/* -------------------------------------------------------------------------- */
/* WidgetKey + aiMode                                                          */
/* -------------------------------------------------------------------------- */

export type WidgetKeySummary = {
  id: string;
  publicKey: string;
  originAllowlist: string[];
  status: string;
  aiMode: WidgetAiMode;
};

const AI_MODES: readonly WidgetAiMode[] = ["always_on", "after_hours", "ai_human_handoff"];
function coerceAiMode(v: unknown): WidgetAiMode {
  return (AI_MODES as readonly string[]).includes(v as string)
    ? (v as WidgetAiMode)
    : "always_on";
}

/**
 * The org's primary (most recent active) widget key, if any. Reads `aiMode`
 * fail-soft (column may not be migrated → defaults to always_on).
 */
export async function getPrimaryWidgetKey(orgId: string): Promise<WidgetKeySummary | null> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const row = await tx.widgetKey.findFirst({
          where: { status: "active" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            publicKey: true,
            originAllowlist: true,
            status: true,
            aiMode: true,
          },
        });
        if (!row) return null;
        return {
          id: row.id,
          publicKey: row.publicKey,
          originAllowlist: row.originAllowlist ?? [],
          status: row.status,
          aiMode: coerceAiMode((row as { aiMode?: unknown }).aiMode),
        } satisfies WidgetKeySummary;
      }),
    null,
    { event: "inbox.widget.getKey.failed", swallowAll: true, context: { orgId } },
  );
}

/** Update a widget key's origin allowlist. Fail-soft. */
export async function updateWidgetKeyOrigins(args: {
  orgId: string;
  keyId: string;
  origins: string[];
}): Promise<boolean> {
  const origins = args.origins
    .map((o) => o.trim())
    .filter((o) => o.length > 0 && /^https?:\/\//.test(o))
    .slice(0, 50);
  return softInbox(
    () =>
      withTenant(args.orgId, async (tx) => {
        const r = await tx.widgetKey.updateMany({
          where: { id: args.keyId },
          data: { originAllowlist: origins },
        });
        return r.count > 0;
      }),
    false,
    { event: "inbox.widget.updateOrigins.failed", context: { orgId: args.orgId } },
  );
}

/** Set a widget key's AI mode. Fail-soft (column may be pre-migration). */
export async function setWidgetKeyAiMode(args: {
  orgId: string;
  keyId: string;
  aiMode: WidgetAiMode;
}): Promise<boolean> {
  return softInbox(
    () =>
      withTenant(args.orgId, async (tx) => {
        const r = await tx.widgetKey.updateMany({
          where: { id: args.keyId },
          data: { aiMode: args.aiMode },
        });
        return r.count > 0;
      }),
    false,
    { event: "inbox.widget.setAiMode.failed", context: { orgId: args.orgId } },
  );
}

/* -------------------------------------------------------------------------- */
/* Mode resolution (used by bootstrap + converse)                             */
/* -------------------------------------------------------------------------- */

/**
 * What the widget should do for the next visitor turn:
 *   - "ai"          → answer with the RAG bot (default / always_on, or in-hours)
 *   - "capture"     → don't auto-answer; ask the visitor to leave a phone so we
 *                     can text them (after-hours or AI+human handoff)
 * `offerSmsHandoff` is true whenever the config has SMS handoff enabled AND the
 * resolution is "capture" (the widget shows the phone-capture affordance).
 */
export type WidgetModeResolution = {
  decision: "ai" | "capture";
  reason: "always_on" | "after_hours_open" | "after_hours_closed" | "human_handoff";
  offerSmsHandoff: boolean;
};

/**
 * Resolve the widget mode from the key's aiMode + config business hours.
 *
 *   always_on        → always "ai".
 *   after_hours      → "ai" during business hours; "capture" outside them.
 *   ai_human_handoff → always "capture" (a human/SMS path is preferred).
 *
 * When business hours are absent we treat the org as ALWAYS OPEN (so after_hours
 * behaves like always_on rather than silently capturing 24/7).
 */
export function resolveWidgetMode(args: {
  aiMode: WidgetAiMode;
  config: Pick<WidgetConfigView, "businessHours" | "smsHandoffEnabled">;
  now?: Date;
}): WidgetModeResolution {
  const { aiMode, config } = args;
  if (aiMode === "always_on") {
    return { decision: "ai", reason: "always_on", offerSmsHandoff: false };
  }
  if (aiMode === "ai_human_handoff") {
    return {
      decision: "capture",
      reason: "human_handoff",
      offerSmsHandoff: config.smsHandoffEnabled,
    };
  }
  // after_hours
  const open = isWithinBusinessHours(config.businessHours, args.now ?? new Date());
  if (open) {
    return { decision: "ai", reason: "after_hours_open", offerSmsHandoff: false };
  }
  return {
    decision: "capture",
    reason: "after_hours_closed",
    offerSmsHandoff: config.smsHandoffEnabled,
  };
}

/**
 * Is `now` inside the configured business-hours window? Absent config → open.
 * Times are "HH:MM" 24h in the config tz; we approximate tz handling by reading
 * the local parts via Intl when a tz is present, else server-local.
 */
export function isWithinBusinessHours(hours: BusinessHours | null, now: Date): boolean {
  if (!hours || !hours.days) return true; // no schedule → always open
  let dayIdx = now.getDay();
  let minutes = now.getHours() * 60 + now.getMinutes();
  if (hours.tz) {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: hours.tz,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = fmt.formatToParts(now);
      const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
      const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
      const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
      const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      if (wd in map) dayIdx = map[wd]!;
      // Intl hour can be "24" at midnight in some locales; clamp.
      minutes = ((hh % 24) || 0) * 60 + (Number.isFinite(mm) ? mm : 0);
    } catch {
      /* bad tz → fall through to server-local */
    }
  }
  const dayKey = DAY_KEYS[dayIdx]!;
  const window = hours.days[dayKey];
  if (!window || !Array.isArray(window) || window.length !== 2) return false; // closed today
  const [start, end] = window;
  const s = parseHm(start);
  const e = parseHm(end);
  if (s === null || e === null) return false;
  return minutes >= s && minutes < e;
}

function parseHm(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/* -------------------------------------------------------------------------- */
/* Embed snippet (Deploy tab)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build the embeddable `<script>` snippet for a widget key. Origin comes from
 * NEXT_PUBLIC_APP_URL (falls back to the production host). This is the same
 * loader the existing `/widget.js` route serves — additive: we don't change the
 * loader URL contract.
 */
export function widgetEmbedSnippet(publicKey: string): string {
  const base = widgetBaseUrl();
  return `<script src="${base}/widget.js?key=${publicKey}" async></script>`;
}

export function widgetBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    "https://app.repulabs.com";
  return raw.replace(/\/+$/, "");
}

/** Tag used on PhoneNumber rows provisioned for inbox SMS handoff. */
export const HANDOFF_NUMBER_TAG = "inbox-handoff";

/** Is Twilio number-provisioning available? (account creds present.) */
export function isTwilioProvisioningConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

/**
 * The org's provisioned handoff numbers (PhoneNumber rows tagged `inbox-handoff`).
 * Used by the SMS tab + the handoff engine to find/reuse a number. Fail-soft → [].
 */
export type HandoffNumber = {
  id: string;
  phoneE164: string;
  status: string;
  monthlyCostCents: number;
};

export async function listHandoffNumbers(orgId: string): Promise<HandoffNumber[]> {
  return softInbox(
    () =>
      withTenant(orgId, async (tx) => {
        const rows = await tx.phoneNumber.findMany({
          where: { friendlyName: HANDOFF_NUMBER_TAG, status: "active" },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: { id: true, phoneE164: true, status: true, monthlyCostCents: true },
        });
        return rows.map((r) => ({
          id: r.id,
          phoneE164: r.phoneE164,
          status: r.status,
          monthlyCostCents: r.monthlyCostCents,
        }));
      }),
    [],
    { event: "inbox.widget.listHandoffNumbers.failed", swallowAll: true, context: { orgId } },
  );
}
