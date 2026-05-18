import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { QrCode } from "@/components/shell/qr-code";
import { Sparkline } from "@/components/shell/sparkline";
import { Stars } from "@/components/shell/stars";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { restoreDevice } from "@/lib/hardware/actions";
import { listOrgDevices } from "@/lib/hardware/queries";
import Link from "next/link";

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

/**
 * Bucket a list of dated events into N equal-width buckets over the last
 * `totalDays` days for a tiny sparkline. Returns a zero-length array if no
 * events — caller should fall back to omitting the sparkline.
 */
function bucketIntoSparkline(dates: Date[], totalDays = 30, buckets = 7): number[] {
  if (dates.length === 0) return [];
  const out = Array<number>(buckets).fill(0);
  const windowMs = totalDays * 24 * 60 * 60 * 1000;
  const start = Date.now() - windowMs;
  const msPerBucket = windowMs / buckets;
  for (const d of dates) {
    const idx = Math.floor((d.getTime() - start) / msPerBucket);
    if (idx >= 0 && idx < buckets) out[idx] = (out[idx] ?? 0) + 1;
  }
  return out;
}

function formatDelta(current: number, prior: number): { label: string; up: boolean | undefined } {
  if (prior === 0 && current === 0) return { label: "no scans yet", up: undefined };
  if (prior === 0 && current > 0) return { label: "new", up: true };
  const pct = Math.round(((current - prior) / prior) * 100);
  if (pct === 0) return { label: "flat vs prior 30d", up: undefined };
  return { label: `${pct > 0 ? "+" : ""}${pct}% vs prior 30d`, up: pct > 0 };
}

