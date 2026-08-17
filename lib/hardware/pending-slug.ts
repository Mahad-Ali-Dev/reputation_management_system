import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { parseSlug } from "./slug";

/**
 * "Which device did this person just scan?" — remembered across the whole
 * activation journey.
 *
 * The problem this solves: the scanned slug used to travel ONLY in the query
 * string (`/not-activated?slug=X` → `/activate?slug=X`). A returning owner with
 * a live session makes that trip in two clicks and it works. A brand-new owner
 * — the common case, since they scan the plaque the day it arrives — does not:
 *
 *   scan → /not-activated → /signup → magic-link email → /dashboard →
 *   /onboarding → "add your first business" → /establishments/new → /activate
 *
 * Every one of those hops is a fresh top-level navigation that drops the query
 * string. They land on /activate with no slug, type the code printed on the
 * card, and get "we couldn't match that activation code" — because the current
 * batch has ONE code printed on every card, so without a slug there is nothing
 * for it to match. That is the reported bug.
 *
 * So `/r/{slug}` writes the slug into a cookie the moment an unactivated device
 * is scanned, and `/activate` + `activateDevice` read it back. The cookie is
 * the per-unit identity carried silently in the background — exactly what lets
 * the customer type nothing but the 5-character code.
 *
 * Not a security boundary: the slug is public (it's printed on the product) and
 * activation still requires a signed-in manager plus a code check. It's a
 * convenience carrier, so a stale or absent cookie only ever costs us a
 * fallback to the manual paste field.
 */
export const PENDING_SLUG_COOKIE = "rl_pending_slug";

/** 30 days — long enough for "scanned it Friday, set it up next week". */
const PENDING_SLUG_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Attach the scanned slug to a redirect response. Called from `/r/{slug}` —
 * route handlers are the only place in this flow that can WRITE cookies
 * (server components can't), which is why the scan itself has to be what
 * records it.
 *
 * `sameSite: "lax"` is deliberate: the owner very often re-enters the app by
 * clicking a magic link in their email client, and that's a cross-site
 * top-level GET — `strict` would withhold the cookie on exactly that hop.
 */
export function rememberPendingSlug(res: NextResponse, slug: string): void {
  res.cookies.set(PENDING_SLUG_COOKIE, slug, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_SLUG_MAX_AGE,
  });
}

/**
 * Read back the remembered slug, re-validated through `parseSlug` so a
 * hand-edited or truncated cookie can never reach a database query.
 */
export async function readPendingSlug(): Promise<string | null> {
  try {
    return parseSlug((await cookies()).get(PENDING_SLUG_COOKIE)?.value);
  } catch {
    // `cookies()` throws in contexts where the store isn't available. A missing
    // slug is a supported state everywhere downstream, so degrade quietly.
    return null;
  }
}

/**
 * Drop the cookie once the device it points at has been claimed, so the next
 * activation on this browser starts clean instead of re-offering a device
 * that's already live.
 *
 * Only callable from a server action or route handler.
 */
export async function clearPendingSlug(): Promise<void> {
  try {
    (await cookies()).delete(PENDING_SLUG_COOKIE);
  } catch {
    // Same rationale as readPendingSlug — never let cookie plumbing fail an
    // activation that has already succeeded in the database.
  }
}
