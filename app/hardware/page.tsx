import { AppShellServer } from "@/components/app-shell-server";
import { Icon } from "@/components/shell/icon";
import { QrCode } from "@/components/shell/qr-code";
import { TopBar } from "@/components/topbar";
import { getAdminSession } from "@/lib/admin/session";
import { getOrgContext } from "@/lib/auth/org-context";
import { roleAtLeast } from "@/lib/auth/rbac";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { upgradeHref } from "@/lib/billing/upgrade-href";
import { prisma } from "@/lib/db/client";
import { listEstablishments } from "@/lib/establishments/queries";
import { restoreDevice } from "@/lib/hardware/actions";
import {
  formatConversionPct,
  getDeviceDashboardExtras,
  getDeviceMetrics,
  getScannedDevice,
  type listOrgDevices,
  listOrgDevicesWithProduct,
} from "@/lib/hardware/queries";
import { ChevronLeft, CircleCheck, Info, Trash2 } from "lucide-react";
import Link from "next/link";
import { ConnectDeviceModal } from "./_components/connect-device-modal";
import {
  MdDevicesImpact,
  MdFooterTip,
  MdHero,
  MdSummaryRow,
  MdTrainingBanner,
} from "./_components/dashboard-cards";
import { DeviceTable } from "./_components/device-table";
import { GenerateQrModal, type QrBusiness } from "./_components/generate-qr-modal";
import { recordNfcUid } from "./_components/nfc-actions";
import { NfcConfigCard } from "./_components/nfc-config-card";
import { QrActions } from "./_components/qr-actions";
import { TrashDeviceCard } from "./_components/trash-device-card";
import "./devices.css";
import "./my-devices.css";
import "./my-devices-glass.css";

/** Product kinds that are programmed as NFC chips rather than printed QR. */
const NFC_KINDS = new Set(["nfc", "wifi", "multi_platform"]);

function isNfcKind(productKind: string | null | undefined): boolean {
  return NFC_KINDS.has(productKind ?? "qr");
}

/**
 * My Devices — redesigned to the new "My Devices" kit, adapted: physical-product
 * commerce lives on Shopify; this screen is the SaaS-side dashboard for activated
 * stands, plaques, and cards.
 *
 * Every metric/figure is computed from REAL DeviceScan / Review / Device tables
 * — mockup numbers (15,200 / 450 / Cafe Coffee Day) are placeholders only:
 *   • Summary row    → getDeviceMetrics + getDeviceDashboardExtras (today, active)
 *   • Live feed      → recent reviews (getDeviceDashboardExtras.recentReviews)
 *   • Reviews-rating → review.groupBy(rating)
 *   • Devices impact → 7-day DeviceScan + Review series
 *   • QR card        → the SELECTED device's signed /r/<slug> + per-device stats
 *
 * Empty state when no activated devices: kit illustration + Connect-a-device CTA.
 */

export const dynamic = "force-dynamic";

const SHOPIFY_URL = process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL ?? "https://repulabs.com.au";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";

