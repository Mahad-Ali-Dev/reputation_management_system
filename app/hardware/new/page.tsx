import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { withTenant } from "@/lib/db/with-tenant";
import { generateSelfServiceQr } from "@/lib/hardware/actions";
import { upgradeHref } from "@/lib/billing/upgrade-href";
import Link from "next/link";
import { LabelField } from "./_components/label-field";
import "./generate-qr.css";

/**
 * Self-service QR creation — free-tier core flow, restyled to the "Generate QR"
 * kit (hero + Configure card + How-it-works + Analytics promo).
 *
 * The form + server wiring are UNCHANGED: it picks an establishment, optionally
 * accepts a pasted Google review URL + an internal label, and the existing
 * `generateSelfServiceQr` action provisions a Device row (status "active") with a
 * fresh signed shortSlug. On success it redirects to /hardware?activated=… where
 * the new QR product card appears.
 */

export const dynamic = "force-dynamic";

export default async function NewQrPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;

  const [establishments, isPro] = await Promise.all([
    withTenant(orgId, (tx) =>
      tx.establishment.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, googlePlaceId: true },
      }),
    ),
    orgHasFeature(orgId, "ai_autopilot"),
  ]);

  if (establishments.length === 0) {
    return (
      <AppShellServer topBar={<TopBar />} crumbs={["Business Setup", "Device Manager", "Generate"]}>
        <PageHeader
          kicker="Generate a QR code"
          title="Add a listing first"
          description="A QR code points to a specific listing's Google review page. Add your first listing so we know where to send scanners."
          actions={
            <Link href="/establishments/new" className="btn btn--pri">
              <Icon name="plus" size={12} />
              Add listing
            </Link>
          }
        />
        <div
          className="ds-card"
          style={{ padding: 48, textAlign: "center", maxWidth: 520, marginInline: "auto" }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              margin: "0 auto 18px",
              background: "var(--pri-50)",
              color: "var(--pri)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon name="building" size={26} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 600 }}>No listings yet</h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Add the listing this QR will point to. Once it exists, you can connect Google Business
            Profile to pull reviews automatically — or paste your Google review link directly.
          </p>
          <Link href="/establishments/new" className="btn btn--pri" style={{ marginTop: 16 }}>
            <Icon name="plus" size={12} />
            Add your first listing
          </Link>
        </div>
      </AppShellServer>
    );
  }

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Business Setup", "Device Manager", "Generate"]}>
      <div className="gq">
        {/* Hero — header (left) · 3D QR-on-pedestal illustration (center) ·
            back button (right), matching the Generate-QR mockup. */}
        <div className="gq-hero">
          <div className="gq-hero__lead">
            <span className="gq-hero__eyebrow">Free · self-service</span>
            <h1 className="gq-hero__title">
              Generate a <em>QR code</em>
            </h1>
            <p className="gq-hero__sub">
              Customers scan, land on your Google review page, leave a review. No hardware needed —
              print this QR on receipts, signage, business cards, or just embed it on your site.
            </p>
            <Link href="/hardware" className="btn" style={{ marginTop: 14 }}>
              <Icon name="chevL" size={12} />
              Back to my devices
            </Link>
          </div>
          {/* biome-ignore lint/performance/noImgElement: static kit illustration (large SVG) */}
          <img
            src="/assets/repulabs/my-devices/qr-pedestal.svg"
            alt=""
            aria-hidden
            className="gq-hero__art"
          />
        </div>

        {sp.error && (
          <div
            className="ds-card"
            style={{
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12.5,
              background: "var(--bad-soft)",
              borderColor: "var(--bad)",
              color: "#b91c1c",
            }}
          >
            We couldn't generate the QR. Double-check the inputs and try again.
          </div>
        )}

        <div className="gq-grid">
          {/* Configure card */}
          <section className="gq-card" aria-label="Configure">
            <div className="gq-card__head">
              <span className="gq-card__icon" aria-hidden>
                <Icon name="settings" size={20} />
              </span>
              <div>
                <h2 className="gq-card__title">Configure</h2>
                <span className="chip chip--ok" style={{ height: 18, fontSize: 10, marginTop: 2 }}>
                  <span className="live" />
                  No hardware required
                </span>
              </div>
            </div>
            <div className="gq-card__body">
              <form action={generateSelfServiceQr} className="col" style={{ gap: 0 }}>
                {/* Step 1 — business */}
                <div className="gq-step">
                  <span className="gq-step__badge">1</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="gq-step__title">Pick the business</div>
                    <div className="gq-step__helper">Business this QR points to</div>
                    <div className="gq-step__field">
                      <select
                        name="establishmentId"
                        required
                        defaultValue={establishments[0]?.id}
                        aria-label="Business this QR points to"
                        className="gq-select"
                      >
                        {establishments.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                            {!e.googlePlaceId ? " (no Google link yet)" : ""}
                          </option>
                        ))}
                      </select>
                      <p className="gq-note">
                        Don&rsquo;t see it? <Link href="/establishments/new">Add a business →</Link>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 2 — review URL */}
                <div className="gq-step">
                  <span className="gq-step__badge">2</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="gq-step__title">Google review link (optional)</div>
                    <div className="gq-step__helper">Paste your Google review link</div>
                    <div className="gq-step__field">
                      <input
                        type="url"
                        name="reviewUrl"
                        placeholder="https://g.page/r/..."
                        autoComplete="off"
                        aria-label="Google review link"
                        className="gq-input"
                        style={{ fontFamily: "var(--f-mono)" }}
                      />
                      <p className="gq-note">
                        Leave blank to use your canonical Google Business Profile, or paste the link
                        Google gives you on your business profile (Share → Get review link).
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 3 — internal label (client chips island) */}
                <div className="gq-step">
                  <span className="gq-step__badge">3</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="gq-step__title">Internal label (optional)</div>
                    <div className="gq-step__helper">Where will you use it?</div>
                    <LabelField />
                  </div>
                </div>

                <div className="gq-actions">
                  <Link href="/hardware" className="btn">
                    Cancel
                  </Link>
                  <button type="submit" className="gq-generate">
                    <Icon name="qr" size={15} />
                    Generate QR code
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Right column — How it works + Analytics promo */}
          <aside className="col" style={{ gap: 12 }}>
            <section className="gq-card" aria-label="How it works">
              <div className="gq-card__head">
                <span className="gq-card__icon" aria-hidden>
                  <Icon name="bolt" size={20} />
                </span>
                <h2 className="gq-card__title">How it works</h2>
              </div>
              <div className="gq-card__body">
                <ol className="gq-tl">
                  <li className="gq-tl__item">
                    <span className="gq-tl__icon" aria-hidden>
                      <Icon name="building" size={15} />
                    </span>
                    <div className="gq-tl__title">Pick or add your business</div>
                    <p className="gq-tl__copy">
                      Each QR points to one business&rsquo;s Google review page. You can manage as
                      many businesses as you have.
                    </p>
                  </li>
                  <li className="gq-tl__item">
                    <span className="gq-tl__icon" aria-hidden>
                      <Icon name="share" size={15} />
                    </span>
                    <div className="gq-tl__title">Paste a Google link (or skip)</div>
                    <p className="gq-tl__copy">
                      If your business is on Google, we&rsquo;ll generate the review link
                      automatically. Or paste your existing share link — it works both ways.
                    </p>
                  </li>
                  <li className="gq-tl__item">
                    <span className="gq-tl__icon" aria-hidden>
                      <Icon name="download" size={15} />
                    </span>
                    <div className="gq-tl__title">Download or print</div>
                    <p className="gq-tl__copy">
                      We&rsquo;ll show you the QR right after generating. Download PNG or SVG. Print
                      it. Embed it. Share it.
                    </p>
                  </li>
                </ol>
              </div>
            </section>

            <section className="gq-card gq-promo" aria-label="Analytics">
              <div className="gq-card__head">
                <span className="gq-card__icon" aria-hidden>
                  <Icon name="bars" size={20} />
                </span>
                <h2 className="gq-card__title">Analytics</h2>
              </div>
              <div className="gq-card__body">
                {/* Intro copy + small bar-chart thumbnail top-right (kit). */}
                <div className="gq-promo__intro">
                  <p className="gq-promo__copy">
                    Track which QR codes drive scans and reviews. Understand performance by
                    placement, campaign, and business location.
                  </p>
                  {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
                  <img
                    src="/assets/repulabs/my-devices/analytics-thumb.svg"
                    alt=""
                    aria-hidden
                    className="gq-promo__thumb"
                  />
                </div>
                {/* Charts row — kit bar chart (Y-axis) + line chart. */}
                <div className="gq-promo__charts" aria-hidden>
                  {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
                  <img
                    src="/assets/repulabs/my-devices/analytics-bar-chart.svg"
                    alt=""
                    aria-hidden
                    className="gq-promo__bar"
                  />
                  {/* biome-ignore lint/performance/noImgElement: static kit illustration */}
                  <img
                    src="/assets/repulabs/my-devices/analytics-line-chart.svg"
                    alt=""
                    aria-hidden
                    className="gq-promo__linechart"
                  />
                </div>
                {isPro ? (
                  <Link href="/reports" className="gq-promo__cta">
                    <Icon name="trend" size={14} />
                    View analytics
                  </Link>
                ) : (
                  <Link href={upgradeHref("ai_autopilot")} className="gq-promo__cta">
                    <Icon name="sparkle" size={14} />
                    Upgrade to Pro
                  </Link>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShellServer>
  );
}
