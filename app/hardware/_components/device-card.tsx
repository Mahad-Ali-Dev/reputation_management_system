import { Icon, type IconName } from "@/components/shell/icon";
import { DeviceCardMenu } from "./device-card-menu";

/**
 * Module 04 — the connected-state device card (the spec's product-photo
 * anatomy), replacing the old QR-stand visual grid.
 *
 * Layout (horizontal, cards stack vertically):
 *   left   — real product image (HardwareProduct.imageUrl); graceful icon-tile
 *            fallback when null (e.g. self-service QR has no catalog row).
 *   center — device type BOLD + "Linked to: [Business]" (or "Unassigned") +
 *            a green-dot "Active" status pill (reuses `.live` + `.chip`).
 *   right  — per-device metric stack: Total Scans + Reviews Collected.
 *   corner — the "…" (Edit / Delete) kebab.
 *
 * Pure server component with serializable props computed by the page — the only
 * client island is the kebab menu.
 */
/** Product kinds that are programmed as NFC chips rather than printed QR. */
const NFC_KINDS = new Set(["nfc", "wifi", "multi_platform"]);

const KIND_LABEL: Record<string, string> = {
  nfc: "NFC",
  wifi: "WiFi + NFC",
  multi_platform: "Multi-NFC",
  qr: "QR",
};

export function DeviceCard({
  deviceId,
  productImageUrl,
  productTitle,
  productSubtitle,
  establishmentName,
  scans,
  reviews,
  shortSlug,
  productKind = "qr",
  nfcUid = null,
}: {
  deviceId: string;
  productImageUrl: string | null;
  /** Bold device type, e.g. "Wall Plaque". */
  productTitle: string;
  /** Small grey line under the title, e.g. "Brushed brass · 200×120 mm". */
  productSubtitle: string;
  /** Linked business name, or null when unassigned. */
  establishmentName: string | null;
  scans: number;
  reviews: number;
  shortSlug: string;
  /** 'qr' | 'nfc' | 'wifi' | 'multi_platform' — drives the type chip + icon. */
  productKind?: string;
  /** Recorded NFC chip UID, shown on NFC-kind cards when present. */
  nfcUid?: string | null;
}) {
  const isNfc = NFC_KINDS.has(productKind);
  const kindLabel = KIND_LABEL[productKind] ?? "QR";
  return (
    <div className="ds-card ds-card--hover" style={{ padding: 16 }}>
      <div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <ProductThumb imageUrl={productImageUrl} title={productTitle} isNfc={isNfc} />

        {/* Identity column */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.015em",
                margin: 0,
                color: "var(--ink)",
              }}
            >
              {productTitle}
            </h3>
            <span
              className="chip chip--ok"
              style={{ height: 20, fontSize: 11 }}
              title="Active — routing scans"
            >
              <span className="live" />
              Active
            </span>
            <span
              className="chip"
              style={{ height: 20, fontSize: 10.5 }}
              title={isNfc ? "NFC tap-to-review chip" : "Printed QR code"}
            >
              <Icon name={isNfc ? "smartphone" : "qr"} size={11} />
              {kindLabel}
            </span>
          </div>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
            {productSubtitle}
          </div>
          <div
            className="row"
            style={{ gap: 5, marginTop: 6, fontSize: 12.5, color: "var(--ink-2)" }}
          >
            <Icon name="building" size={12} style={{ color: "var(--rl-muted)" }} />
            <span style={{ color: "var(--rl-muted)" }}>Linked to:</span>
            <span style={{ fontWeight: 500, color: "var(--ink)" }}>
              {establishmentName ?? "Unassigned"}
            </span>
          </div>
          <div className="mono dim" style={{ fontSize: 10, marginTop: 6, letterSpacing: ".08em" }}>
            CODE · {shortSlug}
            {isNfc && nfcUid ? <> · UID · {nfcUid}</> : null}
          </div>
        </div>

        {/* Per-device metric stack */}
        <div
          className="row"
          style={{
            gap: 22,
            alignItems: "center",
            paddingLeft: 18,
            borderLeft: "1px solid var(--line)",
          }}
        >
          <Metric label="Total Scans" value={scans} icon="qr" />
          <Metric label="Reviews Collected" value={reviews} icon="star" />
        </div>

        {/* Overflow menu */}
        <DeviceCardMenu deviceId={deviceId} deviceLabel={productTitle} />
      </div>
    </div>
  );
}

function ProductThumb({
  imageUrl,
  title,
  isNfc = false,
}: {
  imageUrl: string | null;
  title: string;
  isNfc?: boolean;
}) {
  if (imageUrl) {
    return (
      // Catalog thumbnails are remote/static product photos — a plain <img>
      // keeps this a server component without next/image domain config.
      // biome-ignore lint/performance/noImgElement: catalog product thumbnail
      <img
        src={imageUrl}
        alt={title}
        width={92}
        height={92}
        style={{
          width: 92,
          height: 92,
          flex: "0 0 92px",
          objectFit: "cover",
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "var(--surface-3)",
        }}
      />
    );
  }
  // Fallback tile when the device has no catalog product (self-service QR, etc.)
  return (
    <span
      aria-hidden
      style={{
        display: "grid",
        placeItems: "center",
        width: 92,
        height: 92,
        flex: "0 0 92px",
        borderRadius: 12,
        background: "var(--pri-50)",
        border: "1px solid var(--pri-100)",
        color: "var(--pri)",
      }}
    >
      <Icon name={isNfc ? "smartphone" : "qr"} size={34} />
    </span>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: IconName }) {
  return (
    <div style={{ textAlign: "center", minWidth: 76 }}>
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          fontVariantNumeric: "tabular-nums",
          color: "var(--ink)",
        }}
      >
        {value.toLocaleString("en-US")}
      </div>
      <div
        className="row"
        style={{ gap: 4, justifyContent: "center", marginTop: 4, color: "var(--rl-muted)" }}
      >
        <Icon name={icon} size={11} />
        <span style={{ fontSize: 11 }}>{label}</span>
      </div>
    </div>
  );
}