function publicQrUrl(slug: string): string {
  return `${APP_ORIGIN}/r/${slug}`;
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
    /** "1" after a device is released back to unactivated inventory. */
    released?: string;
    /** "1" opens the Generate-QR sheet (old /hardware/new links land here). */
    generate?: string;
    /** Set by generateSelfServiceQr on invalid input; shown inside the sheet. */
    error?: string;
  }>;
}) {
  const { orgId, role } = await getOrgContext();

  const [devices, establishments, scanned] = await Promise.all([
    listOrgDevicesWithProduct(orgId),
    listEstablishments(orgId),
    // The stand this browser last scanned, if any — pre-fills the Add-device
    // wizard so the customer only types the 5-character code.
    getScannedDevice(orgId),
  ]);
  const businessOptions = establishments.map((e) => ({ id: e.id, name: e.name }));
  const sp = await searchParams;
  const qrBusinesses: QrBusiness[] = establishments.map((e) => ({
    id: e.id,
    name: e.name,
    hasGoogle: !!e.googlePlaceId,
  }));
  const qrSheet = { businesses: qrBusinesses, defaultOpen: sp.generate === "1", error: !!sp.error };

  // Only offer a device that's actually still claimable; a stale cookie
  // pointing at an already-activated stand would pre-fill a dead end.
  const detectedQrUrl = scanned?.claimable ? publicQrUrl(scanned.slug) : null;
  const detectedSerial = scanned?.claimable ? scanned.serial : null;

  // Trash view — show only retired devices with a Restore button per card.
  if (sp.view === "trash") {
    const retiredDevices = devices.filter((d) => d.status === "retired");
    return (
      <TrashView
        devices={retiredDevices}
        justRestored={sp.restored}
        justReleased={sp.released === "1"}
        canRelease={roleAtLeast(role, "admin")}
      />
    );
  }

  const activeDevices = devices.filter((d) => d.status === "active");
  // Needed BEFORE the empty-state return: deleting your only device drops you
  // into that state, and it used to render a hardcoded "Trash (0)" — so the
  // device you just deleted became invisible and Restore was unreachable.
  const retiredCount = devices.filter((d) => d.status === "retired").length;

  if (activeDevices.length === 0) {
    return (
      <EmptyState
        establishments={businessOptions}
        qrSheet={qrSheet}
        recentActivation={sp.activated}
        detectedQrUrl={detectedQrUrl}
        detectedSerial={detectedSerial}
        retiredCount={retiredCount}
      />
    );
  }

  // Use ?selected=<deviceId> to focus the QR + analytics panels on a specific
  // device. Falls back to the first active device.
  const selectedDevice =
    (sp.selected && activeDevices.find((d) => d.id === sp.selected)) || activeDevices[0];
  if (!selectedDevice)
    return (
      <EmptyState
        establishments={businessOptions}
        qrSheet={qrSheet}
        recentActivation={sp.activated}
        detectedQrUrl={detectedQrUrl}
        detectedSerial={detectedSerial}
        retiredCount={retiredCount}
      />
    );

  // Org-aggregate metrics + entitlement + dashboard extras (all live, fail-soft).
  const [metrics, isPro, extras] = await Promise.all([
    getDeviceMetrics(orgId),
    orgHasFeature(orgId, "ai_autopilot"),
    getDeviceDashboardExtras(orgId, 3),
  ]);

  const reviewsByDeviceId = new Map<string, number>();
  for (const d of activeDevices) reviewsByDeviceId.set(d.id, d.reviewCount);

  const selectedName = selectedDevice.productName ?? titleFromSku(selectedDevice.productSku);
  const selectedUrl = publicQrUrl(selectedDevice.shortSlug);
  const selectedPlatform = platformForDevice(
    selectedDevice.redirectUrl ?? null,
    selectedDevice.productKind,
  );
  const qrDownloadHref = `/api/devices/${selectedDevice.id}/qr?format=png${selectedPlatform ? `&platform=${selectedPlatform}` : ""}`;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Business Setup", "Device Manager"]}>
      <div className="md">
        {/* Header — hero title on the left, primary actions on the right. */}
        <div className="md-head">
          <MdHero />
          <div className="md-head__actions">
            <a href={SHOPIFY_URL} target="_blank" rel="noopener noreferrer" className="btn">
              <Icon name="ext" size={12} />
              Buy stands
            </a>
            <GenerateQrModal {...qrSheet} />
            <ConnectDeviceModal
              establishments={businessOptions}
              detectedQrUrl={detectedQrUrl}
              detectedSerial={detectedSerial}
            />
          </div>
        </div>

        {/* searchParams banners (preserved) */}
        {sp.activated && (
          <Banner tone="ok">
            Device <code className="mono">{sp.activated}</code> activated. Scans now route to your
            Google review page.
          </Banner>
        )}
        {sp.updated && (
          <Banner tone="ok">Redirect URL updated. Scans now route to the new destination.</Banner>
        )}
        {sp.deleted && (
          <Banner tone="bad">
            <span style={{ marginRight: 8 }}>🗑</span>
            QR code moved to Trash. You have 30 days to{" "}
            <Link
              href="/hardware?view=trash"
              style={{ color: "inherit", textDecoration: "underline" }}
            >
              restore it
            </Link>{" "}
            before it&rsquo;s permanently deleted.
          </Banner>
        )}
        {sp.restored && (
          <Banner tone="ok">
            QR code restored. Scans now route to the original Google review page again.
          </Banner>
        )}

        {/* AI-training banner — CTA respects entitlement (Pro → train, Free → upgrade). */}
        <MdTrainingBanner href={isPro ? "/ai/training" : upgradeHref("ai_autopilot")} />

        {/* Scan-analytics summary row — REAL metrics. */}
        <MdSummaryRow
          totalScans={metrics.totalScans}
          todayScans={extras.todayScans}
          reviewsFromScans={metrics.reviewsFromScans}
          conversionLabel={formatConversionPct(metrics.reviewsFromScans, metrics.totalScans)}
          activeDevices={extras.activeDeviceCount || activeDevices.length}
        />

        {/* Devices section header — Active / Trash tabs + device count. */}
        <div className="md-devhead">
          <span className="md-devhead__title">Devices</span>
          <div className="seg">
            <Link href="/hardware" className="seg__t is-active" style={{ textDecoration: "none" }}>
              Active ({activeDevices.length})
            </Link>
            <Link
              href="/hardware?view=trash"
              className="seg__t"
              style={{
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Trash ({retiredCount})
            </Link>
          </div>
          <div style={{ flex: 1 }} />
          {/* One "Add device" lives in the page header; no duplicate here. */}
          <span className="md-devhead__count">
            {activeDevices.length} active device{activeDevices.length === 1 ? "" : "s"}
          </span>
        </div>

        <DeviceTable
          devices={activeDevices.map((d) => ({
            id: d.id,
            productTitle: d.productName ?? titleFromSku(d.productSku),
            establishmentName: d.establishment?.name ?? null,
            productKind: d.productKind,
            shortSlug: d.shortSlug,
            scans: d.scanCount,
            reviews: d.reviewCount,
          }))}
          selectedId={selectedDevice.id}
        />

        {/* QR card + Devices impact side by side. Reviews (live feed, rating
            split) and the AI assistant moved out: they belong to Review Inbox
            and Ask AI, keeping this page about devices and scans only. */}
        <div id="qr-panel" className="md-bottom md-bottom--scans" style={{ scrollMarginTop: 80 }}>
          <QrProductCard
            deviceId={selectedDevice.id}
            code={selectedDevice.shortSlug}
            name={selectedName}
            location={selectedDevice.establishment?.name ?? "Unassigned"}
            url={selectedUrl}
            downloadHref={qrDownloadHref}
            scans={selectedDevice.scanCount}
            reviews={reviewsByDeviceId.get(selectedDevice.id) ?? 0}
          />
          <MdDevicesImpact impact={extras.impact} />
        </div>

        {/* NFC tap-destination config (preserved — only for NFC kinds). */}
        {isNfcKind(selectedDevice.productKind) && (
          <div id="nfc-panel" style={{ scrollMarginTop: 80, marginBottom: 14 }}>
            <NfcConfigCard
              deviceId={selectedDevice.id}
              productKind={selectedDevice.productKind}
              encodeUrl={selectedUrl}
              slug={selectedDevice.shortSlug}
              currentNfcUid={selectedDevice.nfcUid ?? null}
              deviceTitle={selectedName}
              recordNfcUidAction={recordNfcUid}
              saveStatus={normalizeNfcStatus(sp.nfc)}
            />
          </div>
        )}

        <MdFooterTip />

        <BatchGeneratorSection />
      </div>
    </AppShellServer>
  );
}

/** Small reusable success/error banner (preserves the page's prior banners). */
function Banner({ tone, children }: { tone: "ok" | "bad"; children: React.ReactNode }) {
  if (tone === "bad") {
    return (
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
        {children}
      </div>
    );
  }
  return (
    <div
      className="ds-card ds-card--pri"
      style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12.5 }}
    >
      <span style={{ color: "var(--ok)", marginRight: 8 }}>✓</span>
      {children}
    </div>
  );
}

