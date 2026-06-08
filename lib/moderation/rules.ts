import { prisma } from "@/lib/db/client";
import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";

/**
 * Moderation RULES engine (Module 09 — Inbox, Wave 3c-A).
 *
 * Two layers, both within the FROZEN schema:
 *   1. Keyword rules  → `CommentBlacklist` rows (existing table: keyword,
 *      matchMode contains|exact|regex, isActive, hiddenCount). Managed by the
 *      existing `lib/moderation/blacklist-actions.ts` — we only READ them here.
 *   2. Moderation config (the auto-hide-spam / block-profanity / flag-negativity
 *      toggles + the negativity confidence threshold) → stored as a merge-on-write
 *      slice of `Organization.settings` JSON (`settings.moderation`). No new table.
 *
 * The PURE decision function `evaluateRules` takes the already-loaded config +
 * blacklist + body and returns the action. This is what the unit tests pin:
 *   - keyword/profanity match  → action "hide"  (the ONLY auto-hide paths)
 *   - everything else          → action "flag"  (DEFAULT — flag-for-review)
 *
 * GUARDRAIL: auto-hide is reserved for explicit keyword + (opt-in) profanity
 * rules. Negativity/sentiment NEVER auto-hides here — it produces a "flag" that
 * the queue surfaces with an AI confidence for a human to approve/hide.
 */

export type ModerationConfig = {
  /** Master switch. When false, evaluateRules returns "allow" for everything. */
  enabled: boolean;
  /** Auto-hide content that trips the built-in profanity list. Default ON. */
  blockProfanity: boolean;
  /** Flag (never auto-hide) content the classifier scores as negative. Default ON. */
  flagNegativity: boolean;
  /** Auto-hide obvious spam (link-stuffing / scam) via the heuristic. Default OFF. */
  autoHideSpam: boolean;
  /** Confidence ≥ this enqueues a negativity flag (0..1). Default 0.7. */
  negativityThreshold: number;
};

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  enabled: true,
  blockProfanity: true,
  flagNegativity: true,
  autoHideSpam: false,
  negativityThreshold: 0.7,
};

export type ModerationDecision = {
  /** "hide" = auto-hide source; "flag" = queue for review; "allow" = no item. */
  action: "hide" | "flag" | "allow";
  /** Why it tripped — drives the ModerationItem.reason. */
  reason: "keyword" | "profanity" | "negativity" | "spam" | "none";
  matchedKeyword: string | null;
};

/** A loaded keyword rule (subset of CommentBlacklist we evaluate against). */
export type KeywordRule = { keyword: string; matchMode: string };

/**
 * Built-in profanity list (separate from the user keyword blacklist). Matching
 * any of these, when `blockProfanity` is on, is an explicit auto-hide path.
 */
const PROFANITY = [
  "fuck",
  "fuk",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "motherfucker",
  "nigger",
  "faggot",
  "retard",
  "whore",
  "slut",
];

const SPAM_SIGNALS = ["http://", "https://", "www.", "bit.ly", "t.me/", "telegram.me", "earn $", "free money", "click here", "promo code"];

/**
 * PURE rule evaluation — no I/O. Order of precedence (first match wins):
 *   1. user keyword blacklist  → hide (reason "keyword")
 *   2. built-in profanity       → hide (reason "profanity")  [if blockProfanity]
 *   3. spam heuristic           → hide (reason "spam")       [if autoHideSpam]
 *      ... otherwise spam-ish    → flag (reason "spam")
 *   4. negativity (caller passes the classifier confidence) → flag, never hide
 *   5. otherwise                → allow
 *
 * `negativityConfidence` is supplied by `classify.ts` (the caller scores once
 * and threads it in) so this stays pure + synchronously testable.
 */
export function evaluateRules(
  config: ModerationConfig,
  blacklist: KeywordRule[],
  body: string,
  negativityConfidence = 0,
): ModerationDecision {
  if (!config.enabled) return { action: "allow", reason: "none", matchedKeyword: null };

  const text = (body ?? "").toLowerCase();
  if (!text.trim()) return { action: "allow", reason: "none", matchedKeyword: null };

  // 1) Explicit user keyword blacklist → auto-hide.
  for (const rule of blacklist) {
    if (matchesKeyword(text, rule)) {
      return { action: "hide", reason: "keyword", matchedKeyword: rule.keyword };
    }
  }

  // 2) Built-in profanity → auto-hide (opt-in, default on). Stem match so
  //    inflections ("fucking", "fucker") trip too, while a leading word-boundary
  //    still avoids "ass"→"passion" style false positives.
  if (config.blockProfanity) {
    const hit = PROFANITY.find((w) => profanityPresent(text, w));
    if (hit) return { action: "hide", reason: "profanity", matchedKeyword: hit };
  }

  // 3) Spam heuristic.
  const spamHits = SPAM_SIGNALS.filter((s) => text.includes(s)).length;
  if (spamHits >= 2) {
    return {
      action: config.autoHideSpam ? "hide" : "flag",
      reason: "spam",
      matchedKeyword: null,
    };
  }

  // 4) Negativity → FLAG ONLY (never auto-hide, per guardrail).
  if (config.flagNegativity && negativityConfidence >= config.negativityThreshold) {
    return { action: "flag", reason: "negativity", matchedKeyword: null };
  }

  return { action: "allow", reason: "none", matchedKeyword: null };
}

