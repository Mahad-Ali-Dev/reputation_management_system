import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { resolveSessionOrg } from "@/lib/auth/active-org";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { readPendingSlug } from "@/lib/hardware/pending-slug";
import { parseSlug } from "@/lib/hardware/slug";
import { publicUrl } from "@/lib/url";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivateForm } from "./activate-form";
import "./activate.css";

export const dynamic = "force-dynamic";

/**
 * Hardware activation page — paired with a QR review stand.
 *
 * The owner scans the printed code, the stand redirects to /r/{slug}, and the
 * scan interstitial brings them here to bind the device to a business.
 *
 * The only per-unit identifier is the QR slug. The current production batch was
 * mis-printed with ONE activation code on every card, so the code alone can't
 * tell 1,500 stands apart — see lib/hardware/actions.ts. That's why this page
 * works hard to know the slug BEFORE the customer types anything:
 *
 *   1. `?slug=` — they clicked straight through from the scan interstitial.
 *   2. The `rl_pending_slug` cookie /r/{slug} dropped when they scanned. This
 *      is what covers the new-owner path (signup → magic link → onboarding →
 *      first business → here), where the query string is long gone.
 *   3. Nothing — the device field falls back to a paste box.
 *
 * In cases 1 and 2 the customer sees their stand already identified and only
 * has to enter the 5-character code.
 */
export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const sp = await searchParams;

  // Query string first (freshest — they may be activating a second stand),
  // then the cookie from the original scan.
  const scannedSlug = parseSlug(sp.slug) ?? (await readPendingSlug());

  // Signed out? Carry the device through the auth round-trip ourselves.
  // getOrgContext() below would redirect("/login") with no `next`, dropping
  // them on /dashboard afterwards with the slug gone — which is precisely how
  // owners ended up here empty-handed and hit "we couldn't match that code".
  const session = await resolveSessionOrg();
  if (!session) {
    const dest = scannedSlug ? `/activate?slug=${scannedSlug}` : "/activate";
    redirect(`/signup?next=${encodeURIComponent(dest)}`);
  }

  const { orgId } = await getOrgContext();

  // Resolve the scanned device INSIDE tenant RLS. The devices policy exposes
  // rows that are unclaimed (organization_id IS NULL) or already ours, so a
  // null result means "unknown slug, or another business owns it" and we never
  // have to reason about leaking a stranger's hardware.
  const device = scannedSlug
    ? await withTenant(orgId, (tx) =>
        tx.device.findFirst({
          where: { shortSlug: scannedSlug },
          select: { id: true, status: true, organizationId: true, serial: true },
        }),
      )
    : null;

  const deviceState = !scannedSlug
    ? ("none" as const)
    : !device
      ? ("unavailable" as const)
      : device.status === "unactivated"
        ? ("claimable" as const)
        : device.organizationId === orgId
          ? ("yours" as const)
          : ("unavailable" as const);

  // The link printed on the product, rebuilt for display. Shown read-back to
  // the customer so they can confirm we picked up the right stand.
  const detectedQrUrl = scannedSlug ? publicUrl(`/r/${scannedSlug}`).toString() : null;
  const ready = deviceState === "claimable";

  const establishments = await withTenant(orgId, (tx) =>
    tx.establishment.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Hardware", "Activate"]}>
      <PageHeader
        kicker="Hardware"
        title="Activate a Review Stand"
        description="Bind the QR on your stand to one of your businesses, so every scan lands on your review page."
        actions={
          <Link href="/hardware" className="btn">
            <Icon name="chevL" size={12} />
            Back to hardware
          </Link>
        }
      />

      <div className="af-page-grid">
        <section className="ds-card af-formcard">
          <div className="ds-card__body">
            {/* Hero — states what's left to do, so the form below reads as a
                short checklist rather than a wall of fields. */}
            <div className={ready ? "af-hero af-hero--ready" : "af-hero"}>
              <div className="af-hero__copy">
                <span className="af-hero__pill">
                  <span className="af-hero__dot" aria-hidden />
                  {ready ? "Stand detected" : "Let's find your stand"}
                </span>
                <h2 className="af-hero__title">
                  {ready ? "Almost there just the code" : "Activate your stand"}
                </h2>
                <p className="af-hero__sub">
                  {ready
                    ? "We recognised the QR you scanned, so it's filled in below. Enter the 5-character code from the card in your package and choose the business it points to."
                    : "Scan the QR on your stand with the phone or laptop you're setting up on that's how we identify which unit is yours. Then enter the 5-character code from the card in your package."}
                </p>
              </div>
              <StandArt />
            </div>

            {/* ActivateForm itself shows an inline "add a business" step when
                `establishments` is empty, instead of sending the customer away
                to /establishments/new and losing the scanned-stand context. */}
            <ActivateForm
              establishments={establishments}
              detectedQrUrl={detectedQrUrl}
              detectedSlug={scannedSlug}
              detectedSerial={device?.serial ?? null}
              deviceState={deviceState}
            />
          </div>
        </section>

        <aside className="ds-card af-guide">
          <div className="ds-card__head">
            <h3 className="ds-card__title">How activation works</h3>
            <span className="chip">4 steps</span>
          </div>
          <div className="ds-card__body">
            <ol className="af-rail">
              <Step
                n={1}
                t="Identify the stand"
                d="Scanning your QR is what tells us which unit you're holding it fills itself in here. Scanned on a different device? Enter the link manually instead."
              />
              <Step
                n={2}
                t="Verify the product"
                d="The 5-character code on the card inside the package proves the stand is yours. We match it against the unit the QR identified."
              />
              <Step
                n={3}
                t="Pick the business"
                d="Choose which establishment this QR represents scans get attributed to that location for analytics."
              />
              <Step
                n={4}
                t="Set the destination"
                d="Paste your Google review link so scans land on the review form directly. Optional we'll derive one from your Place ID if you leave it blank."
              />
            </ol>
            <div className="af-note">
              <Icon name="info" size={15} className="af-note__icon" />
              <span>
                One QR binds to one business. After activation you can change where it points any
                time from <Link href="/hardware">My devices</Link> no re-printing needed.
              </span>
            </div>
          </div>
        </aside>
      </div>
    </AppShellServer>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <li className="af-rail__item">
      <span className="af-rail__n">{n}</span>
      <div className="af-rail__body">
        <div className="af-rail__t">{t}</div>
        <div className="af-rail__d">{d}</div>
      </div>
    </li>
  );
}