/**
 * QR product card (server component — renders the QR via the async QrCode and
 * defers clipboard/embed to the QrActions client island).
 */
function QrProductCard({
  deviceId,
  code,
  name,
  location,
  url,
  downloadHref,
  scans,
  reviews,
}: {
  deviceId: string;
  code: string;
  name: string;
  location: string;
  url: string;
  downloadHref: string;
  scans: number;
  reviews: number;
}) {
  return (
    <section className="md-card md-qr" aria-label={`QR for ${code}`}>
      <div className="md-card__head" style={{ padding: 0 }}>
        <h3 className="md-card__title">QR for {name}</h3>
        <span className="chip chip--ok" style={{ height: 18, fontSize: 10, marginLeft: 8 }}>
          <span className="live" />
          Active
        </span>
      </div>
      <div className="md-qr__id">ID: {code}</div>
      <div className="md-qr__id" style={{ marginTop: 2 }}>
        Location: {location}
      </div>

      <div className="md-qr__frame">
        <QrCode value={url} size={172} />
      </div>

      <QrActions
        deviceId={deviceId}
        code={code}
        url={url}
        origin={APP_ORIGIN}
        downloadHref={downloadHref}
      />

      <div className="md-qr__stats">
        <div className="md-qr__stat">
          <div className="md-qr__stat-num">{scans.toLocaleString("en-US")}</div>
          <div className="md-qr__stat-lbl">Scans</div>
        </div>
        <div className="md-qr__stat">
          <div className="md-qr__stat-num">{reviews.toLocaleString("en-US")}</div>
          <div className="md-qr__stat-lbl">Reviews</div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({
  establishments,
  qrSheet,
  recentActivation,
  detectedQrUrl = null,
  detectedSerial = null,
  retiredCount = 0,
}: {
  establishments: Array<{ id: string; name: string }>;
  qrSheet: { businesses: QrBusiness[]; defaultOpen: boolean; error: boolean };
  recentActivation?: string;
  detectedQrUrl?: string | null;
  detectedSerial?: string | null;
  /** Retired devices this org still has. Deleting your last active device
   *  lands you here, so this MUST be real — a hardcoded 0 hid them entirely. */
  retiredCount?: number;
}) {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Business Setup", "Device Manager"]}>
      <div className="md">
        <div
          className="row"
          style={{ justifyContent: "flex-end", gap: 8, marginBottom: 4, flexWrap: "wrap" }}
        >
          <a href={SHOPIFY_URL} target="_blank" rel="noopener noreferrer" className="btn">
            <Icon name="ext" size={12} />
            Buy stands
          </a>
          <GenerateQrModal {...qrSheet} />
          <ConnectDeviceModal
            establishments={establishments}
            detectedQrUrl={detectedQrUrl}
            detectedSerial={detectedSerial}
          />
        </div>

        <MdHero />

        {recentActivation && (
          <Banner tone="ok">
            Device activated, but it appears inactive refresh to see it here.
          </Banner>
        )}

        {/* AI-training banner stays on the empty state (kit). */}
        <MdTrainingBanner href={upgradeHref("ai_autopilot")} />

        {/* Scan-analytics summary row — genuine zeros (no fabricated data). */}
        <MdSummaryRow
          totalScans={0}
          todayScans={0}
          reviewsFromScans={0}
          conversionLabel="0%"
          activeDevices={0}
        />

        {/* Devices section header — matches the active layout (tabs + Add device). */}
        <div className="md-devhead">
          <span className="md-devhead__title">Devices</span>
          <div className="seg">
            <span className="seg__t is-active">Active (0)</span>
            <Link href="/hardware?view=trash" className="seg__t" style={{ textDecoration: "none" }}>
              Trash ({retiredCount})
            </Link>
          </div>
          <div style={{ flex: 1 }} />
          <span className="md-devhead__count">0 active devices</span>
          <ConnectDeviceModal
            establishments={establishments}
            detectedQrUrl={detectedQrUrl}
            detectedSerial={detectedSerial}
          />
        </div>

        {/* Empty devices panel — kit illustration + connect CTA. */}
        <section className="md-card" aria-label="Devices">
          <div className="md-blank">
            {/* biome-ignore lint/performance/noImgElement: static kit illustration (large SVG) */}
            <img
              src="/assets/repulabs/my-devices/devices-empty.svg"
              alt=""
              aria-hidden
              className="md-blank__art"
            />
            <h3 className="md-blank__title">
              {retiredCount > 0 ? "No active devices" : "No devices added yet"}
            </h3>
            <p className="md-blank__body">
              {retiredCount > 0 ? (
                <>
                  You have {retiredCount} deleted device{retiredCount === 1 ? "" : "s"} in{" "}
                  <Link href="/hardware?view=trash">Trash</Link> restoring one brings back the same
                  QR, code and redirect, so a plaque you&rsquo;ve already printed keeps working. Or
                  add a new device below.
                </>
              ) : (
                <>
                  Got a repulabs card, plaque, or stand? Add your first device to start collecting
                  scans and engage more customers enter the code from your package and we&rsquo;ll
                  route every scan to your Google review page.
                </>
              )}
            </p>
            <div className="md-blank__cta">
              <ConnectDeviceModal
                establishments={establishments}
                detectedQrUrl={detectedQrUrl}
                detectedSerial={detectedSerial}
                triggerClassName="btn btn--pri btn--lg"
                triggerLabel="Add device"
              />
              <GenerateQrModal
                {...qrSheet}
                defaultOpen={false}
                triggerClassName="btn btn--lg"
                triggerLabel="Generate a QR instead"
              />
            </div>
            <div className="dim" style={{ fontSize: 11.5, marginTop: 14 }}>
              Don&rsquo;t have a device yet?{" "}
              <a
                href={SHOPIFY_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--md-blue)", textDecoration: "none" }}
              >
                Shop cards &amp; stands →
              </a>
            </div>
          </div>
        </section>

        {/* Zero-state scan chart (reviews + AI assistant live elsewhere now). */}
        <div style={{ marginTop: 14, marginBottom: 14 }}>
          <MdDevicesImpact impact={buildEmptyImpactForView()} />
        </div>

        <MdFooterTip />
      </div>
    </AppShellServer>
  );
}

/** A zeroed 7-day series for the empty-state impact card (display only). */
function buildEmptyImpactForView() {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return { label: labels[d.getDay()] ?? "?", scans: 0, reviews: 0 };
  });
}