function relativeTime(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

  const devices = await listOrgDevices(orgId);
  const sp = await searchParams;

  // Trash view — show only retired devices with a Restore button per card.
  // Early return so it works whether or not the user has any active devices.
  if (sp.view === "trash") {
    const retiredDevices = devices.filter((d) => d.status === "retired");
    return <TrashView devices={retiredDevices} justRestored={sp.restored} />;
  }

  const activeDevices = devices.filter((d) => d.status === "active");
  const lastScanDevice = activeDevices.reduce<(typeof devices)[number] | null>((latest, d) => {
    if (!d.lastScanAt) return latest;
    if (!latest?.lastScanAt) return d;
    return d.lastScanAt > latest.lastScanAt ? d : latest;
  }, null);

  if (activeDevices.length === 0) {
    return <EmptyState recentActivation={sp.activated} />;
  }

  // Use ?selected=<deviceId> to focus the QR + analytics panels on a specific
  // device. Falls back to the first active device when no selection is
  // provided or the ID is invalid.
  const selectedDevice =
    (sp.selected && activeDevices.find((d) => d.id === sp.selected)) || activeDevices[0];
  if (!selectedDevice) return <EmptyState recentActivation={sp.activated} />;

  // Real analytics: 30d scans, prior 30d scans (for delta), reviews from QR
  // (rows on Review with attributedDeviceId set), prior 30d reviews, plus the
  // selected device's scan series for the analytics panel. All inside one
  // tenant-scoped transaction so RLS predicates are evaluated once.
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const activeDeviceIds = activeDevices.map((d) => d.id);
  const activeEstablishmentIds = Array.from(
    new Set(activeDevices.map((d) => d.establishmentId).filter((id): id is string => !!id)),
  );
  const analytics = await withTenant(orgId, async (tx) => {
    const [
      orgScans30d,
      orgScansPrior30d,
      reviewsFromQr30d,
      reviewsFromQrPrior30d,
      selectedScans,
      reviewsPerDevice,
      ratingsPerEstablishment,
    ] = await Promise.all([
      tx.deviceScan.findMany({
        where: { organizationId: orgId, scannedAt: { gte: since30d } },
        select: { scannedAt: true },
      }),
      tx.deviceScan.count({
        where: { organizationId: orgId, scannedAt: { gte: since60d, lt: since30d } },
      }),
      tx.review.findMany({
        where: {
          organizationId: orgId,
          attributedDeviceId: { not: null },
          postedAt: { gte: since30d },
        },
        select: { postedAt: true },
      }),
      tx.review.count({
        where: {
          organizationId: orgId,
          attributedDeviceId: { not: null },
          postedAt: { gte: since60d, lt: since30d },
        },
      }),
      tx.deviceScan.findMany({
        where: { deviceId: selectedDevice.id, scannedAt: { gte: since30d } },
        select: { scannedAt: true },
      }),
      activeDeviceIds.length > 0
        ? tx.review.groupBy({
            by: ["attributedDeviceId"],
            where: { organizationId: orgId, attributedDeviceId: { in: activeDeviceIds } },
            _count: { _all: true },
          })
        : Promise.resolve(
            [] as Array<{ attributedDeviceId: string | null; _count: { _all: number } }>,
          ),
      activeEstablishmentIds.length > 0
        ? tx.review.groupBy({
            by: ["establishmentId"],
            where: { organizationId: orgId, establishmentId: { in: activeEstablishmentIds } },
            _count: { _all: true },
            _avg: { rating: true },
          })
        : Promise.resolve(
            [] as Array<{
              establishmentId: string;
              _count: { _all: number };
              _avg: { rating: number | null };
            }>,
          ),
    ]);
    return {
      orgScans30d,
      orgScansPrior30d,
      reviewsFromQr30d,
      reviewsFromQrPrior30d,
      selectedScans,
      reviewsPerDevice,
      ratingsPerEstablishment,
    };
  });

  const reviewsByDeviceId = new Map<string, number>();
  for (const r of analytics.reviewsPerDevice) {
    if (r.attributedDeviceId) reviewsByDeviceId.set(r.attributedDeviceId, r._count._all);
  }
  const ratingByEstablishmentId = new Map<string, { count: number; avg: number | null }>();
  for (const r of analytics.ratingsPerEstablishment) {
    ratingByEstablishmentId.set(r.establishmentId, {
      count: r._count._all,
      avg: r._avg.rating !== null ? Number(r._avg.rating) : null,
    });
  }

  const totalScans30d = analytics.orgScans30d.length;
  const reviewsFromQrCount = analytics.reviewsFromQr30d.length;
  const scansSparkline = bucketIntoSparkline(
    analytics.orgScans30d.map((s) => s.scannedAt),
    30,
    7,
  );
  const reviewsSparkline = bucketIntoSparkline(
    analytics.reviewsFromQr30d.map((r) => r.postedAt),
    30,
    7,
  );
  const scansDelta = formatDelta(totalScans30d, analytics.orgScansPrior30d);
  const reviewsDelta = formatDelta(reviewsFromQrCount, analytics.reviewsFromQrPrior30d);
  const conversion =
    totalScans30d > 0
      ? `${(Math.round((reviewsFromQrCount / totalScans30d) * 1000) / 10).toFixed(1)}% conv.`
      : "—";
  const selectedScans = analytics.selectedScans;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "QR Stands"]}>
      <PageHeader
        kicker="QR codes · stands · plaques"
        title="QR Stands"
        description="Every prompt that turns a scan into a 5-star review. Generate a free QR yourself in 30 seconds, or activate a stand you bought."
        actions={
          <>
            <a href={SHOPIFY_URL} target="_blank" rel="noopener noreferrer" className="btn">
              <Icon name="ext" size={12} />
              Buy stands
            </a>
            <Link href="/activate" className="btn">
              <Icon name="check" size={12} />
              Redeem code
            </Link>
            <Link href="/hardware/new" className="btn btn--pri">
              <Icon name="plus" size={12} />
              Generate QR
            </Link>
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

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard
          l="Active QRs"
          v={String(activeDevices.length)}
          d={`${devices.length - activeDevices.length} pending`}
        />
        <KpiCard
          l="Total scans · 30d"
          v={String(totalScans30d)}
          d={scansDelta.label}
          up={scansDelta.up}
          spark={scansSparkline.length > 0 ? scansSparkline : undefined}
        />
        <KpiCard
          l="Reviews from QR · 30d"
          v={String(reviewsFromQrCount)}
          d={reviewsFromQrCount > 0 ? conversion : reviewsDelta.label}
          up={reviewsFromQrCount > 0 ? undefined : reviewsDelta.up}
          spark={reviewsSparkline.length > 0 ? reviewsSparkline : undefined}
        />
        <KpiCard
          l="Last scan"
          v={lastScanDevice ? relativeTime(lastScanDevice.lastScanAt) : "—"}
          d={lastScanDevice?.establishment?.name ?? "No scans yet"}
        />
      </div>

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

      <div className="grid-3" style={{ gap: 16, marginBottom: 22 }}>
        {activeDevices.slice(0, 5).map((d, i) => {
          const reviewsForDevice = reviewsByDeviceId.get(d.id) ?? 0;
          const estRating = d.establishmentId
            ? ratingByEstablishmentId.get(d.establishmentId)
            : undefined;
          return (
            <DeviceCard
              key={d.id}
              deviceId={d.id}
              code={d.shortSlug}
              name={titleFromSku(d.productSku)}
              type={subtitleFromSku(d.productSku)}
              location={d.establishment?.name ?? "Unassigned"}
              scans={d.scanCount}
              reviews={reviewsForDevice}
              rating={estRating?.avg ?? null}
              ratingCount={estRating?.count ?? 0}
              hero={i % 2 === 0 ? "amber" : "dark"}
            />
          );
        })}
        <Link
          href="/activate"
          style={{
            border: "1.5px dashed var(--line-2)",
            borderRadius: 12,
            padding: 22,
            display: "grid",
            placeItems: "center",
            minHeight: 360,
            color: "var(--rl-muted)",
            background: "rgba(255,255,255,.4)",
            textDecoration: "none",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 10px",
                color: "var(--pri)",
              }}
            >
              <Icon name="plus" size={20} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Add QR code</div>
            <div style={{ fontSize: 11.5, marginTop: 2 }}>Redeem activation code</div>
          </div>
        </Link>
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
        />
      </div>
    </AppShellServer>
  );
}

