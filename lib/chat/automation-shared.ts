// PURE module — safe to import from both client and server components.
//
// Holds the consts, types, and side-effect-free helpers for the Inbox
// Automation rule-builder (Module 09). MUST NOT import prisma, `@/lib/db/*`,
// `@/lib/auth/*`, or `next/*` — only `zod` is allowed — so a "use client"
// component can import the types/consts/helpers here without dragging the
// server-only `automation-actions` (Prisma) into the client bundle.
import { z } from "zod";

/**
 * Canonical inbox channels an automation rule may target. Inlined here (rather
 * than imported from `@/lib/inbox/queries`) because that module imports Prisma
 * via `@/lib/db/with-tenant` and is therefore NOT client-safe. Keep in sync with
 * `INBOX_CHANNELS` in lib/inbox/queries.ts.
 */
const INBOX_CHANNELS = [
  "email",
  "facebook_msg",
  "instagram_dm",
  "gbp_qa",
  "webchat",
  "sms",
] as const;

/** AI-behaviour values the `ChatAutomationRule.ai_behaviour` column accepts. */
export const AI_BEHAVIOURS = ["kb_reply", "fixed_template", "kb_then_escalate"] as const;
export type AiBehaviour = (typeof AI_BEHAVIOURS)[number];

/** A rule's trigger scope. `all` = every inbound message; `keyword` = matches `triggerKeyword`. */
export const RULE_TRIGGERS = ["all", "keyword"] as const;
export type RuleTrigger = (typeof RULE_TRIGGERS)[number];

/** Serialized rule shape the Automations UI renders (Dates → ISO; no secrets). */
export type AutomationRuleView = {
  id: string;
  ruleKey: string;
  name: string;
  isActive: boolean;
  trigger: RuleTrigger;
  triggerKeyword: string | null;
  channels: string[];
  aiBehaviour: AiBehaviour;
  fixedTemplate: string | null;
  maxRepliesPerConversation: number;
  escalateAfterTurns: number;
  updatedAt: string;
};

/** Coerce arbitrary input to a known AI behaviour (defensive against stale rows). */
export function normalizeAiBehaviour(v: unknown): AiBehaviour {
  return (AI_BEHAVIOURS as readonly string[]).includes(v as string)
    ? (v as AiBehaviour)
    : "kb_reply";
}

/** Keep only canonical inbox channels, de-duped, order-stable. */
export function sanitizeChannels(input: Iterable<unknown>): string[] {
  const allow = new Set<string>(INBOX_CHANNELS);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const v = typeof raw === "string" ? raw.trim() : "";
    if (allow.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Pure normalizer: FormData → the persisted column set for an automation rule.
 * Exported (and side-effect free) so the mapping is unit-testable in the
 * node-only vitest env without a DB or a session. Throws on validation failure.
 *
 * Key invariants enforced here:
 *  - `trigger=keyword` REQUIRES a non-empty `triggerKeyword`; `trigger=all`
 *    nulls it out (so a stale keyword can't silently narrow an "all" rule).
 *  - `aiBehaviour=fixed_template` REQUIRES a non-empty `fixedTemplate`; the
 *    other behaviours null it out.
 *  - at least one channel must be selected.
 */
export function parseRuleForm(form: FormData): {
  id: string | null;
  name: string;
  isActive: boolean;
  trigger: RuleTrigger;
  triggerKeyword: string | null;
  channels: string[];
  aiBehaviour: AiBehaviour;
  fixedTemplate: string | null;
  maxRepliesPerConversation: number;
  escalateAfterTurns: number;
} {
  const Form = z.object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1, "Give the rule a name.").max(120),
    isActive: z.coerce.boolean().default(false),
    trigger: z.enum(RULE_TRIGGERS).default("all"),
    triggerKeyword: z.string().trim().max(120).optional().default(""),
    aiBehaviour: z.enum(AI_BEHAVIOURS).default("kb_reply"),
    fixedTemplate: z.string().trim().max(2000).optional().default(""),
    maxRepliesPerConversation: z.coerce.number().int().min(1).max(20).default(3),
    escalateAfterTurns: z.coerce.number().int().min(0).max(20).default(0),
  });

  const parsed = Form.safeParse({
    id: (form.get("id") as string) || undefined,
    name: form.get("name") ?? "",
    isActive: form.get("isActive") === "on" || form.get("isActive") === "true",
    trigger: form.get("trigger") ?? "all",
    triggerKeyword: form.get("triggerKeyword") ?? "",
    aiBehaviour: form.get("aiBehaviour") ?? "kb_reply",
    fixedTemplate: form.get("fixedTemplate") ?? "",
    maxRepliesPerConversation: form.get("maxRepliesPerConversation") ?? 3,
    escalateAfterTurns: form.get("escalateAfterTurns") ?? 0,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const d = parsed.data;

  const channels = sanitizeChannels(form.getAll("channels"));
  if (channels.length === 0) {
    throw new Error("Select at least one channel for this rule.");
  }

  const trigger: RuleTrigger = d.trigger;
  const triggerKeyword = trigger === "keyword" ? d.triggerKeyword : "";
  if (trigger === "keyword" && triggerKeyword.length === 0) {
    throw new Error("Enter a keyword, or switch the trigger to all messages.");
  }

  const aiBehaviour: AiBehaviour = d.aiBehaviour;
  const fixedTemplate = aiBehaviour === "fixed_template" ? d.fixedTemplate : "";
  if (aiBehaviour === "fixed_template" && fixedTemplate.length === 0) {
    throw new Error("Add a reply template, or choose a different AI behaviour.");
  }

  return {
    id: d.id ?? null,
    name: d.name,
    isActive: d.isActive,
    trigger,
    triggerKeyword: triggerKeyword || null,
    channels,
    aiBehaviour,
    fixedTemplate: fixedTemplate || null,
    maxRepliesPerConversation: d.maxRepliesPerConversation,
    escalateAfterTurns: aiBehaviour === "kb_then_escalate" ? d.escalateAfterTurns : 0,
  };
}

/** Stable, collision-resistant ruleKey for a freshly created builder rule. */
export function newRuleKey(): string {
  return `auto_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
