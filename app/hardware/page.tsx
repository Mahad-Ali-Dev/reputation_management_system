import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { QrCode } from "@/components/shell/qr-code";
import { TopBar } from "@/components/topbar";
import { getAdminSession } from "@/lib/admin/session";
import { getOrgContext } from "@/lib/auth/org-context";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { prisma } from "@/lib/db/client";
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
import { DeviceTable } from "./_components/device-table";
import { NextStepBanner } from "./_components/next-step-banner";
import { recordNfcUid } from "./_components/nfc-actions";
import { NfcConfigCard } from "./_components/nfc-config-card";
import { SummaryStats } from "./_components/summary-stats";
import "./devices.css";

/** Product kinds that are programmed as NFC chips rather than printed QR. */
const NFC_KINDS = new Set(["nfc", "wifi", "multi_platform"]);

function isNfcKind(productKind: string | null | undefined): boolean {
  return NFC_KINDS.has(productKind ?? "qr");
}

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

type NfcStatus = "saved" | "duplicate" | "bad_uid" | "not_found" | "unavailable" | "error";
const NFC_STATUSES = new Set<NfcStatus>([
  "saved",
  "duplicate",
  "bad_uid",
  "not_found",
  "unavailable",
  "error",
]);

/** Narrow the raw ?nfc= query value to a known NfcStatus, else null. */
function normalizeNfcStatus(raw: string | undefined): NfcStatus | null {
  return raw && NFC_STATUSES.has(raw as NfcStatus) ? (raw as NfcStatus) : null;
}

/**
 * Map a device's review destination + kind to a platform glyph key for the QR
 * download links. Mirrors the server-side default in /api/devices/[id]/qr so the
 * downloaded image's centered glyph matches what the user expects. Returns null
 * → plain QR (no glyph).
 */
function platformForDevice(redirectUrl: string | null, productKind: string): string | null {
  if (productKind === "multi_platform") return "multi";
  if (!redirectUrl) return null;
  let host = "";
  try {
    host = new URL(redirectUrl).host.toLowerCase();
  } catch {
    return null;
  }
  if (host.includes("google.") || host.endsWith("g.page") || host.includes("goo.gl")) {
    return "google";
  }
  if (host.includes("facebook.") || host.includes("fb.")) return "facebook";
  if (host.includes("instagram.")) return "instagram";
  return null;
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
    /** Result of an NFC-UID save (see recordNfcUid): saved|duplicate|bad_uid|… */
    nfc?: string;
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
        kicker="QR and NFC"
        title="Turn the counter into a review engine"
        description="QR stands, NFC cards, previews, scan analytics, and activation status."
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

      <div className="dev-layout">
        {/* Lead section — the device-list table (after-mockup). Rows link to
            ?selected=<id>#qr-panel, the page's existing selection mechanism. */}
        <DeviceTable
          devices={activeDevices.map((d) => ({
            id: d.id,
            productTitle: d.productName ?? titleFromSku(d.productSku),
            productImageUrl: d.productImageUrl,
            establishmentName: d.establishment?.name ?? null,
            productKind: d.productKind,
            shortSlug: d.shortSlug,
            scans: d.scanCount,
            reviews: d.reviewCount,
          }))}
          selectedId={selectedDevice.id}
          establishments={businessOptions}
        />

        {/* Preview rail — QR preview for the selected device, plus the NFC
            tap-destination config when the device is an NFC kind (a tap and a
            scan resolve through the same /r/<slug> link). */}
        <div id="qr-panel" className="dev-rail" style={{ scrollMarginTop: 80 }}>
          <DeviceQrPanel
            deviceId={selectedDevice.id}
            code={selectedDevice.shortSlug}
            name={selectedDevice.productName ?? titleFromSku(selectedDevice.productSku)}
            location={selectedDevice.establishment?.name ?? "Unassigned"}
            redirectUrl={selectedDevice.redirectUrl ?? null}
            productKind={selectedDevice.productKind}
          />
          {isNfcKind(selectedDevice.productKind) && (
            <NfcConfigCard
              deviceId={selectedDevice.id}
              productKind={selectedDevice.productKind}
              encodeUrl={publicQrUrl(selectedDevice.shortSlug)}
              slug={selectedDevice.shortSlug}
              currentNfcUid={selectedDevice.nfcUid ?? null}
              deviceTitle={selectedDevice.productName ?? titleFromSku(selectedDevice.productSku)}
              recordNfcUidAction={recordNfcUid}
              saveStatus={normalizeNfcStatus(sp.nfc)}
            />
          )}
        </div>
      </div>

      <ScanAnalytics
        deviceLabel={selectedDevice.productName ?? titleFromSku(selectedDevice.productSku)}
        code={selectedDevice.shortSlug}
        scanCount={selectedDevice.scanCount}
        scans={selectedScans}
        reviews={reviewsByDeviceId.get(selectedDevice.id) ?? 0}
        estimatedRevenue={deviceRoi.estimatedRevenue}
        currency={deviceRoi.currency}
        isPro={isPro}
      />

      <BatchGeneratorSection />
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
        kicker="QR and NFC"
        title="Turn the counter into a review engine"
        description="QR stands, NFC cards, previews, scan analytics, and activation status."
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
  redirectUrl,
  productKind,
}: {
  deviceId: string;
  code: string;
  name: string;
  location: string;
  redirectUrl: string | null;
  productKind: string;
}) {
  const url = publicQrUrl(code);
  // Center a platform glyph (Google / Facebook / Instagram / multi) in the
  // downloaded QR when we can infer one from the destination — matches the
  // server-side default in /api/devices/[id]/qr. null → plain QR.
  const platform = platformForDevice(redirectUrl, productKind);
  // The /api/devices/[id]/qr route streams PNG/SVG with the right Content-Type
  // + Content-Disposition headers — the browser triggers a download via the
  // `download` attribute on the anchor. PDF intentionally omitted for now; the
  // PNG prints well or can be "Save as PDF" via the browser print dialog.
  const downloadHref = (format: "png" | "svg") =>
    `/api/devices/${deviceId}/qr?format=${format}${platform ? `&platform=${platform}` : ""}`;
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
      {platform && (
        <div
          className="dim row"
          style={{ fontSize: 10.5, marginTop: 8, gap: 5, justifyContent: "center" }}
        >
          <Icon name={platform === "facebook" ? "fb" : platform === "google" ? "google" : "star"} size={11} />
          Downloads embed the {platformLabel(platform)} glyph in the center.
        </div>
      )}
      <div
        className="mono dim"
        style={{ fontSize: 10, marginTop: 12, textAlign: "center", wordBreak: "break-all" }}
      >
        {url}
      </div>
    </div>
  );
}