/* ============================================================
   Batch generator (admin-gated) — surfaces the EXISTING bulk QR/NFC
   batch feature that lives at /admin/hardware. Rendered ONLY when a
   verified platform-admin JWT (`admin_session`) is present.
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
            {latest
              ? ` · last ${latest.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : ""}
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
   Trash view — visible when /hardware?view=trash. (Unchanged behavior.)
============================================================ */

type RetiredDevice = Awaited<ReturnType<typeof listOrgDevices>>[number];

function TrashView({
  devices,
  justRestored,
  justReleased,
  canRelease,
}: {
  devices: RetiredDevice[];
  justRestored?: string;
  justReleased?: boolean;
  /** Whether this member may unbind a device from the workspace (admin+). */
  canRelease: boolean;
}) {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Business Setup", "Device Manager", "Trash"]}>
      {/* Apple "Recently Deleted" look — same skin as the Device Manager. */}
      <div className="md mdt">
        <Link href="/hardware" className="mdt__back">
          <ChevronLeft size={16} strokeWidth={2} />
          Device Manager
        </Link>
        <h1 className="mdt__title">Recently Deleted</h1>
        <p className="mdt__sub">
          Deleted devices stay here for 30 days. Restore one and it comes back exactly as it was,
          with the same QR, link and destination.
        </p>

        {justRestored && (
          <output className="mdt__toast">
            <CircleCheck size={16} strokeWidth={2} />
            Device restored. <Link href="/hardware">See it in Device Manager</Link>
          </output>
        )}
        {justReleased && (
          <output className="mdt__toast mdt__toast--neutral">
            <Info size={16} strokeWidth={2} />
            Device removed from this workspace. The unit itself is untouched: scan it and enter its
            code whenever you want to set it up again.
          </output>
        )}

        <div className="md-devhead mdt__bar">
          <div className="seg">
            <Link href="/hardware" className="seg__t" style={{ textDecoration: "none" }}>
              Active
            </Link>
            <Link
              href="/hardware?view=trash"
              className="seg__t is-active"
              style={{ textDecoration: "none" }}
            >
              Recently Deleted
            </Link>
          </div>
          <span className="md-devhead__count">
            {devices.length} {devices.length === 1 ? "device" : "devices"}
          </span>
        </div>

        {devices.length === 0 ? (
          <div className="mdt__empty">
            <Trash2 size={44} strokeWidth={1.3} className="mdt__empty-icon" />
            <h2 className="mdt__empty-title">No Recently Deleted Devices</h2>
            <p className="mdt__empty-sub">
              Devices you delete appear here for 30 days before they&rsquo;re removed for good.
            </p>
            <Link href="/hardware" className="mdt__pill">
              Back to Device Manager
            </Link>
          </div>
        ) : (
          <div className="tdc-grid">
            {devices.map((d) => (
              <TrashDeviceCard
                key={d.id}
                canRelease={canRelease}
                device={{
                  id: d.id,
                  shortSlug: d.shortSlug,
                  productSku: d.productSku,
                  redirectUrl: d.redirectUrl,
                  createdAt: new Date(d.createdAt).toISOString(),
                  establishmentName: d.establishment?.name ?? null,
                  scanCount: d.scanCount,
                }}
              />
            ))}
          </div>
        )}

        <p className="mdt__foot">
          Restoring brings back the original QR link and destination. If you&rsquo;ve since printed
          new plaques with the same code, scans of the old one will go to the restored destination.
        </p>
      </div>
    </AppShellServer>
  );
}
