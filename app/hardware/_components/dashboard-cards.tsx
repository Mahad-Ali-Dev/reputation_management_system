import { Icon } from "@/components/shell/icon";
import type { ImpactDay } from "@/lib/hardware/queries";
import {
  ArrowRight,
  CalendarDays,
  type LucideIcon,
  QrCode,
  ScanLine,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

/**
 * My Devices kit — presentational server components for the redesigned
 * /hardware dashboard. Every figure is bound to a REAL tenant query (passed
 * in by the page); sections with no data render a tasteful zero/empty state
 * with the kit illustration. No fabricated numbers.
 */


/* ── Hero ───────────────────────────────────────────────────────────── */
export function MdHero() {
  return (
    <div className="md-hero">
      <div>
        <h1 className="md-hero__title">
          Turn the counter
          <br />
          into a <em>review engine</em>
        </h1>
        <p className="md-hero__sub">QR devices, NFC cards, scan tracking, review automation.</p>
      </div>
    </div>
  );
}

/* ── AI-training banner ─────────────────────────────────────────────── */
export function MdTrainingBanner({ href }: { href: string }) {
  return (
    <div className="md-train md-train--clean">
      <Sparkles size={20} strokeWidth={1.8} aria-hidden="true" className="md-train__glyph" />
      <div style={{ minWidth: 200, flex: 1 }}>
        <div className="md-train__title">Your scans are flowing</div>
        <div className="md-train__body">
          Train your AI on your business so it can draft on-brand responses to every review you
          collect.
        </div>
      </div>
      <Link href={href} className="md-train__cta md-train__cta--clean">
        Train your AI
        <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
      </Link>
    </div>
  );
}

/* ── Scan-analytics summary row ─────────────────────────────────────── */
export function MdSummaryRow({
  totalScans,
  todayScans,
  reviewsFromScans,
  conversionLabel,
  activeDevices,
}: {
  totalScans: number;
  todayScans: number;
  reviewsFromScans: number;
  /** Pre-formatted, e.g. "8.5%" or "—". */
  conversionLabel: string;
  activeDevices: number;
}) {
  return (
    <section className="md-card md-summary" aria-label="Scan analytics summary">
      <div className="md-card__head">
        <h3 className="md-card__title">Scan analytics summary</h3>
        <span
          className="chip"
          style={{ marginLeft: "auto", height: 22, fontSize: 11, color: "var(--md-muted)" }}
        >
          <Icon name="cal" size={12} />
          All time
        </span>
      </div>
      <div className="md-summary__grid">
        <Metric
          icon={ScanLine}
          tint="lav"
          label="Total scans"
          value={fmt(totalScans)}
          badge={todayScans > 0 ? { kind: "up", text: "live" } : null}
          sub="all devices"
        />
        <Metric
          icon={CalendarDays}
          tint="blue"
          label="Today's scans"
          value={fmt(todayScans)}
          badge={todayScans > 0 ? { kind: "up", text: "today" } : null}
        />
        <Metric
          icon={Star}
          tint="yellow"
          label="Reviews from scans"
          value={fmt(reviewsFromScans)}
          badge={reviewsFromScans > 0 ? { kind: "up", text: "attributed" } : null}
        />
        <Metric
          icon={TrendingUp}
          tint="green"
          label="Conversion rate"
          value={conversionLabel}
          badge={conversionLabel === "—" ? null : { kind: "steady", text: "scans→reviews" }}
        />
        <Metric icon={QrCode} tint="lav" label="Active devices" value={fmt(activeDevices)} />
      </div>
    </section>
  );
}

function Metric({
  icon,
  tint,
  label,
  value,
  badge,
  sub,
}: {
  icon: LucideIcon;
  tint: "lav" | "blue" | "yellow" | "green";
  label: string;
  value: string;
  badge?: { kind: "up" | "steady"; text: string } | null;
  sub?: string;
}) {
  const MetricIcon = icon;
  return (
    <div className="md-metric">
      <div className="md-metric__top">
        <span className={`md-metric__tile md-metric__tile--${tint}`} aria-hidden>
          <MetricIcon size={18} strokeWidth={1.8} className="md-metric__icon" />
        </span>
        <span className="md-metric__label">{label}</span>
      </div>
      <div className="md-metric__value">{value}</div>
      {badge ? (
        <span className={`md-metric__badge md-metric__badge--${badge.kind}`}>
          {badge.kind === "up" ? <Icon name="arrowU" size={9} /> : null}
          {badge.text}
        </span>
      ) : sub ? (
        <div className="md-metric__sub">{sub}</div>
      ) : null}
    </div>
  );
}

/* ── Devices impact (area chart) ────────────────────────────────────── */
export function MdDevicesImpact({ impact }: { impact: ImpactDay[] }) {
  const scans = impact.map((d) => d.scans);
  const reviews = impact.map((d) => d.reviews);
  const max = Math.max(...scans, ...reviews, 1);
  const total = scans.reduce((a, b) => a + b, 0) + reviews.reduce((a, b) => a + b, 0);

  const W = 300;
  const H = 110;
  const stepX = impact.length > 1 ? W / (impact.length - 1) : W;
  const toY = (v: number) => H - (v / max) * (H - 8) - 4;
  const line = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${toY(v).toFixed(1)}`)
      .join(" ");
  const area = (vals: number[]) =>
    `${line(vals)} L${((vals.length - 1) * stepX).toFixed(1)},${H} L0,${H} Z`;

  return (
    <section className="md-card" aria-label="Devices impact">
      <div className="md-card__head">
        <h3 className="md-card__title">Devices impact</h3>
      </div>
      <div className="md-impact">
        <p className="md-card__sub" style={{ margin: 0 }}>
          Overview of your devices performance
        </p>
        <div className="md-impact__legend">
          <span>
            <span className="md-impact__dot" style={{ background: "#4b3bff" }} />
            Total scans
          </span>
          <span>
            <span className="md-impact__dot" style={{ background: "#a99fff" }} />
            Total reviews
          </span>
        </div>
        {total === 0 ? (
          <p className="md-empty__body" style={{ margin: "18px auto 14px", textAlign: "center" }}>
            No data to show yet. Start scanning to see your impact over time.
          </p>
        ) : (
          <svg
            className="md-impact__svg"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Scans and reviews over the last 7 days"
          >
            <defs>
              <linearGradient id="md-impact-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4b3bff" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#4b3bff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area(scans)} fill="url(#md-impact-fill)" />
            <path
              d={line(scans)}
              fill="none"
              stroke="#4b3bff"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={line(reviews)}
              fill="none"
              stroke="#a99fff"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        )}
        <div className="md-impact__axis">
          {impact.map((d, i) => (
            <span key={`${d.label}-${i}`}>{d.label}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Footer tip ─────────────────────────────────────────────────────── */
export function MdFooterTip() {
  return (
    <div className="md-tip">
      <span className="md-tip__icon" aria-hidden>
        <Icon name="sparkle" size={16} />
      </span>
      <span className="md-tip__text">
        Consistent review generation can increase customer trust by up to <strong>270%</strong>.
      </span>
      <Link href="/reports" className="md-tip__link">
        Learn more →
      </Link>
    </div>
  );
}

/* ── helpers ────────────────────────────────────────────────────────── */
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function timeAgo(d: Date): string {
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