function platformLabel(p: string): string {
  if (p === "google") return "Google";
  if (p === "facebook") return "Facebook";
  if (p === "instagram") return "Instagram";
  if (p === "multi") return "multi-platform";
  return "Repulabs";
}

function ScanAnalytics({
  deviceLabel,
  code,
  scanCount,
  scans,
  reviews,
  estimatedRevenue,
  currency,
  isPro,
}: {
  /** Friendly name of the selected device, e.g. "Wall Plaque". */
  deviceLabel: string;
  /** The device's short slug, shown so it's clear which row is charted. */
  code: string;
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
    <div className="ds-card" style={{ marginBottom: 22 }}>
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Scan analytics</h3>
          <div className="ds-card__sub" style={{ margin: 0 }}>
            {deviceLabel} · {code}
          </div>
        </div>
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
   Batch generator (admin-gated) — surfaces the EXISTING bulk QR/NFC
   batch feature that lives at /admin/hardware (1-500 units per run,
   streamed ZIP of QR/NFC encode assets).

   Rendered ONLY when a verified platform-admin JWT (`admin_session`)
   is present — tenant users never see it, so nothing is misleading.
   `hardware_batches` is a global (non-tenant) table; reading it here
   mirrors the documented direct-prisma pattern in app/admin/hardware.
   Fails soft (hidden stat) if the table isn't migrated yet.
============================================================ */

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703") return true;
  const metaCode = (err as { meta?: { code?: string } } | null)?.meta?.code;
  return metaCode === "42P01" || metaCode === "42703";
}

async function BatchGeneratorSection() {
  const admin = await getAdminSession();
  if (!admin) return null;

  let totalUnits = 0;
  let batchCount = 0;
  let latest: Date | null = null;
  try {
    const agg = await prisma.hardwareBatch.aggregate({
      _sum: { quantity: true },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    totalUnits = agg._sum.quantity ?? 0;
    batchCount = agg._count._all;
    latest = agg._max.createdAt;
  } catch (err) {
    if (!isMissingRelation(err)) throw err;
    // Table not migrated yet — still show the entry point, just without stats.
  }

  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="dev-card-head">
        <span className="dev-card-head__icon" aria-hidden>
          <Icon name="qr" size={15} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h3 className="dev-card-head__title">Batch generator</h3>
          <p className="dev-card-head__sub">
            Admin hardware · bulk QR/NFC production runs (up to 500 units)
          </p>
        </div>
        <span className="dev-card-head__count">ADMIN ONLY</span>
      </div>
      <div className="dev-batch-body">
        <div className="dev-batch-stat">
          <div className="lbl-mono">Labels generated</div>
          <div className="dev-batch-stat__num">{totalUnits.toLocaleString("en-US")}</div>
          <div className="dev-batch-stat__sub">
            {batchCount.toLocaleString("en-US")} batch{batchCount === 1 ? "" : "es"}
            {latest ? ` · last ${latest.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
          </div>
        </div>
        <div className="dev-batch-actions">
          <Link href="/admin/hardware" className="btn btn--pri">
            <Icon name="qr" size={12} />
            Open batch generator
          </Link>
          <span className="dim" style={{ fontSize: 11.5 }}>
            Mint devices in bulk and download the ZIP of QR/NFC encode assets.
          </span>
        </div>
      </div>
    </div>
  );
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
