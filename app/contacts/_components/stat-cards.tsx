import { Icon, type IconName } from "@/components/shell/icon";
import type { ContactStats } from "@/lib/contacts/queries";

/**
 * Four directory KPI cards (server) — kit design: soft icon tile + label + big
 * value + sublabel. Total · New this month · Active (30 days) · VIP. Numbers
 * come from `getContactStats` (fail-soft → 0). No trend lines (the delivered
 * empty/active mockups show the tinted-tile form, not sparklines).
 */

const CARDS: {
  key: keyof ContactStats;
  label: string;
  icon: IconName;
  tile: string;
  sub: string;
}[] = [
  { key: "total", label: "Total contacts", icon: "users", tile: "cd-kpi__tile--vio", sub: "All time" },
  { key: "newThisMonth", label: "New this month", icon: "plus", tile: "cd-kpi__tile--blue", sub: "Contacts added" },
  { key: "active30d", label: "Active (30 days)", icon: "bolt", tile: "cd-kpi__tile--green", sub: "Engaged recently" },
  { key: "vip", label: "VIP", icon: "star", tile: "cd-kpi__tile--orange", sub: "High priority" },
];

export function StatCards({ stats }: { stats: ContactStats }) {
  return (
    <div className="cd-kpis">
      {CARDS.map((c) => (
        <div key={c.key} className="cd-card cd-kpi">
          <span className={`cd-kpi__tile ${c.tile}`}>
            <Icon name={c.icon} size={26} />
          </span>
          <div className="cd-kpi__body">
            <p className="cd-kpi__label">{c.label}</p>
            <div className="cd-kpi__value">{stats[c.key].toLocaleString()}</div>
            <p className="cd-kpi__sub">{c.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
