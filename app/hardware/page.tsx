import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { QrCode } from "@/components/shell/qr-code";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { withTenant } from "@/lib/db/with-tenant";
import { listEstablishments } from "@/lib/establishments/queries";
import { restoreDevice } from "@/lib/hardware/actions";
import {
  formatConversionPct,
  getDeviceMetrics,
  listOrgDevices,
  listOrgDevicesWithProduct,
} from "@/lib/hardware/queries";
import { getDeviceRoi } from "@/lib/roi/summary";
import Link from "next/link";
import { ConnectDeviceModal } from "./_components/connect-device-modal";
import { DeviceCard } from "./_components/device-card";
import { NextStepBanner } from "./_components/next-step-banner";
import { SummaryStats } from "./_components/summary-stats";

/**
 * QR Codes — per repulabs v2 design, adapted: physical-product commerce
 * lives on Shopify; this screen is the SaaS-side dashboard for activated
 * stands, plaques, and cards.
 *
 * All metrics are computed from DeviceScan and Review tables — no demo data:
 *   • Total scans · 30d         → COUNT(DeviceScan WHERE scannedAt >= now-30d)
 *   • Reviews from QR · 30d     → COUNT(Review WHERE attributedDeviceId IS NOT NULL)
 *   • Per-device reviews/conv   → review.groupBy(attributedDeviceId)
 *   • Hero rating + count       → review.groupBy(establishmentId) with _avg
 *
 * Empty state when no activated devices: hero card with "Buy on Shopify"
 * external link and "Redeem activation code" CTA → /activate.
 */

export const dynamic = "force-dynamic";

const SHOPIFY_URL = process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL ?? "https://repulabs.com.au";

function publicQrUrl(slug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  return `${base}/r/${slug}`;
}

function titleFromSku(sku: string): string {
  if (sku.includes("plaque")) return "Wall Plaque";
  if (sku.includes("stand")) return "Counter Stand";
  if (sku.includes("card")) return "Counter Card";
  return "QR Product";
}

function subtitleFromSku(sku: string): string {
  if (sku.includes("plaque")) return "Brushed brass · 200×120 mm";
  if (sku.includes("stand")) return "Acrylic · 100×150 mm";
  if (sku.includes("card")) return "Premium card · 85×54 mm";
  return sku;
}

