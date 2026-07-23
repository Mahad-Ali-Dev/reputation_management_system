import { headers } from "next/headers";

/**
 * Host-aware robots.txt.
 *
 * One Next app serves four hostnames (see middleware.ts):
 *   repulabs.com        marketing   → index the public pages
 *   app.repulabs.com    product     → block everything
 *   admin.repulabs.com  admin       → block everything
 *   r.repulabs.com      redirects   → block everything
 *
 * A static robots.txt would hand the same rules to all four, so this is a
 * route handler that reads the forwarded Host.
 *
 * WHY /r/ IS BLOCKED EXPLICITLY: device redirect URLs contain a per-device
 * slug. `activateDevice` binds by that slug, so an indexed /r/<slug> would put
 * claimable device identifiers into Google — the same leak we fixed in the
 * store imagery. On the apex these routes are NOT blocked by middleware, so
 * robots is the guard.
 */

export const dynamic = "force-dynamic";

const SITE = (
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://repulabs.com"
).replace(/\/$/, "");

/** Paths on the marketing host that must never be indexed. */
const DISALLOW = [
  "/api/",
  "/admin",
  "/r/", // per-device slugs — see note above
  "/activate",
  "/not-activated",
  "/accept-invite",
  "/onboarding",
  "/dashboard",
  "/settings",
  "/subscription",
  // product surfaces (AppShellServer) that also resolve on the apex host
  "/ai",
  "/analytics",
  "/autopilot",
  "/connections",
  "/contacts",
  "/establishments",
  "/faqs",
  "/hardware",
  "/outreach",
  "/phone",
  "/reviews",
  "/social",
  "/support",
  "/surveys",
  // auth entry — no SEO value, avoids duplicate/thin pages
  "/login",
];

function body(isMarketing: boolean): string {
  if (!isMarketing) {
    return ["User-agent: *", "Disallow: /", ""].join("\n");
  }
  return [
    "User-agent: *",
    "Allow: /",
    ...DISALLOW.map((p) => `Disallow: ${p}`),
    "",
    `Sitemap: ${SITE}/sitemap.xml`,
    "",
  ].join("\n");
}

export async function GET() {
  const h = await headers();
  const host = ((h.get("x-forwarded-host") ?? h.get("host") ?? "").split(
    ":",
  )[0] ?? "").toLowerCase();

  const isMarketing =
    !host.startsWith("app.") &&
    !host.startsWith("admin.") &&
    !host.startsWith("r.");

  return new Response(body(isMarketing), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
