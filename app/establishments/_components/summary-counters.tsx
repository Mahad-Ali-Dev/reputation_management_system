import Link from "next/link";
import { Icon } from "@/components/shell/icon";

/**
 * Row A (empty state) — three zero-value counters + a dashed "Add New Business"
 * card (13-my-establishments-empty §4). Values are genuine 0s derived from real
 * records (distinct from a failed load, which the page handles separately).
 */
const COUNTERS = [
  {
    key: "businesses",
    label: "Total Businesses",
    sub: "Active establishments",
    tint: "violet",
    icon: "/assets/repulabs/establishments/counter-business.svg",
  },
  {
    key: "locations",
    label: "Total Locations",
    sub: "All business locations",
    tint: "peach",
    icon: "/assets/repulabs/establishments/counter-location.svg",
  },
  {
    key: "devices",
    label: "Total Devices",
    sub: "Connected devices",
    tint: "teal",
    icon: "/assets/repulabs/establishments/counter-devices.svg",
  },
] as const;

export function SummaryCounters() {
  return (
    <div className="est-summary">
      {COUNTERS.map((c) => (
        <div key={c.key} className="est-counter">
          <span className={`est-tile est-tile--${c.tint}`} aria-hidden="true">
            {/* biome-ignore lint/performance/noImgElement: static kit SVG glyph */}
            <img src={c.icon} alt="" width={56} height={56} />
          </span>
          <div className="est-counter__body">
            <div className="est-counter__lbl">{c.label}</div>
            <div className="est-counter__val">0</div>
            <div className="est-counter__sub">{c.sub}</div>
          </div>
        </div>
      ))}

      <Link href="/establishments/new" className="est-scard est-scard--add">
        <span className="est-addcircle" aria-hidden="true">
          <Icon name="plus" size={22} />
        </span>
        <span>Add New Business</span>
      </Link>
    </div>
  );
}