function EmptyState({ recentActivation }: { recentActivation?: string }) {
  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "QR Stands"]}>
      <PageHeader
        kicker="Get your first 5-star review"
        title="QR Stands"
        description="Every prompt that turns a scan into a Google review. Free to generate, no hardware required."
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

      {/* Two cards: generate (primary) vs activate (secondary) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
          maxWidth: 920,
          marginInline: "auto",
        }}
      >
        <div className="ds-card" style={{ padding: 28, position: "relative", overflow: "hidden" }}>
          <span
            className="chip chip--pri"
            style={{ position: "absolute", top: 14, right: 14, fontSize: 10 }}
          >
            FREE · INSTANT
          </span>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "var(--pri-50)",
              color: "var(--pri)",
              display: "grid",
              placeItems: "center",
              marginBottom: 14,
            }}
          >
            <Icon name="qr" size={22} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: "-0.015em" }}>
            Generate a QR yourself
          </h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Paste your Google review link, pick a business — get a downloadable QR in seconds. Print
            it, embed it, share it. No hardware purchase needed.
          </p>
          <Link href="/hardware/new" className="btn btn--pri btn--lg" style={{ marginTop: 16 }}>
            <Icon name="plus" size={14} />
            Generate QR code
          </Link>
        </div>

        <div className="ds-card" style={{ padding: 28 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "var(--surface-3)",
              color: "var(--ink-2)",
              display: "grid",
              placeItems: "center",
              marginBottom: 14,
            }}
          >
            <Icon name="box" size={22} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, letterSpacing: "-0.015em" }}>
            Or activate a stand
          </h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Bought a Counter Card, Wall Plaque, or Stand from our Shopify store? Enter the
            8-character code from your package and we'll bind it to a business.
          </p>
          <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <Link href="/activate" className="btn">
              Redeem code
            </Link>
            <a
              href={SHOPIFY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost dim"
            >
              <Icon name="ext" size={12} />
              Shop stands
            </a>
          </div>
        </div>
      </div>
    </AppShellServer>
  );
}

function KpiCard({
  l,
  v,
  em,
  d,
  up,
  spark,
}: {
  l: string;
  v: string;
  em?: string;
  d: string;
  /** true = up arrow + green; false = down arrow + red; undefined = neutral, no arrow */
  up?: boolean;
  spark?: number[];
}) {
  const deltaClass =
    up === true ? "stat__delta up" : up === false ? "stat__delta down" : "stat__delta";
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div
          className="row"
          style={{ alignItems: "flex-end", gap: 8, justifyContent: "space-between" }}
        >
          <span className="stat__value">
            {v}
            {em && <em> {em}</em>}
          </span>
          {spark && spark.length > 0 && <Sparkline points={spark} width={68} height={26} />}
        </div>
        <div className={deltaClass}>
          {up === true && <Icon name="arrowU" size={10} stroke={2.4} />}
          {up === false && <Icon name="arrowD" size={10} stroke={2.4} />}
          {d}
        </div>
      </div>
    </div>
  );
}

