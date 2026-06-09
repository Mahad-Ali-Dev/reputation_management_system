import { Icon } from "@/components/shell/icon";
import Link from "next/link";

/**
 * Dashboard hero + KPI strip — matches `tasks/premium-ui-redesign/02_hero-kpis.png`.
 *
 * A premium white header washed with a faint cool gradient: a blue eyebrow
 * (date · time), an oversized greeting, a one-line briefing subtext, a dark
 * "New request" primary action + a soft health chip top-right, and a 5-up row
 * of near-flat KPI tiles each with tabular numbers + a colored trend chip.
 *
 * Server component — pure presentation. Uses existing v3 classes (`.ds-card`,
 * `.chip`, `.btn`) + tokens; the KPI tiles sit borderless directly on the hero
 * wash, separated by faint dividers (artboard 03) — no card-in-card chrome.
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
    <div
      className="ds-card"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "32px 36px 34px",
        marginBottom: 20,
        backgroundImage:
          "radial-gradient(120% 130% at 100% -10%, rgba(37,99,235,0.06) 0%, transparent 46%), radial-gradient(90% 90% at 0% 0%, rgba(79,70,229,0.045) 0%, transparent 40%)",
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: "0.07em",
              color: "var(--pri)",
            }}
          >
            {eyebrow}
          </div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 750,
              letterSpacing: "-0.035em",
              lineHeight: 1.06,
              margin: "10px 0 0",
              color: "var(--ink)",
            }}
          >
            Good {dayPart()}, {firstName}.
          </h1>
          <p className="dim" style={{ fontSize: 13.5, lineHeight: 1.5, margin: "9px 0 0", maxWidth: 620 }}>
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

      {/* KPI strip — near-flat borderless tiles on the hero wash, separated by
          faint vertical dividers (artboard 03). No nested card chrome. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 0,
          marginTop: 28,
          borderTop: "1px solid var(--line)",
        }}
      >
        {kpis.map((k, i) => (
          <div
            key={k.label}
            style={{
              padding: "20px 24px",
              borderLeft: i > 0 ? "1px solid var(--line)" : undefined,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)" }}>{k.label}</div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 750,
                letterSpacing: "-0.035em",
                margin: "6px 0 9px",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
                color: "var(--ink)",
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
    tone === "ok"
      ? "ds-delta ds-delta--up"
      : tone === "info"
        ? "ds-delta ds-delta--info"
        : tone === "warn"
          ? "ds-delta ds-delta--warn"
          : "ds-delta";
  return <span className={cls}>{text}</span>;
}

function dayPart(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