export default async function QrCodesPage({
  searchParams,
}: {
  searchParams: Promise<{
    activated?: string;
    /** Device id to focus in the QR + analytics panels. */
    selected?: string;
    /** Set after a redirect-URL update to show a success banner. */
    updated?: string;
    /** Set after a device delete to show a success banner. */
    deleted?: string;
    /** Filter view: "active" (default) | "trash". */
    view?: string;
    /** Set after restore to show a success banner. */
    restored?: string;
  }>;
}) {
  const { orgId } = await getOrgContext();

  const [devices, establishments] = await Promise.all([
    listOrgDevicesWithProduct(orgId),
    listEstablishments(orgId),
  ]);
  const businessOptions = establishments.map((e) => ({ id: e.id, name: e.name }));
  const sp = await searchParams;

  // Trash view — show only retired devices with a Restore button per card.
  // Early return so it works whether or not the user has any active devices.
  if (sp.view === "trash") {
    const retiredDevices = devices.filter((d) => d.status === "retired");
    return <TrashView devices={retiredDevices} justRestored={sp.restored} />;
  }

  const activeDevices = devices.filter((d) => d.status === "active");

  if (activeDevices.length === 0) {
    return <EmptyState establishments={businessOptions} recentActivation={sp.activated} />;
  }

  // Use ?selected=<deviceId> to focus the QR + analytics panels on a specific
  // device. Falls back to the first active device when no selection is
  // provided or the ID is invalid.
  const selectedDevice =
    (sp.selected && activeDevices.find((d) => d.id === sp.selected)) || activeDevices[0];
  if (!selectedDevice)
    return <EmptyState establishments={businessOptions} recentActivation={sp.activated} />;

  // Aggregate summary (the spec's 3-pill row) via the extracted, unit-tested
  // helper. The Pro/Free banner branch reads the canonical entitlement (same
  // source as <ProGate> — we never fork the plan check).
  const [metrics, isPro] = await Promise.all([
    getDeviceMetrics(orgId),
    orgHasFeature(orgId, "ai_autopilot"),
  ]);

  // Per-device review counts come from listOrgDevicesWithProduct (one groupBy).
  // The selected-device QR/analytics panels still need that device's scan
  // series — a single tenant-scoped read so the RLS predicate runs once.
  const reviewsByDeviceId = new Map<string, number>();
  for (const d of activeDevices) reviewsByDeviceId.set(d.id, d.reviewCount);

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [selectedScans, deviceRoi] = await Promise.all([
    withTenant(orgId, (tx) =>
      tx.deviceScan.findMany({
        where: { deviceId: selectedDevice.id, scannedAt: { gte: since30d } },
        select: { scannedAt: true },
      }),
    ),
    // Per-device scan-to-revenue line (Module 15): "this plaque generated N
    // reviews and an estimated $X". Fail-soft → zeros.
    getDeviceRoi(orgId, selectedDevice.id),
  ]);

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "My Devices"]}>
      <PageHeader
        kicker="Cards · plaques · stands"
        title="My Devices"
        description="Manage and track your connected ReviewBoost devices."
        actions={
          <>
            <a href={SHOPIFY_URL} target="_blank" rel="noopener noreferrer" className="btn">
              <Icon name="ext" size={12} />
              Buy stands
            </a>
            <Link href="/hardware/new" className="btn">
              <Icon name="qr" size={12} />
              Generate QR
            </Link>
            <ConnectDeviceModal establishments={businessOptions} />
          </>
        }
      />

      {sp.activated && (
        <div
          className="ds-card ds-card--pri"
          style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
        >
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          Device <code className="mono">{sp.activated}</code> activated. Scans now route to your
          Google review page.
        </div>
      )}
      {sp.updated && (
        <div
          className="ds-card ds-card--pri"
          style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
        >
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          Redirect URL updated. Scans now route to the new destination.
        </div>
      )}
      {sp.deleted && (
        <div
          className="ds-card"
          style={{
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 12.5,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#7f1d1d",
          }}
        >
          <span style={{ marginRight: 8 }}>🗑</span>
          QR code moved to Trash. You have 30 days to{" "}
          <Link
            href="/hardware?view=trash"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            restore it
          </Link>{" "}
          before it&rsquo;s permanently deleted.
        </div>
      )}
      {sp.restored && (
        <div
          className="ds-card ds-card--pri"
          style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
        >
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          QR code restored. Scans now route to the original Google review page again.
        </div>
      )}

      <NextStepBanner isPro={isPro} />

      <SummaryStats
        totalScans={metrics.totalScans}
        reviewsFromScans={metrics.reviewsFromScans}
        conversionRate={formatConversionPct(metrics.reviewsFromScans, metrics.totalScans)}
      />

      <div className="row" style={{ marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <div className="seg">
          <Link href="/hardware" className="seg__t is-active" style={{ textDecoration: "none" }}>
            Active
          </Link>
          <Link
            href="/hardware?view=trash"
            className="seg__t"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            Trash
            {devices.filter((d) => d.status === "retired").length > 0 && (
              <span
                style={{
                  display: "inline-grid",
                  placeItems: "center",
                  minWidth: 18,
                  height: 18,
                  padding: "0 6px",
                  borderRadius: 999,
                  background: "var(--rl-muted, #94a3b8)",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "var(--f-mono)",
                }}
              >
                {devices.filter((d) => d.status === "retired").length}
              </span>
            )}
          </Link>
        </div>
        <div style={{ flex: 1 }} />
        <span className="mono dim" style={{ fontSize: 10.5 }}>
          SHOWING {activeDevices.length} OF {devices.length}
        </span>
      </div>

      <div className="col" style={{ gap: 12, marginBottom: 22 }}>
        {activeDevices.map((d) => (
          <DeviceCard
            key={d.id}
            deviceId={d.id}
            productImageUrl={d.productImageUrl}
            productTitle={d.productName ?? titleFromSku(d.productSku)}
            productSubtitle={subtitleFromSku(d.productSku)}
            establishmentName={d.establishment?.name ?? null}
            scans={d.scanCount}
            reviews={d.reviewCount}
            shortSlug={d.shortSlug}
          />
        ))}
        <div
          className="ds-card"
          style={{
            border: "1.5px dashed var(--line)",
            background: "var(--surface-2)",
            boxShadow: "none",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="row" style={{ gap: 10 }}>
            <span
              aria-hidden
              style={{
                display: "grid",
                placeItems: "center",
                width: 34,
                height: 34,
                borderRadius: 9,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                color: "var(--pri)",
              }}
            >
              <Icon name="plus" size={16} />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                Add another device
              </div>
              <div className="dim" style={{ fontSize: 11.5 }}>
                Enter the code from a new card, plaque, or stand.
              </div>
            </div>
          </div>
          <ConnectDeviceModal
            establishments={businessOptions}
            triggerClassName="btn"
            triggerLabel="Add Device"
          />
        </div>
      </div>

      <div
        id="qr-panel"
        style={{
          display: "grid",
          gridTemplateColumns: "320px minmax(0, 1fr)",
          gap: 16,
          scrollMarginTop: 80,
        }}
      >
        <DeviceQrPanel
          deviceId={selectedDevice.id}
          code={selectedDevice.shortSlug}
          name={titleFromSku(selectedDevice.productSku)}
          location={selectedDevice.establishment?.name ?? "Unassigned"}
        />
        <ScanAnalytics
          scanCount={selectedDevice.scanCount}
          scans={selectedScans}
          reviews={reviewsByDeviceId.get(selectedDevice.id) ?? 0}
          estimatedRevenue={deviceRoi.estimatedRevenue}
          currency={deviceRoi.currency}
          isPro={isPro}
        />
      </div>
    </AppShellServer>
  );
}

function EmptyState({
  establishments,
  recentActivation,
}: {
  establishments: Array<{ id: string; name: string }>;
  recentActivation?: string;
}) {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "My Devices"]}>
      <PageHeader
        kicker="Cards · plaques · stands"
        title="My Devices"
        description="Manage and track your connected ReviewBoost devices."
        actions={<ConnectDeviceModal establishments={establishments} />}
      />
      {recentActivation && (
        <div
          className="ds-card ds-card--pri"
          style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
        >
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          Device activated, but it appears inactive — refresh to see it here.
        </div>
      )}

      {/* Dashed connect-a-device empty card with the brand illustration. */}
      <div
        className="ds-card"
        style={{
          border: "2px dashed var(--line)",
          boxShadow: "none",
          background: "var(--surface-2)",
          padding: "44px 28px",
          textAlign: "center",
          maxWidth: 640,
          marginInline: "auto",
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: static brand SVG illustration */}
        <img
          src="/assets/repulabs/illustrations/qr-stands-empty.svg"
          alt=""
          width={180}
          height={130}
          style={{ margin: "0 auto 18px", display: "block", maxWidth: "60%", height: "auto" }}
        />
        <h3 style={{ fontSize: 19, fontWeight: 600, margin: 0, letterSpacing: "-0.015em" }}>
          Connect your first device
        </h3>
        <p
          className="dim"
          style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.6, maxWidth: 420, marginInline: "auto" }}
        >
          Got a ReviewBoost card, plaque, or stand? Enter the 5-character code from your package and
          we&rsquo;ll route every scan to your Google review page.
        </p>
        <div
          className="row"
          style={{ gap: 8, marginTop: 18, justifyContent: "center", flexWrap: "wrap" }}
        >
          <ConnectDeviceModal
            establishments={establishments}
            triggerClassName="btn btn--pri btn--lg"
            triggerLabel="Connect a Device"
          />
          <Link href="/hardware/new" className="btn btn--lg">
            <Icon name="qr" size={14} />
            Generate a QR instead
          </Link>
        </div>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 14 }}>
          Don&rsquo;t have a device yet?{" "}
          <a
            href={SHOPIFY_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--pri)", textDecoration: "none" }}
          >
            Shop cards &amp; stands →
          </a>
        </div>
      </div>
    </AppShellServer>
  );
}