/**
 * Hero illustration — a QR plaque on a pedestal, drawn inline.
 *
 * Deliberately NOT one of the /assets/repulabs/my-devices kit files: those are
 * 0.5–1.8 MB base64 PNGs wrapped in an <svg>, which is a lot to push down the
 * one page every new customer must load, and they blur when scaled. This is
 * ~2 KB of real vector in the kit's own palette, crisp at any size.
 */
function StandArt() {
  return (
    // Purely decorative: the hero copy beside it already carries the meaning,
    // so announcing it again would just be noise for a screen reader.
    <svg className="af-hero__art" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
      {/* soft ground shadow */}
      <ellipse cx="100" cy="132" rx="58" ry="9" fill="#ded5ff" opacity="0.75" />
      {/* pedestal */}
      <rect x="72" y="112" width="56" height="16" rx="7" fill="#c9b8ff" />
      <rect x="78" y="106" width="44" height="10" rx="5" fill="#b7a2ff" />
      {/* plaque body */}
      <rect
        x="52"
        y="18"
        width="96"
        height="92"
        rx="14"
        fill="#fff"
        stroke="#d7d0ff"
        strokeWidth="2.5"
      />
      {/* QR block */}
      <g fill="#6c4dff">
        {/* finder patterns */}
        <path d="M66 32h18v18H66zm4 4v10h10V36z" />
        <path d="M116 32h18v18h-18zm4 4v10h10V36z" />
        <path d="M66 62h18v18H66zm4 4v10h10V66z" />
        {/* data dots */}
        <rect x="92" y="32" width="5" height="5" rx="1.2" />
        <rect x="100" y="32" width="5" height="5" rx="1.2" />
        <rect x="92" y="40" width="5" height="5" rx="1.2" />
        <rect x="104" y="44" width="5" height="5" rx="1.2" />
        <rect x="92" y="52" width="5" height="5" rx="1.2" />
        <rect x="100" y="56" width="5" height="5" rx="1.2" />
        <rect x="116" y="62" width="5" height="5" rx="1.2" />
        <rect x="124" y="62" width="5" height="5" rx="1.2" />
        <rect x="116" y="70" width="5" height="5" rx="1.2" />
        <rect x="128" y="74" width="5" height="5" rx="1.2" />
        <rect x="92" y="70" width="5" height="5" rx="1.2" />
        <rect x="104" y="74" width="5" height="5" rx="1.2" />
      </g>
      {/* code strip at the plaque's foot */}
      <rect x="66" y="88" width="68" height="12" rx="6" fill="#f1ecff" />
      <g fill="#b7a2ff">
        <rect x="73" y="93" width="9" height="3" rx="1.5" />
        <rect x="86" y="93" width="9" height="3" rx="1.5" />
        <rect x="99" y="93" width="9" height="3" rx="1.5" />
        <rect x="112" y="93" width="9" height="3" rx="1.5" />
      </g>
      {/* scan pulse */}
      <path
        d="M158 44a30 30 0 0 1 0 40"
        fill="none"
        stroke="#a78bfa"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M168 34a44 44 0 0 1 0 60"
        fill="none"
        stroke="#a78bfa"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.28"
      />
      {/* verified badge */}
      <circle cx="146" cy="28" r="14" fill="#12b998" />
      <path
        d="M140 28.5l4.2 4.2 8-8.4"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
