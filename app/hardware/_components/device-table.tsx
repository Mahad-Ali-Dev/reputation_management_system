import Link from "next/link";
import { DeviceRowActions } from "./device-row-actions";

/**
 * Devices table — the "Active state" mockup's device inventory.
 *
 * Renders a plain white kit card (`.md-card`) wrapping a real HTML table whose
 * columns match the mockup exactly: Device | Location | Type | Status | Scans |
 * Reviews | Action. The section header (title + Active/Trash tabs + Add device)
 * lives ABOVE this card in page.tsx, so the table itself has no internal header
 * and no footer row.
 *
 *   - Device   → product name, linking to ?selected=<id>#qr-panel (focuses the
 *                QR-preview / NFC-config rail — the page's selection mechanism).
 *   - Location → Device.establishment.name (or "Unassigned").
 *   - Type     → human label for the product kind ("NFC/QR Stand", "Table-top
 *                QR", …) as plain text, per the mockup.
 *   - Status   → every row here is Device.status === "active" → "Active" pill.
 *   - Scans / Reviews → the per-device live stats.
 *   - Action   → Edit (pencil) + Delete (trash) icon buttons.
 *
 * Pure server component — interactivity is links + the DeviceRowActions island.
 */

const KIND_LABEL: Record<string, string> = {
  nfc: "NFC Card",
  wifi: "WiFi + NFC",
  multi_platform: "Multi-NFC",
  qr: "QR Code",
};

export type DeviceRow = {
  id: string;
  productTitle: string;
  establishmentName: string | null;
  productKind: string;
  shortSlug: string;
  scans: number;
  reviews: number;
};

export function DeviceTable({
  devices,
  selectedId,
}: {
  devices: DeviceRow[];
  selectedId: string;
}) {
  return (
    <section className="md-card md-devtable" aria-label="Devices">
      <table className="md-table">
        <thead>
          <tr>
            <th>Device</th>
            <th className="md-hide-md">Location</th>
            <th className="md-hide-md">Type</th>
            <th>Status</th>
            <th className="md-num">Scans</th>
            <th className="md-num md-hide-sm">Reviews</th>
            <th className="md-num" style={{ width: 96 }}>
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <DeviceTableRow key={d.id} device={d} isSelected={d.id === selectedId} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DeviceTableRow({ device: d, isSelected }: { device: DeviceRow; isSelected: boolean }) {
  const kindLabel = KIND_LABEL[d.productKind] ?? "QR Code";
  return (
    <tr className={`md-trow${isSelected ? " md-trow--sel" : ""}`}>
      <td>
        <Link
          href={`/hardware?selected=${d.id}#qr-panel`}
          className="md-tname"
          title={`Preview QR + analytics for ${d.productTitle}`}
        >
          {d.productTitle}
        </Link>
      </td>
      <td className="md-hide-md md-tmuted">
        {d.establishmentName ?? <span className="md-tdim">Unassigned</span>}
      </td>
      <td className="md-hide-md md-tmuted">{kindLabel}</td>
      <td>
        <span className="md-tstatus">
          <span className="md-tstatus__dot" />
          Active
        </span>
      </td>
      <td className="md-num md-tnum">{d.scans.toLocaleString("en-US")}</td>
      <td className="md-num md-tnum md-hide-sm">{d.reviews.toLocaleString("en-US")}</td>
      <td className="md-num">
        <DeviceRowActions deviceId={d.id} deviceLabel={d.productTitle} />
      </td>
    </tr>
  );
}
