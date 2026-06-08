import { Icon } from "@/components/shell/icon";
import Link from "next/link";

/**
 * Dashboard hero + KPI strip — matches `tasks/premium-ui-redesign/02_hero-kpis.png`.
 *
 * A clean white header: a blue eyebrow (date · time), a large greeting, a
 * one-line briefing subtext, a "New request" primary action + a health chip
 * top-right, and a 5-up row of primary KPI cards each with a colored delta chip.
 *
 * Server component — pure presentation. Uses existing v3 classes (`.ds-card`,
 * `.chip`, `.btn`) + tokens; no new CSS.
 */

export type HeroKpi = {
  label: string;
  value: string;
  /** Small chip under the value, e.g. "+0.18", "71% open", "8 pending". */
  chip?: { text: string; tone: "ok" | "info" | "warn" | "muted" };
};

export function DashboardHero({
  firstName,
  subtext,
  healthBand,
  kpis,
}: {
  firstName: string;
  subtext: string;
  healthBand: "strong" | "fair" | "weak";
  kpis: HeroKpi[];
}) {
  const now = new Date();
  const eyebrow = now
    .toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .toUpperCase()
    .replace(/,/g, " ·");

  const healthChip =
    healthBand === "strong"
      ? { text: "Healthy momentum", cls: "chip--ok" }
      : healthBand === "fair"
        ? { text: "Building momentum", cls: "chip--info" }
        : { text: "Needs attention", cls: "chip--warn" };

  return (
    <div className="ds-card" style={{ padding: "22px 26px 24px", marginBottom: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--pri)",
            }}
          >
            {eyebrow}
          </div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              margin: "8px 0 0",
            }}
          >
            Good {dayPart()}, {firstName}.
          </h1>
          <p className="dim" style={{ fontSize: 13.5, lineHeight: 1.5, margin: "8px 0 0", maxWidth: 620 }}>
            {subtext}
          </p>
        </div>
        <div className="col" style={{ alignItems: "flex-end", gap: 12, flexShrink: 0 }}>
          <Link href="/outreach/send" className="btn btn--dark">
            <Icon name="send" size={13} /> New request
          </Link>
          <span className={`chip ${healthChip.cls}`}>{healthChip.text}</span>
        </div>
      </div>

      {/* KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginTop: 22,
        }}
      >
        {kpis.map((k) => (
          <div
            key={k.label}
            className="ds-card"
            style={{ padding: "14px 16px", background: "var(--surface-2)", boxShadow: "none" }}
          >
            <div className="dim" style={{ fontSize: 12, fontWeight: 600 }}>
              {k.label}
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                letterSpacing: "-0.03em",
                margin: "4px 0 8px",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {k.value}
            </div>
            {k.chip && <KpiChip text={k.chip.text} tone={k.chip.tone} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiChip({ text, tone }: { text: string; tone: "ok" | "info" | "warn" | "muted" }) {
  const cls =
    tone === "ok" ? "chip--ok" : tone === "info" ? "chip--info" : tone === "warn" ? "chip--warn" : "chip--out";
  return <span className={`chip ${cls}`} style={{ fontSize: 11 }}>{text}</span>;
}

function dayPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
