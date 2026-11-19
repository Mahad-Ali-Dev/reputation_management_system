import { resolveSessionOrg } from "@/lib/auth/active-org";
import { readPendingSlug } from "@/lib/hardware/pending-slug";
import { parseSlug } from "@/lib/hardware/slug";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Hardware activation entry point, paired with a QR review stand.
 *
 * The owner scans the printed code, the stand redirects to /r/{slug}, and the
 * scan interstitial brings them here. The activation UI itself is now a sheet
 * over the Device Manager (app/hardware/_components/activate-sheet.tsx), so
 * this route only works out WHICH stand and sends them there.
 *
 * The only per-unit identifier is the QR slug (the current production batch
 * shares one printed activation code, see lib/hardware/actions.ts), so we find
 * it before the customer types anything:
 *
 *   1. `?slug=`: they clicked straight through from the scan interstitial.
 *   2. The `rl_pending_slug` cookie /r/{slug} dropped when they scanned. This
 *      covers the new-owner path (signup → magic link → onboarding → first
 *      business → here), where the query string is long gone.
 *   3. Nothing: the sheet opens on its scan / paste-a-link step.
 *
 * Every existing link (/activate, /activate?slug=…, the command palette, the
 * not-activated page, order pages) keeps working through this redirect.
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const sp = await searchParams;

  // Query string first (freshest: they may be activating a second stand),
  // then the cookie from the original scan.
  const scannedSlug = parseSlug(sp.slug) ?? (await readPendingSlug());

  // Signed out? Carry the stand through the auth round-trip ourselves, or the
  // login redirect would drop them on /dashboard with the slug gone.
  const session = await resolveSessionOrg();
  if (!session) {
    const dest = scannedSlug ? `/activate?slug=${scannedSlug}` : "/activate";
    redirect(`/signup?next=${encodeURIComponent(dest)}`);
  }

  redirect(`/hardware?activate=${scannedSlug ?? "1"}`);
}
