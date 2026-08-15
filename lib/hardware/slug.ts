/**
 * QR slug parsing — the single place we turn "whatever the customer gives us"
 * into a canonical 10-char device slug.
 *
 * Shared by the scan route (`app/r/[slug]/route.ts`), the activation page, the
 * `activateDevice` server action and the "Connect a device" modal, so all four
 * agree on what counts as a slug. Deliberately dependency-free (no
 * `next/headers`, no Prisma) so the client components can import it too.
 *
 * The slug matters more than it used to: the current production batch shipped
 * with ONE activation code printed on every card, so the code can no longer
 * identify a unit. The slug in the QR link is the only per-unit identifier
 * left. See lib/hardware/actions.ts.
 */

/** 10-char Crockford base32. Kept in sync with app/r/[slug]/route.ts. */
export const SLUG_RE = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/**
 * Crockford's decode aliases. The alphabet drops I, L, O and U precisely
 * because they're easy to misread, and the spec says a *reader* should accept
 * I/L as 1 and O as 0. Generated slugs never contain those letters, so folding
 * them can only rescue a hand-typed "IO" that was meant to be "10" — it can
 * never turn one valid slug into a different valid slug.
 */
function foldAmbiguous(value: string): string {
  return value.replace(/[IL]/g, "1").replace(/O/g, "0");
}

/**
 * Extract a canonical slug from a full QR link, a bare path, or the raw slug.
 * Customers paste all three:
 *
 *   https://repulabs.com/r/ABCD123456?utm_source=card  → ABCD123456
 *   repulabs.com/r/abcd123456                          → ABCD123456
 *   /r/ABCD123456                                      → ABCD123456
 *   abcd-123456                                        → ABCD123456
 *
 * Returns null for anything that isn't a well-formed slug — callers treat null
 * as "we don't know which device this is" rather than guessing.
 */
export function parseSlug(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // A `/r/<slug>` segment anywhere in the input wins over the raw string, so a
  // pasted link with a query string or trailing path doesn't poison the match.
  const fromLink = trimmed.match(/\/r\/([0-9A-Za-z]+)/)?.[1];
  const candidate = foldAmbiguous((fromLink ?? trimmed).replace(/[\s-]/g, "").toUpperCase());

  return SLUG_RE.test(candidate) ? candidate : null;
}

/** True when `value` is already a canonical slug (no normalization applied). */
export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value);
}