function DeviceCard({
  deviceId,
  code,
  name,
  type,
  location,
  scans,
  reviews,
  rating,
  ratingCount,
  hero,
}: {
  deviceId: string;
  code: string;
  name: string;
  type: string;
  location: string;
  scans: number;
  reviews: number;
  /** Average rating from the establishment's reviews, 1-5; null when none yet. */
  rating: number | null;
  /** Total review count for the establishment. */
  ratingCount: number;
  hero: "amber" | "dark";
}) {
  const grad =
    hero === "dark"
      ? "linear-gradient(155deg, #232734 0%, #0E0F14 100%)"
      : "linear-gradient(155deg, #EEF0FF 0%, #DEE0FF 100%)";
  const textColor = hero === "dark" ? "#fff" : "var(--ink)";
  const conv = scans > 0 ? `${Math.round((reviews / scans) * 100)}%` : "—";
  const ratingDisplay = rating !== null ? rating.toFixed(1) : null;
  const starsValue = rating !== null ? Math.round(rating) : 0;
  return (
    <div className="ds-card" style={{ overflow: "hidden", padding: 0 }}>
      <div
        style={{
          padding: 22,
          background: grad,
          color: textColor,
          position: "relative",
          minHeight: 200,
        }}
      >
        <div
          style={{
            background: "#fff",
            color: "var(--ink)",
            borderRadius: 8,
            padding: "12px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.05)",
            transform: "rotate(-2deg)",
            width: "92%",
            marginTop: 4,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="mono"
              style={{
                fontSize: 8.5,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "var(--rl-muted)",
              }}
            >
              Scan to leave a review
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {location}
            </div>
            <div className="row" style={{ gap: 2, marginTop: 2 }}>
              {ratingDisplay !== null ? (
                <>
                  <Stars value={starsValue} size={9} />
                  <span style={{ fontSize: 9.5, color: "var(--rl-muted)", marginLeft: 4 }}>
                    {ratingDisplay} · {ratingCount}
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 9.5, color: "var(--rl-muted)" }}>No reviews yet</span>
              )}
            </div>
          </div>
          <div
            style={{
              width: 44,
              height: 44,
              background: "#fff",
              borderRadius: 4,
              position: "relative",
            }}
          >
            <QrCode value={publicQrUrl(code)} size={44} withLogo={false} />
          </div>
        </div>
        <div
          className="mono"
          style={{
            position: "absolute",
            bottom: 14,
            left: 22,
            fontSize: 9.5,
            letterSpacing: ".15em",
            textTransform: "uppercase",
            opacity: 0.65,
          }}
        >
          CODE · {code}
        </div>
        <span
          className="chip"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "rgba(255,255,255,.85)",
            color: "var(--ink)",
            backdropFilter: "blur(6px)",
          }}
        >
          <span className="live" />
          Active
        </span>
      </div>

      <div style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{name}</h3>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
          {type}
        </div>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
          <Icon
            name="pin"
            size={10}
            style={{ display: "inline", verticalAlign: -1, marginRight: 3 }}
          />
          {location}
        </div>

        <div className="grid-3" style={{ marginTop: 14, gap: 6 }}>
          <Mini l="SCANS" v={String(scans)} />
          <Mini l="REVIEWS" v={String(reviews)} />
          <Mini l="CONV." v={conv} />
        </div>

        <div
          className="row"
          style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)", gap: 6 }}
        >
          {/* Get QR + Analytics: select this device in the panels below via ?selected= */}
          <Link
            href={`/hardware?selected=${deviceId}#qr-panel`}
            className="btn btn--xs"
            style={{ textDecoration: "none" }}
          >
            <Icon name="qr" size={10} />
            Get QR
          </Link>
          <Link
            href={`/hardware?selected=${deviceId}#qr-panel`}
            className="btn btn--xs"
            style={{ textDecoration: "none" }}
          >
            <Icon name="bars" size={10} />
            Analytics
          </Link>
          {/* Edit: opens the edit page with redirect-URL form */}
          <Link
            href={`/hardware/edit/${deviceId}`}
            className="btn btn--xs btn--ghost"
            aria-label="Edit"
            style={{ textDecoration: "none" }}
          >
            <Icon name="edit" size={10} />
          </Link>
          {/* Delete: edit page has the delete form (soft delete with audit) */}
          <Link
            href={`/hardware/edit/${deviceId}#delete`}
            className="btn btn--xs btn--ghost"
            aria-label="Delete"
            style={{ marginLeft: "auto", color: "var(--bad)", textDecoration: "none" }}
          >
            <Icon name="trash" size={10} />
          </Link>
        </div>
      </div>
    </div>
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
}: {
  scanCount: number;
  scans: Array<{ scannedAt: Date }>;
  reviews: number;
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
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "QR Stands", "Trash"]}>
      <PageHeader
        kicker="QR stands · trash"
        title="Restore a deleted QR"
        description="Soft-deleted QRs live here for 30 days before they're hard-deleted. Restore one to reactivate the same code, slug, and redirect URL — no need to re-enter anything."
        actions={
          <Link href="/hardware" className="btn">
            <Icon name="chevL" size={12} />
            Back to active QRs
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
