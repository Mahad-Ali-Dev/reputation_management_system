import { Icon, type IconName } from "@/components/shell/icon";
import type { ContactStats } from "@/lib/contacts/queries";

/**
 * Four directory stat cards (server): Total · New This Month · Active 30d · VIP.
 * Plain `.ds-card` + `.stat` grid matching the v3 design system. Numbers come
 * from `getContactStats` (fail-soft → 0).
 */

const CARDS: { key: keyof ContactStats; label: string; icon: IconName; tint: string }[] = [
  { key: "total", label: "Total contacts", icon: "users", tint: "var(--ink)" },
  { key: "newThisMonth", label: "New this month", icon: "plus", tint: "var(--pri)" },
  { key: "active30d", label: "Active (30 days)", icon: "bolt", tint: "#047857" },
  { key: "vip", label: "VIP", icon: "star", tint: "var(--gold, #d97706)" },
];

export function StatCards({ stats }: { stats: ContactStats }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14,
        marginBottom: 16,
      }}
    >
      {CARDS.map((c) => (
        <div key={c.key} className="ds-card">
          <div className="stat">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="stat__label">{c.label}</span>
              <span style={{ color: c.tint, display: "inline-flex" }}>
                <Icon name={c.icon} size={16} />
              </span>
            </div>
            <div className="stat__value">{stats[c.key].toLocaleString()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
