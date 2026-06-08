/**
 * Outreach merge-tags — a THIN wrapper over the canonical Wave-0 engine
 * (`lib/merge-tags/index.ts`).
 *
 * MANDATORY (verifier fix #2): this module must NOT be a standalone single-brace
 * `{first_name}` engine. The canonical syntax is **double-brace `{{tag}}`** and the
 * one true resolver/validator lives in `@/lib/merge-tags`. Steps 7 (review
 * requests) and 11 (surveys) BOTH import the resolution from here so the editor
 * preview and the send-time dispatch render identically — no second engine.
 *
 * What this file adds on top of the canonical engine is purely outreach-specific
 * convenience: a curated tag list for review-request templates and a
 * `resolveMergeTags` helper that maps an outreach send context (recipient name,
 * business name, review link, address) onto the canonical `renderMergeTags`
 * values map (filling BOTH snake_case `{{first_name}}` and the legacy camelCase
 * `{{customerName}}`/`{{businessName}}`/`{{reviewLink}}` tokens that already live
 * in stored templates + the AI generator output).
 *
 * Pure functions only — no I/O, no React, no external calls. Safe to call on the
 * server at send time and in the client editor preview on every keystroke.
 */

import {
  COMMON_TAGS,
  type MergeTag,
  extractMergeTags,
  renderMergeTags,
  validateMergeTags,
} from "@/lib/merge-tags";

// Re-export the canonical primitives so call sites can import everything merge-tag
// related from one outreach module without forking behaviour.
export {
  COMMON_TAGS,
  type MergeTag,
  extractMergeTags,
  renderMergeTags,
  validateMergeTags,
};

/**
 * The merge tags a review-request template/editor offers. These are the spec's
 * tags expressed in the canonical double-brace syntax (`{{first_name}}` …). The
 * `key` is what goes inside the braces; clicking a chip inserts `{{key}}`.
 *
 * Both the snake_case keys AND the legacy camelCase aliases resolve at send time
 * (see `outreachValues`), so a template authored against either convention works.
 */
export const OUTREACH_MERGE_TAGS: MergeTag[] = [
  { key: "first_name", label: "First name", example: "Jordan" },
  { key: "last_name", label: "Last name", example: "Smith" },
  { key: "business_name", label: "Business name", example: "Summit Dental Studio" },
  { key: "review_link", label: "Review link", example: "https://g.page/r/your-review/review" },
  {
    key: "establishment_address",
    label: "Business address",
    example: "123 Main St, Springfield",
  },
];

/** The send-time context resolved into merge-tag values. */
export type OutreachMergeContext = {
  /** Full recipient name (e.g. "Jordan Smith"). first/last derived if not given. */
  recipientName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  businessName: string;
  reviewLink: string;
  establishmentAddress?: string | null;
};

/** Split a full name into first/last. Single-token names → first only. */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0] as string, last: "" };
  return { first: parts[0] as string, last: parts.slice(1).join(" ") };
}

/**
 * Build the canonical `renderMergeTags` values map from an outreach context.
 *
 * Fills BOTH the snake_case keys (`first_name`, `business_name`, `review_link`,
 * `establishment_address`, `last_name`) AND the legacy camelCase keys the AI
 * generator + existing rows emit (`customerName`, `businessName`, `reviewLink`)
 * so every historical and new template renders with one resolver.
 */
export function outreachValues(ctx: OutreachMergeContext): Record<string, string> {
  const explicitFirst = ctx.firstName?.trim();
  const explicitLast = ctx.lastName?.trim();
  const derived = ctx.recipientName ? splitName(ctx.recipientName) : { first: "", last: "" };

  const first = explicitFirst || derived.first;
  const last = explicitLast || derived.last;
  // A friendly fallback used by the legacy {{customerName}} token when no name.
  const fullName = ctx.recipientName?.trim() || [first, last].filter(Boolean).join(" ") || "there";

  return {
    // Snake_case (spec) tags.
    first_name: first || "there",
    last_name: last,
    business_name: ctx.businessName,
    review_link: ctx.reviewLink,
    establishment_address: ctx.establishmentAddress ?? "",
    // Legacy camelCase aliases (existing templates + AI generator output).
    customerName: fullName,
    businessName: ctx.businessName,
    reviewLink: ctx.reviewLink,
  };
}

/**
 * Resolve `{{tag}}` occurrences in `body` against an outreach context, using the
 * canonical `renderMergeTags`. This is the single substitution both the editor
 * preview and the send-time dispatcher call.
 *
 * Unknown tags are DROPPED by default (safe for a customer-facing send); pass
 * `{ keepUnknown: true }` for the editor preview so authors still see them.
 */
export function resolveMergeTags(
  body: string,
  ctx: OutreachMergeContext,
  opts?: { keepUnknown?: boolean },
): string {
  return renderMergeTags(body, outreachValues(ctx), opts);
}

/**
 * Compose a single-line address from the establishment's JSON `address` blob
 * (the `{{establishment_address}}` tag value). Tolerates every shape seen in the
 * codebase: create-form (`line1`/`state`/`postalCode`), legacy (`street`/`region`/
 * `postal`/`postcode`). Returns "" when nothing usable so the tag drops cleanly.
 */
export function formatAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  const parts = [
    str(a.line1) ?? str(a.street),
    str(a.city),
    str(a.state) ?? str(a.region),
    str(a.postalCode) ?? str(a.postal) ?? str(a.postcode),
  ].filter((p): p is string => typeof p === "string");
  return parts.join(", ");
}

/**
 * Stable sample context for the editor's live preview. Mirrors the example
 * values on `OUTREACH_MERGE_TAGS` so "what you preview is what ships".
 */
export function sampleContext(
  businessName: string,
  establishmentAddress?: string | null,
): OutreachMergeContext {
  return {
    recipientName: "Jordan Smith",
    firstName: "Jordan",
    lastName: "Smith",
    businessName: businessName || "Your Business",
    reviewLink: "https://g.page/r/your-review/review",
    establishmentAddress: establishmentAddress || "123 Main St, Springfield",
  };
}
