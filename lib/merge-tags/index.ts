/**
 * Canonical merge-tag engine (00_foundation §A5).
 *
 * THE single source of truth for merge-tag rendering/validation across the app.
 * Steps 7 (review-request templates) and 11 (survey invites) import THIS — do
 * not fork a second resolver (that re-introduces template-syntax drift).
 *
 * ── Syntax decision (load-bearing) ──
 * The canonical tag syntax is **double-brace `{{tag}}`** — NOT single-brace.
 * The architecture doc sketched `{first_name}`, but the EXISTING template rows
 * and the AI request generator (`lib/ai/generate-review-request.ts`) already emit
 * `{{customerName}}`, `{{businessName}}`, `{{reviewLink}}`. Adopting `{{...}}`
 * avoids a migration of live templates and a clash with single-brace literals.
 * Single-brace input is therefore rendered as LITERAL text (no substitution, no
 * surprise) — see the `SINGLE_BRACE` non-match guarantee in the tests.
 *
 * This module is pure (no React, no I/O) so it is unit-testable AND reusable by
 * send-time code on the server (the dispatcher renders the final SMS/email body
 * with the same function the editor previews with).
 */

export type MergeTag = {
  /** The key inside the braces, e.g. `first_name` → `{{first_name}}`. */
  key: string;
  /** Human label shown on the insert chip. */
  label: string;
  /** Example value used to drive the live preview / sample data. */
  example: string;
};

/**
 * Matches a double-brace tag and captures the inner key.
 *
 * Allowed key chars: letters, digits, `_`, `.`, `-` (covers `first_name`,
 * `business.name`, camelCase like `customerName`). Optional inner whitespace is
 * tolerated (`{{ first_name }}`) and trimmed. The pattern deliberately does NOT
 * match single braces, so `{first_name}` passes through untouched.
 *
 * `g` flag → callers that reuse the regex must reset `lastIndex` (we construct a
 * fresh `RegExp` per call below rather than share a stateful global).
 */
const TAG_KEY = "[A-Za-z0-9_.-]+";
function tagPattern(): RegExp {
  return new RegExp(`\\{\\{\\s*(${TAG_KEY})\\s*\\}\\}`, "g");
}

/**
 * Canonicalize a key as written in a template to its lookup form: trim, and
 * lowercase nothing (keys are case-sensitive to match existing `{{customerName}}`
 * rows). Whitespace inside the braces is the only thing normalized.
 */
function normalizeKey(raw: string): string {
  return raw.trim();
}

/**
 * Render `{{key}}` occurrences in `template` against `values`.
 *
 * - Known key → its value (coerced to string; `null`/`undefined` value → "").
 * - Unknown key → `opts.keepUnknown` ? the literal `{{key}}` : "" (default:
 *   dropped to ""). Keeping unknowns is useful for chained/partial renders;
 *   dropping is the safe default for a customer-facing send.
 * - Single-brace text and non-tag braces are left exactly as written.
 *
 * Pure + synchronous; safe to call on the server at send time and in the editor
 * preview on every keystroke.
 */
export function renderMergeTags(
  template: string,
  values: Record<string, string>,
  opts?: { keepUnknown?: boolean },
): string {
  if (!template) return "";
  const keepUnknown = opts?.keepUnknown ?? false;
  return template.replace(tagPattern(), (_match, rawKey: string) => {
    const key = normalizeKey(rawKey);
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      const v = values[key];
      return v == null ? "" : String(v);
    }
    // Unknown tag.
    return keepUnknown ? `{{${key}}}` : "";
  });
}

/**
 * Find the distinct tag keys present in a template (for validation + the
 * "available tags" affordance). Order = first appearance; duplicates collapsed.
 */
export function extractMergeTags(template: string): string[] {
  if (!template) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = tagPattern();
  let m: RegExpExecArray | null = re.exec(template);
  while (m !== null) {
    const raw = m[1];
    if (raw !== undefined) {
      const key = normalizeKey(raw);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    m = re.exec(template);
  }
  return out;
}

/**
 * Validate a template against an allowed key set. Returns the unknown keys
 * (present in the template but not in `allowed`). Empty `unknown` ⇒ valid.
 */
export function validateMergeTags(
  template: string,
  allowed: string[],
): { unknown: string[] } {
  const allowSet = new Set(allowed.map(normalizeKey));
  const unknown = extractMergeTags(template).filter((k) => !allowSet.has(k));
  return { unknown };
}

/**
 * The common tags every channel offers by default. Keys intentionally match the
 * tokens the AI request generator already emits (`customerName`, `businessName`,
 * `reviewLink`) PLUS the snake_case aliases the architecture doc named, so a
 * template authored against either convention renders. Modules may pass their
 * own `MergeTag[]` to the editor; this is the shared baseline.
 */
export const COMMON_TAGS: MergeTag[] = [
  { key: "first_name", label: "First name", example: "Alex" },
  { key: "customerName", label: "Customer name", example: "Alex Rivera" },
  { key: "business_name", label: "Business name", example: "Summit Dental Studio" },
  { key: "businessName", label: "Business name", example: "Summit Dental Studio" },
  { key: "review_link", label: "Review link", example: "https://g.page/r/abc/review" },
  { key: "reviewLink", label: "Review link", example: "https://g.page/r/abc/review" },
];

/**
 * Build a sample-data map from a tag list (each tag's `example`). Handy for the
 * editor's default preview when the caller hasn't supplied bespoke sample data.
 */
export function sampleDataFromTags(
  tags: ReadonlyArray<MergeTag> = COMMON_TAGS,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tags) out[t.key] = t.example;
  return out;
}