/** Whether a single keyword rule matches the (already lowercased) text. */
function matchesKeyword(text: string, rule: KeywordRule): boolean {
  const kw = (rule.keyword ?? "").toLowerCase().trim();
  if (!kw) return false;
  switch (rule.matchMode) {
    case "exact":
      return wordPresent(text, kw);
    case "regex":
      try {
        return new RegExp(rule.keyword, "i").test(text);
      } catch {
        // Malformed regex rule → fall back to substring so it still does something.
        return text.includes(kw);
      }
    default: // "contains"
      return text.includes(kw);
  }
}

/** Word-boundary presence (so "ass" doesn't match "passion"). */
function wordPresent(text: string, word: string): boolean {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(text);
}

/**
 * Profanity STEM presence: the word must start at a word boundary but may carry
 * a suffix ("fuck" → "fucking"/"fucker"). Leading boundary avoids substring
 * false positives like "ass" inside "passion".
 */
function profanityPresent(text: string, stem: string): boolean {
  const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}[a-z]*`, "i").test(text);
}

// ---------------------------------------------------------------------------
// Config persistence (Organization.settings.moderation — merge-on-write).
// ---------------------------------------------------------------------------

/** Coerce a stored JSON blob into a fully-defaulted ModerationConfig. */
export function normalizeConfig(raw: unknown): ModerationConfig {
  const r = (raw ?? {}) as Partial<ModerationConfig>;
  const t = Number(r.negativityThreshold);
  return {
    enabled: r.enabled ?? DEFAULT_MODERATION_CONFIG.enabled,
    blockProfanity: r.blockProfanity ?? DEFAULT_MODERATION_CONFIG.blockProfanity,
    flagNegativity: r.flagNegativity ?? DEFAULT_MODERATION_CONFIG.flagNegativity,
    autoHideSpam: r.autoHideSpam ?? DEFAULT_MODERATION_CONFIG.autoHideSpam,
    negativityThreshold:
      Number.isFinite(t) && t > 0 && t <= 1 ? t : DEFAULT_MODERATION_CONFIG.negativityThreshold,
  };
}

/**
 * Load the org's moderation config. Reads the org's OWN settings by verified
 * orgId (same auth-domain exception entitlements uses). Fail-soft → defaults.
 */
export async function getModerationConfig(orgId: string): Promise<ModerationConfig> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = (org?.settings ?? {}) as { moderation?: unknown };
    return normalizeConfig(settings.moderation);
  } catch (err) {
    logger.warn({
      orgId,
      event: "moderation.config.load_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return DEFAULT_MODERATION_CONFIG;
  }
}

/**
 * Merge-on-write update of `settings.moderation`. Only the provided keys change;
 * other setting groups (security, etc.) are preserved. Tenant-scoped write.
 */
export async function saveModerationConfig(
  orgId: string,
  patch: Partial<ModerationConfig>,
): Promise<ModerationConfig> {
  const current = await getModerationConfig(orgId);
  const next = normalizeConfig({ ...current, ...patch });
  await withTenant(orgId, async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    await tx.organization.update({
      where: { id: orgId },
      data: { settings: { ...settings, moderation: next } },
    });
  });
  return next;
}

/** Load the active keyword blacklist for evaluation. Fail-soft → []. */
export async function loadKeywordRules(orgId: string): Promise<KeywordRule[]> {
  try {
    return await withTenant(orgId, async (tx) =>
      tx.commentBlacklist.findMany({
        where: { isActive: true },
        select: { keyword: true, matchMode: true },
      }),
    );
  } catch (err) {
    if (isMissingRelation(err)) return [];
    logger.warn({
      orgId,
      event: "moderation.rules.load_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Postgres 42P01/42703 (+ Prisma P2021/P2022) = relation/column not migrated. */
export function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703" || code === "P2021" || code === "P2022";
}
