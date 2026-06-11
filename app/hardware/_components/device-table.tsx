import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { ConnectDeviceModal } from "./connect-device-modal";
import { DeviceCardMenu } from "./device-card-menu";

/**
 * Devices redesign — the device-list table (the after-mockup's lead section),
 * replacing the vertical card gallery.
 *
 * Columns: Device | Location | Type | Status | Scans | Reviews | ⋯
 *   - Device   → catalog thumb + product name (links to ?selected=<id>#qr-panel,
 *                which focuses the QR-preview / NFC-config / analytics rail —
 *                the page's existing selection mechanism) + short code.
 *   - Location → Device.establishment.name (or "Unassigned").
 *   - Type     → productKind chip (QR / NFC / WiFi+NFC / Multi-NFC).
 *   - Status   → derived from REAL fields only: every row here is
 *                Device.status === "active"; "Live" = has recorded scans,
 *                "Ready" = activated but never scanned. No invented states.
 *   - Scans / Reviews → the per-device stats the old cards showed.
 *   - ⋯        → the existing Edit/Delete kebab (client island, unchanged).
 *
 * Pure server component — interactivity is links + the existing kebab island.
 */

const NFC_KINDS = new Set(["nfc", "wifi", "multi_platform"]);

const KIND_LABEL: Record<string, string> = {
  nfc: "NFC",
  wifi: "WiFi + NFC",
  multi_platform: "Multi-NFC",
  qr: "QR",
};

export type DeviceRow = {
  id: string;
  productTitle: string;
  productImageUrl: string | null;
  establishmentName: string | null;
  productKind: string;
  shortSlug: string;
  scans: number;
  reviews: number;
};

export function DeviceTable({
  devices,
  selectedId,
  establishments,
}: {
  devices: DeviceRow[];
  selectedId: string;
  establishments: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="dev-card-head">
        <span className="dev-card-head__icon" aria-hidden>
          <Icon name="qr" size={15} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h3 className="dev-card-head__title">Device list</h3>
          <p className="dev-card-head__sub">QR and NFC fleet</p>
        </div>
        <span className="dev-card-head__count">
          {devices.length} ACTIVE
        </span>
      </div>

      <table className="dev-table">
        <thead>
          <tr>
            <th>Device</th>
            <th className="dev-hide-md">Location</th>
            <th className="dev-hide-md">Type</th>
            <th>Status</th>
            <th className="dev-num">Scans</th>
            <th className="dev-num dev-hide-sm">Reviews</th>
            <th aria-label="Actions" style={{ width: 44 }} />
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <DeviceTableRow key={d.id} device={d} isSelected={d.id === selectedId} />
          ))}
        </tbody>
      </table>

      <div className="dev-add-row">
        <div className="row" style={{ gap: 10 }}>
          <span className="dev-thumb--fallback" aria-hidden style={{ width: 34, height: 34, flexBasis: 34 }}>
            <Icon name="plus" size={15} />
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
          establishments={establishments}
          triggerClassName="btn"
          triggerLabel="Add Device"
        />
      </div>
    </div>
  );
}

function DeviceTableRow({ device: d, isSelected }: { device: DeviceRow; isSelected: boolean }) {
  const isNfc = NFC_KINDS.has(d.productKind);
  const kindLabel = KIND_LABEL[d.productKind] ?? "QR";
  const isLive = d.scans > 0;
  return (
    <tr className={`dev-row${isSelected ? " dev-row--sel" : ""}`}>
      <td>
        <div className="dev-id-cell">
          <Thumb imageUrl={d.productImageUrl} title={d.productTitle} isNfc={isNfc} />
          <div style={{ minWidth: 0 }}>
            <Link
              href={`/hardware?selected=${d.id}#qr-panel`}
              className="dev-name-link"
              title={`Preview QR + analytics for ${d.productTitle}`}
            >
              {d.productTitle}
            </Link>
            <div className="dev-code">CODE · {d.shortSlug}</div>
          </div>
        </div>
      </td>
      <td className="dev-hide-md" style={{ color: "var(--ink-2)", fontSize: 12.5 }}>
        {d.establishmentName ?? <span className="dim">Unassigned</span>}
      </td>
      <td className="dev-hide-md">
        <span
          className="chip"
          style={{ height: 20, fontSize: 10.5 }}
          title={isNfc ? "NFC tap-to-review chip" : "Printed QR code"}
        >
          <Icon name={isNfc ? "smartphone" : "qr"} size={11} />
          {kindLabel}
        </span>
      </td>
      <td>
        {isLive ? (
          <span
            className="chip chip--ok"
            style={{ height: 20, fontSize: 11 }}
            title="Active and recording scans"
          >
            <span className="live" />
            Live
          </span>
        ) : (
          <span
            className="chip"
            style={{ height: 20, fontSize: 11 }}
            title="Activated — no scans recorded yet"
          >
            Ready
          </span>
        )}
      </td>
      <td className="dev-num" style={{ fontWeight: 600 }}>
        {d.scans.toLocaleString("en-US")}
      </td>
      <td className="dev-num dev-hide-sm" style={{ fontWeight: 600 }}>
        {d.reviews.toLocaleString("en-US")}
      </td>
      <td style={{ textAlign: "right" }}>
        <DeviceCardMenu deviceId={d.id} deviceLabel={d.productTitle} />
      </td>
    </tr>
  );
}

function Thumb({
  imageUrl,
  title,
  isNfc,
}: {
  imageUrl: string | null;
  title: string;
  isNfc: boolean;
}) {
  if (imageUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: catalog product thumbnail
      <img src={imageUrl} alt={title} width={38} height={38} className="dev-thumb" />
    );
  }
  return (
    <span className="dev-thumb--fallback" aria-hidden>
      <Icon name={isNfc ? "smartphone" : "qr"} size={17} />
    </span>
  );
}
