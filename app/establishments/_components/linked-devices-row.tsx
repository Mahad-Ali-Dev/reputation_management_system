import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { type DeviceSummary, relativeTime, titleFromKind } from "./card-state";

/**
 * "Linked Devices" summary row — replaces the device-prompt banner once an
 * establishment has at least one linked device. Shows, per device, a name
 * (derived from kind/sku), a status chip, and scan count + last-scan time.
 * Each row links to /hardware. Pure presentational server component.
 */
export function LinkedDevicesRow({ devices }: { devices: DeviceSummary[] }) {
  if (devices.length === 0) return null;

  return (
    <div
      className="ds-card"
      style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 2 }}
    >
      <div
        className="row"
        style={{ gap: 8, marginBottom: 6, color: "var(--ink-2)" }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: "var(--pri-50)",
            color: "var(--pri)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="qr" size={14} />
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>
          Linked devices · {devices.length}
        </span>
        <Link
          href="/hardware"
          className="btn btn--xs"
          style={{ marginLeft: "auto", textDecoration: "none" }}
        >
          Manage
        </Link>
      </div>
      {devices.map((d, i) => {
        const active = d.status === "active" || d.status === "activated";
        return (
          <Link
            key={d.id}
            href="/hardware"
            className="row"
            style={{
              gap: 10,
              padding: "8px 6px 8px 34px",
              borderTop: i ? "1px solid var(--line)" : "none",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {titleFromKind(d)}
              </div>
              <div className="dim" style={{ fontSize: 11 }}>
                {d.scanCount.toLocaleString()} scan{d.scanCount === 1 ? "" : "s"}
                {d.lastScanAt ? ` · last ${relativeTime(d.lastScanAt)}` : ""}
              </div>
            </div>
            <span className={`chip ${active ? "chip--ok" : "chip--warn"}`} style={{ flexShrink: 0 }}>
              {active ? "Active" : d.status === "unactivated" ? "Not activated" : d.status}
            </span>
            <Icon name="chevR" size={13} style={{ color: "var(--rl-muted-2)", flexShrink: 0 }} />
          </Link>
        );
      })}
    </div>
  );
}
