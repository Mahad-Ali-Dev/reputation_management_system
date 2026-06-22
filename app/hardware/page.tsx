import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { QrCode } from "@/components/shell/qr-code";
import { TopBar } from "@/components/topbar";
import { getAdminSession } from "@/lib/admin/session";
import { getOrgContext } from "@/lib/auth/org-context";
import { orgHasFeature } from "@/lib/billing/feature-access";
import { upgradeHref } from "@/lib/billing/upgrade-href";
import { prisma } from "@/lib/db/client";
import { listEstablishments } from "@/lib/establishments/queries";
import { restoreDevice } from "@/lib/hardware/actions";
import {
  formatConversionPct,
  getDeviceDashboardExtras,
  getDeviceMetrics,
  listOrgDevices,
  listOrgDevicesWithProduct,
} from "@/lib/hardware/queries";
import Link from "next/link";
import { AiChatbotCard } from "./_components/ai-chatbot-card";
import { ConnectDeviceModal } from "./_components/connect-device-modal";
import {
  MdDevicesImpact,
  MdFooterTip,
  MdHero,
  MdLiveFeed,
  MdReviewsByRating,
  MdSummaryRow,
  MdTrainingBanner,
} from "./_components/dashboard-cards";
import { DeviceTable } from "./_components/device-table";
import { recordNfcUid } from "./_components/nfc-actions";
import { NfcConfigCard } from "./_components/nfc-config-card";
import { QrActions } from "./_components/qr-actions";
import "./devices.css";
import "./my-devices.css";

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
  if (sp.view === "trash") {
    const retiredDevices = devices.filter((d) => d.status === "retired");
    return <TrashView devices={retiredDevices} justRestored={sp.restored} />;
  }

  const activeDevices = devices.filter((d) => d.status === "active");

  if (activeDevices.length === 0) {
    return <EmptyState establishments={businessOptions} recentActivation={sp.activated} />;
  }

  // Use ?selected=<deviceId> to focus the QR + analytics panels on a specific
  // device. Falls back to the first active device.
  const selectedDevice =
    (sp.selected && activeDevices.find((d) => d.id === sp.selected)) || activeDevices[0];
  if (!selectedDevice)
    return <EmptyState establishments={businessOptions} recentActivation={sp.activated} />;

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
  const retiredCount = devices.filter((d) => d.status === "retired").length;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "My Devices"]}>
      <div className="md">
        {/* Hero + top-right actions */}
        <div
          className="row"
          style={{ justifyContent: "flex-end", gap: 8, marginBottom: 4, flexWrap: "wrap" }}
        >
          <a href={SHOPIFY_URL} target="_blank" rel="noopener noreferrer" className="btn">
            <Icon name="ext" size={12} />
            Buy stands
          </a>
          <Link href="/hardware/new" className="btn">
            <Icon name="qr" size={12} />
            Generate QR
          </Link>
          <ConnectDeviceModal establishments={businessOptions} />
        </div>

        <MdHero />

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

        {/* Devices section header — Active / Trash tabs + Add device. */}
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
          <span className="md-devhead__count">
            {activeDevices.length} active device{activeDevices.length === 1 ? "" : "s"}
          </span>
          <ConnectDeviceModal establishments={businessOptions} />
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

        {/* Lower section — Live feed · Reviews-by-rating · Devices-impact. */}
        <div className="md-lower" style={{ marginTop: 14 }}>
          <MdLiveFeed reviews={extras.recentReviews} />
          <MdReviewsByRating dist={extras.reviewsByRating} />
          <MdDevicesImpact impact={extras.impact} />
        </div>

        {/* Bottom row — QR product card + AI chatbot card. */}
        <div id="qr-panel" className="md-bottom" style={{ scrollMarginTop: 80 }}>
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
          <AiChatbotCard orbSrc="/assets/repulabs/my-devices/ai-chatbot-orb.svg" />
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
  recentActivation,
}: {
  establishments: Array<{ id: string; name: string }>;
  recentActivation?: string;
}) {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "My Devices"]}>
      <div className="md">
        <div
          className="row"
          style={{ justifyContent: "flex-end", gap: 8, marginBottom: 4, flexWrap: "wrap" }}
        >
          <a href={SHOPIFY_URL} target="_blank" rel="noopener noreferrer" className="btn">
            <Icon name="ext" size={12} />
            Buy stands
          </a>
          <Link href="/hardware/new" className="btn">
            <Icon name="qr" size={12} />
            Generate QR
          </Link>
          <ConnectDeviceModal establishments={establishments} />
        </div>

        <MdHero />

        {recentActivation && (
          <Banner tone="ok">
            Device activated, but it appears inactive — refresh to see it here.
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
              Trash (0)
            </Link>
          </div>
          <div style={{ flex: 1 }} />
          <span className="md-devhead__count">0 active devices</span>
          <ConnectDeviceModal establishments={establishments} />
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
            <h3 className="md-blank__title">No devices added yet</h3>
            <p className="md-blank__body">
              Got a ReviewBoost card, plaque, or stand? Add your first device to start collecting
              scans and engage more customers — enter the code from your package and we&rsquo;ll
              route every scan to your Google review page.
            </p>
            <div className="md-blank__cta">
              <ConnectDeviceModal
                establishments={establishments}
                triggerClassName="btn btn--pri btn--lg"
                triggerLabel="Add device"
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
                style={{ color: "var(--md-blue)", textDecoration: "none" }}
              >
                Shop cards &amp; stands →
              </a>
            </div>
          </div>
        </section>

        {/* Lower zero-state cards mirror the empty mockup. */}
        <div className="md-lower" style={{ marginTop: 14 }}>
          <MdLiveFeed reviews={[]} />
          <MdReviewsByRating dist={{ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }} />
          <MdDevicesImpact impact={buildEmptyImpactForView()} />
        </div>

        {/* AI Chatbot card (kit) — no data dependency, useful even before any device. */}
        <div className="md-bottom" style={{ gridTemplateColumns: "1fr" }}>
          <AiChatbotCard orbSrc="/assets/repulabs/my-devices/ai-chatbot-orb.svg" />
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