function DeviceQrPanel({
  deviceId,
  code,
  name,
  location,
}: {
  deviceId: string;
  code: string;
  name: string;
  location: string;
}) {
  const url = publicQrUrl(code);
  // The /api/devices/[id]/qr route streams PNG/SVG with the right Content-Type
  // + Content-Disposition headers — the browser triggers a download via the
  // `download` attribute on the anchor. PDF intentionally omitted for now; the
  // PNG prints well or can be "Save as PDF" via the browser print dialog.
  const downloadHref = (format: "png" | "svg") => `/api/devices/${deviceId}/qr?format=${format}`;
  const downloadName = (format: "png" | "svg") => `repulabs-${code}.${format}`;

  const linkStyle: React.CSSProperties = {
    flex: 1,
    justifyContent: "center",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    textDecoration: "none",
  };

  return (
    <div className="ds-card" style={{ padding: 18 }}>
      <h3 className="ds-card__title">QR for {code}</h3>
      <div className="ds-card__sub" style={{ marginBottom: 14 }}>
        {name} · {location}
      </div>

      <div
        style={{
          aspectRatio: 1,
          background: "#fff",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 20,
          position: "relative",
          display: "grid",
          placeItems: "center",
        }}
      >
        <QrCode value={url} size={280} />
      </div>
      <div className="row" style={{ marginTop: 12, gap: 6 }}>
        <a
          href={downloadHref("png")}
          download={downloadName("png")}
          className="btn btn--sm btn--pri"
          style={linkStyle}
        >
          <Icon name="download" size={11} />
          PNG (high-res)
        </a>
        <a
          href={downloadHref("svg")}
          download={downloadName("svg")}
          className="btn btn--sm"
          style={linkStyle}
        >
          <Icon name="download" size={11} />
          SVG (vector)
        </a>
      </div>
      <div
        className="mono dim"
        style={{ fontSize: 10, marginTop: 12, textAlign: "center", wordBreak: "break-all" }}
      >
        {url}
      </div>
    </div>
  );
}

