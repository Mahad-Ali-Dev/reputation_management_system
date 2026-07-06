import Link from "next/link";
import { Icon } from "@/components/shell/icon";
import { type DeviceSummary, titleFromKind } from "./card-state";

/**
 * Row C — the "Linked devices" strip (12-my-establishments-populated §7 /
 * 13-empty §6). Aggregates every linked device across all establishments into
 * one 3-up strip with a total count and a Manage action. Each device card:
 * kit glyph tile + name + view count + Active/Inactive status + chevron.
 *
 * When there are no devices, renders the empty row ("No devices linked yet …"
 * + Link Device). Pure presentational server component; every card links to
 * the hardware manager where linking actually happens.
 */

/** Kit glyph per device kind (baked-transparent SVGs in public/…/establishments). */
function deviceIcon(d: DeviceSummary): string {
  const hay = `${d.productKind} ${d.productSku}`.toLowerCase();
  if (hay.includes("nfc")) return "/assets/repulabs/establishments/device-nfc.svg";
  if (hay.includes("card") || hay.includes("stand") || hay.includes("plaque"))
    return "/assets/repulabs/establishments/device-counter.svg";
  return "/assets/repulabs/establishments/device-qr.svg";
}

export function DevicesStrip({ devices }: { devices: DeviceSummary[] }) {
  return (
    <section className="est-devices" aria-label="Linked devices">
      <div className="est-devices__head">
        <span className="est-devices__grip" aria-hidden="true">
          <Icon name="grid" size={16} />
        </span>
        <span className="est-devices__title">Linked devices · {devices.length}</span>
        <Link href="/hardware" className="est-btn est-btn--out est-btn--sm est-devices__manage">
          Manage
        </Link>
      </div>

      {devices.length === 0 ? (
        <div className="est-devempty">
          <span className="est-devempty__tile" aria-hidden="true">
            {/* biome-ignore lint/performance/noImgElement: static kit SVG glyph */}
            <img src="/assets/repulabs/establishments/empty-no-device.svg" alt="" width={24} height={24} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="est-devempty__title">No devices linked yet</div>
            <div className="est-devempty__sub">Link a device to get started.</div>
          </div>
          <Link href="/hardware" className="est-btn est-btn--outpri est-btn--sm est-devempty__cta">
            <Icon name="plus" size={15} />
            Link Device
          </Link>
        </div>
      ) : (
        <div className="est-devgrid">
          {devices.map((d) => {
            const active = d.status === "active" || d.status === "activated";
            return (
              <Link key={d.id} href="/hardware" className="est-devcard">
                <span className="est-devcard__tile" aria-hidden="true">
                  {/* biome-ignore lint/performance/noImgElement: static kit SVG glyph */}
                  <img src={deviceIcon(d)} alt="" width={40} height={40} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="est-devcard__name">{titleFromKind(d)}</div>
                  <div className="est-devcard__sub">
                    {d.scanCount.toLocaleString()} view{d.scanCount === 1 ? "" : "s"}
                  </div>
                </div>
                <span
                  className="est-devcard__status"
                  style={active ? undefined : { color: "var(--est-muted-2)" }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: active ? "var(--est-ok-dot)" : "var(--est-muted-2)",
                    }}
                  />
                  {active ? "Active" : "Inactive"}
                </span>
                <Icon name="chevR" size={16} className="est-devcard__chev" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
