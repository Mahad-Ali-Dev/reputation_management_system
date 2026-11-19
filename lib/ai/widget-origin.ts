import { publicUrl } from "@/lib/url";

/**
 * Is this request allowed to talk to a chat widget with this allowlist?
 *
 * - An empty allowlist means "any origin" (testing / single-site setups).
 * - Otherwise the Origin must be on the list, OR the request must come from
 *   Repulabs itself: the owner's in-app tester (/ai/test) loads the widget from
 *   the app, and used to get a silent 403 (an empty chat panel) as soon as an
 *   allowlist was set. Our own origin only serves our own pages.
 *
 * "From Repulabs itself" is either an Origin equal to our public origin, or no
 * Origin at all with `Sec-Fetch-Site: same-origin` (browsers omit Origin on
 * same-origin GETs, and page scripts cannot set Sec-Fetch-* headers).
 */
export function isWidgetOriginAllowed(
  allowlist: string[],
  origin: string | null,
  secFetchSite?: string | null,
): boolean {
  if (allowlist.length === 0) return true;
  if (origin && allowlist.includes(origin)) return true;
  if (!origin) return secFetchSite === "same-origin";
  try {
    return origin === publicUrl("/").origin;
  } catch {
    return false;
  }
}