function ScanAnalytics({
  scanCount,
  scans,
  reviews,
  estimatedRevenue,
  currency,
  isPro,
}: {
  scanCount: number;
  scans: Array<{ scannedAt: Date }>;
  reviews: number;
  estimatedRevenue: number;
  currency: string;
  isPro: boolean;
}) {
  // Bucket real DeviceScan entries by day/hour/dow over the last 30 days.
  const monthlyScans = Array<number>(30).fill(0);
  const peakHours = Array<number>(24).fill(0);
  const dayOfWeekRaw = Array<number>(7).fill(0);
  const dayLabels = ["M", "T", "W", "T", "F", "S", "S"];
  for (const s of scans) {
    const days = Math.floor((Date.now() - s.scannedAt.getTime()) / (24 * 60 * 60 * 1000));
    const idx = 29 - days;
    if (idx >= 0 && idx < 30) monthlyScans[idx] = (monthlyScans[idx] ?? 0) + 1;
    peakHours[s.scannedAt.getHours()] = (peakHours[s.scannedAt.getHours()] ?? 0) + 1;
    const dow = (s.scannedAt.getDay() + 6) % 7;
    dayOfWeekRaw[dow] = (dayOfWeekRaw[dow] ?? 0) + 1;
  }
  const dayOfWeek = dayOfWeekRaw.map((v, i) => ({
    d: dayLabels[i] ?? "?",
    v,
  }));
  const maxDow = Math.max(...dayOfWeek.map((d) => d.v), 1);
  const peakMax = Math.max(...peakHours, 1);
  const monthlyMax = Math.max(...monthlyScans, 1);
  const uniqueScans = scans.length;
  const todayScans = monthlyScans[29] ?? 0;

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Scan analytics</h3>
        <div className="seg">
          <button type="button" className="seg__t">
            7d
          </button>
          <button type="button" className="seg__t is-active">
            30d
          </button>
          <button type="button" className="seg__t">
            90d
          </button>
        </div>
      </div>
      <div className="ds-card__body">
        <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
          <Mini l="SCANS · 30d" v={String(uniqueScans)} />
          <Mini l="TOTAL · all time" v={String(scanCount)} />
          <Mini l="TODAY" v={String(todayScans)} />
          <Mini l="REVIEWS" v={String(reviews)} />
        </div>

        {/* Scan-to-revenue line (Module 15) — the tangible ROI story. */}
        <Link
          href="/autopilot?tab=roi"
          className="row"
          style={{
            gap: 10,
            padding: "10px 12px",
            marginBottom: 16,
            background: "var(--pri-50)",
            borderRadius: 8,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <Icon name="trend" size={16} style={{ color: "var(--pri)", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, flex: 1, lineHeight: 1.5 }}>
            This device generated <strong>{reviews}</strong> review{reviews === 1 ? "" : "s"}
            {isPro ? (
              <>
                {" "}
                and an estimated{" "}
                <strong>
                  {currency} {estimatedRevenue.toLocaleString()}
                </strong>{" "}
                in booked revenue.
              </>
            ) : (
              <>. Upgrade to see the estimated revenue it drove.</>
            )}
          </span>
          <Icon name="chevR" size={13} style={{ color: "var(--rl-muted-2)" }} />
        </Link>

        <div style={{ height: 120, display: "flex", alignItems: "flex-end", gap: 2 }}>
          {monthlyScans.map((v, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: ordered fixed-length time series
              key={`bar-${i}`}
              style={{
                flex: 1,
                height: `${(v / monthlyMax) * 100}%`,
                background: i === monthlyScans.length - 1 ? "var(--pri)" : "var(--pri-300)",
                borderRadius: 2,
                minHeight: 2,
                opacity: i === monthlyScans.length - 1 ? 1 : 0.7,
              }}
            />
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="mono dim" style={{ fontSize: 10 }}>
            {labelFromDays(29)}
          </span>
          <span className="mono dim" style={{ fontSize: 10, marginLeft: "auto" }}>
            {labelFromDays(0)}
          </span>
        </div>

        <div className="divider" />

        <div className="grid-2" style={{ gap: 16 }}>
          <div>
            <div className="lbl-mono">Peak hours</div>
            <div
              className="row"
              style={{ marginTop: 6, height: 60, alignItems: "flex-end", gap: 1 }}
            >
              {peakHours.map((h, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: 24 fixed hour buckets
                  key={`hour-${i}`}
                  style={{
                    flex: 1,
                    height: `${(h / peakMax) * 100}%`,
                    background: i >= 17 && i <= 19 ? "var(--pri)" : "var(--pri-100)",
                    borderRadius: 2,
                    minHeight: 2,
                  }}
                />
              ))}
            </div>
            <div
              className="row"
              style={{
                marginTop: 4,
                fontSize: 10,
                color: "var(--rl-muted)",
                fontFamily: "var(--f-mono)",
              }}
            >
              <span>00</span>
              <span style={{ marginLeft: "auto" }}>12</span>
              <span style={{ marginLeft: "auto" }}>24</span>
            </div>
          </div>
          <div>
            <div className="lbl-mono">By day of week</div>
            <div className="row" style={{ marginTop: 6, gap: 4 }}>
              {dayOfWeek.map((d, i) => (
                <div key={`${d.d}-${i}`} style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      height: 40,
                      background: "var(--pri-100)",
                      borderRadius: 4,
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: `${(d.v / maxDow) * 100}%`,
                        background: i === 4 ? "var(--pri)" : "var(--pri-300)",
                        borderRadius: 4,
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--rl-muted)", marginTop: 4 }}>{d.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Mini({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div className="lbl-mono">{l}</div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{v}</div>
    </div>
  );
}

function labelFromDays(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ============================================================
   Trash view — visible when /hardware?view=trash.
   Lists every retired (soft-deleted) device with a Restore button.
   Real hard-deletion only happens via a background sweep after 30 days
   (planned cron job; for now the rows stay forever — easy to recover).
============================================================ */

type RetiredDevice = Awaited<ReturnType<typeof listOrgDevices>>[number];

function TrashView({
  devices,
  justRestored,
}: {
  devices: RetiredDevice[];
  justRestored?: string;
}) {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "My Devices", "Trash"]}>
      <PageHeader
        kicker="My devices · trash"
        title="Restore a deleted device"
        description="Soft-deleted devices live here for 30 days before they're hard-deleted. Restore one to reactivate the same code, slug, and redirect URL — no need to re-enter anything."
        actions={
          <Link href="/hardware" className="btn">
            <Icon name="chevL" size={12} />
            Back to my devices
          </Link>
        }
      />

      {justRestored && (
        <div
          className="ds-card ds-card--pri"
          style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
        >
          <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
          QR restored. Visit <Link href="/hardware">Active QRs</Link> to confirm.
        </div>
      )}

      {/* Tab segment so user can flip back to active. Same shape as the
          one on the active list for consistency. */}
      <div className="row" style={{ marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <div className="seg">
          <Link href="/hardware" className="seg__t" style={{ textDecoration: "none" }}>
            Active
          </Link>
          <Link
            href="/hardware?view=trash"
            className="seg__t is-active"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Trash
            <span
              style={{
                display: "inline-grid",
                placeItems: "center",
                minWidth: 18,
                height: 18,
                padding: "0 6px",
                borderRadius: 999,
                background: "var(--ink, #0b0d0e)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "var(--f-mono)",
              }}
            >
              {devices.length}
            </span>
          </Link>
        </div>
      </div>

      {devices.length === 0 ? (
        <div
          className="ds-card"
          style={{
            padding: "40px 24px",
            textAlign: "center",
            background: "var(--surface)",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }} aria-hidden>
            🗑
          </div>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              marginBottom: 6,
            }}
          >
            Trash is empty
          </h3>
          <p style={{ fontSize: 13.5, color: "var(--rl-muted)", lineHeight: 1.55 }}>
            You haven&rsquo;t deleted any QR codes recently. Deleted QRs land here for 30 days
            before they&rsquo;re hard-deleted.
          </p>
          <Link href="/hardware" className="btn" style={{ marginTop: 16, display: "inline-flex" }}>
            <Icon name="chevL" size={12} />
            Back to active QRs
          </Link>
        </div>
      ) : (
        <div className="grid-3" style={{ gap: 16 }}>
          {devices.map((d) => (
            <TrashedDeviceCard key={d.id} device={d} />
          ))}
        </div>
      )}

      <div
        className="ds-card"
        style={{
          marginTop: 24,
          padding: "12px 16px",
          background: "var(--surface-2, #fafbf8)",
          border: "1px dashed var(--line)",
          color: "var(--rl-muted)",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: "var(--ink-2)" }}>Heads up.</strong> Restoring a QR brings back the
        original slug, redirect URL, and HMAC signature. If you&rsquo;ve printed new plaques with
        the same code in the meantime, scanners of the old plaque will route to the restored URL —
        make sure that&rsquo;s what you want.
      </div>
    </AppShellServer>
  );
}

function TrashedDeviceCard({ device: d }: { device: RetiredDevice }) {
  return (
    <div
      className="ds-card"
      style={{
        padding: 18,
        opacity: 0.92,
        background: "var(--surface)",
        border: "1px solid var(--line)",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span
          style={{
            fontSize: 10.5,
            fontFamily: "var(--f-mono)",
            letterSpacing: ".12em",
            color: "var(--rl-muted)",
            fontWeight: 600,
          }}
        >
          CODE · {d.shortSlug}
        </span>
        <span
          style={{
            fontSize: 10.5,
            fontFamily: "var(--f-mono)",
            letterSpacing: ".08em",
            color: "#b91c1c",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            padding: "1px 6px",
            borderRadius: 4,
            fontWeight: 600,
          }}
        >
          RETIRED
        </span>
      </div>
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.015em",
          margin: 0,
        }}
      >
        {d.establishment?.name ?? "Unassigned"}
      </h3>
      <p
        style={{
          fontSize: 11.5,
          color: "var(--rl-muted)",
          marginTop: 4,
          marginBottom: 12,
        }}
      >
        SKU: {d.productSku} · Created {new Date(d.createdAt).toLocaleDateString()}
      </p>
      <div
        style={{
          padding: "8px 10px",
          background: "var(--surface-2, #fafbf8)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          fontSize: 11.5,
          fontFamily: "var(--f-mono)",
          color: "var(--ink-2)",
          wordBreak: "break-all",
          marginBottom: 14,
        }}
      >
        {d.redirectUrl ?? "—"}
      </div>
      <form action={restoreDevice}>
        <input type="hidden" name="deviceId" value={d.id} />
        <button
          type="submit"
          className="btn btn--pri"
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Icon name="arrowR" size={11} />
          Restore QR
        </button>
      </form>
    </div>
  );
}
