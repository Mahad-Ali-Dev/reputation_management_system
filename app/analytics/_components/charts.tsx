import type { DailyPoint } from "@/lib/reports/queries";

/**
 * Report charts — inline SVG, animated in CSS, rendered on the server.
 *
 * NO CHART LIBRARY on purpose. Recharts/Chart.js would add ~50-100kB, force
 * every card into a client component, and — the part that actually matters here
 * — canvas-based renderers don't reliably appear in the browser's print output.
 * These are plain SVG with CSS keyframes: they animate on screen, resolve to
 * their final frame, and print exactly as drawn (business-report.css disables
 * the animations under @media print so the PDF never catches a half-drawn line).
 *
 * Every chart degrades to a readable empty state rather than a broken axis when
 * there's no data, which is the common case for a young account.
 */

const ACCENT = "var(--rl-primary, #2563eb)";

/** "2026-05-12" → "May 12", parsed field-wise so no timezone shifts the day. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

/** Pick ~`want` evenly spaced indices so a 90-day axis stays readable. */
function tickIndices(n: number, want = 6): number[] {
  if (n <= want) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (want - 1);
  return Array.from({ length: want }, (_, i) => Math.round(i * step));
}

/** Round a max up to a friendly axis ceiling (1, 2, 5, 10, 20, 50 …). */
function niceMax(max: number): number {
  if (max <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (max <= m * pow) return m * pow;
  }
  return 10 * pow;
}

// ── trend (line + area) ──────────────────────────────────────────

export function AreaTrend({
  points,
  title,
  height = 170,
}: {
  points: DailyPoint[];
  title: string;
  height?: number;
}) {
  const total = points.reduce((s, p) => s + p.count, 0);
  if (points.length < 2) {
    return <ChartEmpty title={title} message="Not enough days in this period to chart." />;
  }

  const W = 600;
  const H = height;
  const padL = 26;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = niceMax(Math.max(...points.map((p) => p.count), 1));
  const x = (i: number) => padL + (i * plotW) / (points.length - 1);
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.count).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${padT + plotH} L ${padL} ${padT + plotH} Z`;
  const ticks = tickIndices(points.length);
  const gridLines = [0, 0.5, 1];

  return (
    <figure className="brp-chart">
      <figcaption className="brp-chart__title">{title}</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="brp-chart__svg"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: ${total} in total across ${points.length} days`}
      >
        <defs>
          <linearGradient id="brpArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridLines.map((g) => (
          <line
            key={g}
            x1={padL}
            x2={W - padR}
            y1={padT + plotH * g}
            y2={padT + plotH * g}
            className="brp-chart__grid"
          />
        ))}
        {[max, Math.round(max / 2), 0].map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-item [max, mid, 0] axis labels, order never changes
          <text key={i} x={padL - 6} y={padT + plotH * (i / 2) + 3} className="brp-chart__ylab">
            {v}
          </text>
        ))}

        <path d={area} fill="url(#brpArea)" className="brp-chart__area" />
        <path
          d={line}
          fill="none"
          stroke={ACCENT}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="brp-chart__line"
        />

        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.count)}
            r="3"
            className="brp-chart__dot"
            style={{ animationDelay: `${380 + i * 26}ms` }}
          >
            <title>{`${shortDate(p.date)}: ${p.count}`}</title>
          </circle>
        ))}

        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} className="brp-chart__xlab">
            {shortDate(points[i]?.date ?? "")}
          </text>
        ))}
      </svg>
    </figure>
  );
}

// ── sparkline (compact, axis-free) ───────────────────────────────

export function Sparkline({ points, label }: { points: DailyPoint[]; label: string }) {
  const total = points.reduce((s, p) => s + p.count, 0);
  const W = 300;
  const H = 44;

  // All-zero series: a flat dashed baseline reads as "nothing happened",
  // where a solid line pinned to the floor reads as a real measurement.
  if (points.length < 2 || total === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="brp-spark" role="img" aria-label={`${label}: none`}>
        <line x1="4" x2={W - 4} y1={H / 2} y2={H / 2} className="brp-spark__flat" />
      </svg>
    );
  }

  const max = Math.max(...points.map((p) => p.count), 1);
  const x = (i: number) => 4 + (i * (W - 8)) / (points.length - 1);
  const y = (v: number) => H - 6 - (v / max) * (H - 14);
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.count).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="brp-spark"
      role="img"
      aria-label={`${label}: ${total} in total`}
    >
      <path
        d={line}
        fill="none"
        stroke={ACCENT}
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={1}
        className="brp-chart__line"
      />
    </svg>
  );
}

// ── mini day bars ────────────────────────────────────────────────

export function DayBars({ points, label }: { points: DailyPoint[]; label: string }) {
  const total = points.reduce((s, p) => s + p.count, 0);
  const W = 320;
  const H = 64;
  const padB = 16;
  if (points.length === 0) return null;

  const max = niceMax(Math.max(...points.map((p) => p.count), 1));
  const slot = W / points.length;
  const barW = Math.max(3, Math.min(14, slot * 0.55));
  const plotH = H - padB;
  const ticks = tickIndices(points.length, 4);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="brp-daybars"
      role="img"
      aria-label={`${label}: ${total} in total`}
    >
      <line x1="0" x2={W} y1={plotH} y2={plotH} className="brp-chart__grid" />
      {points.map((p, i) => {
        const h = (p.count / max) * (plotH - 4);
        const cx = i * slot + slot / 2;
        return (
          <rect
            key={p.date}
            x={cx - barW / 2}
            y={plotH - h}
            width={barW}
            height={Math.max(h, p.count > 0 ? 2 : 0)}
            rx="2"
            className="brp-daybar"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <title>{`${shortDate(p.date)}: ${p.count}`}</title>
          </rect>
        );
      })}
      {ticks.map((i) => (
        <text key={i} x={i * slot + slot / 2} y={H - 3} className="brp-chart__xlab">
          {shortDate(points[i]?.date ?? "")}
        </text>
      ))}
    </svg>
  );
}

// ── donut ────────────────────────────────────────────────────────

const DONUT_COLORS = ["#2563eb", "#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ef4444"];

export function Donut({
  slices,
  centerLabel,
}: {
  slices: Array<{ label: string; count: number }>;
  centerLabel?: string;
}) {
  const total = slices.reduce((s, r) => s + r.count, 0);
  if (total === 0) return <p className="brp-empty">Nothing in this period.</p>;

  // pathLength=100 turns the dash maths into plain percentages.
  let offset = 0;
  const arcs = slices.map((s, i) => {
    const share = (s.count / total) * 100;
    const arc = { ...s, share, start: offset, color: DONUT_COLORS[i % DONUT_COLORS.length] };
    offset += share;
    return arc;
  });

  return (
    <div className="brp-donut">
      <div className="brp-donut__ring">
        <svg
          viewBox="0 0 42 42"
          role="img"
          aria-label={arcs.map((a) => `${a.label} ${Math.round(a.share)}%`).join(", ")}
        >
          <circle cx="21" cy="21" r="15.9" className="brp-donut__track" />
          {arcs.map((a) => (
            <circle
              key={a.label}
              cx="21"
              cy="21"
              r="15.9"
              className="brp-donut__arc"
              stroke={a.color}
              pathLength={100}
              style={
                {
                  "--len": a.share,
                  strokeDashoffset: -a.start,
                  animationDelay: `${a.start * 6}ms`,
                } as React.CSSProperties
              }
            >
              <title>{`${a.label}: ${a.count}`}</title>
            </circle>
          ))}
        </svg>
        <div className="brp-donut__center">
          <span className="brp-donut__total">{total}</span>
          {centerLabel && <span className="brp-donut__caption">{centerLabel}</span>}
        </div>
      </div>
      <ul className="brp-donut__legend">
        {arcs.map((a) => (
          <li key={a.label}>
            <span
              className="brp-donut__swatch"
              style={{ background: a.color }}
              aria-hidden="true"
            />
            <span className="brp-donut__name">{a.label}</span>
            <span className="brp-donut__count">{a.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── stacked bar ──────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  removed: "#10b981",
  accepted: "#10b981",
  submitted: "#2563eb",
  submitted_to_google: "#0ea5e9",
  rejected: "#ef4444",
  withdrawn: "#94a3b8",
};

export function StackedBar({
  segments,
  totalLabel,
}: {
  segments: Array<{ label: string; count: number }>;
  totalLabel: string;
}) {
  const total = segments.reduce((s, r) => s + r.count, 0);
  if (total === 0) return <p className="brp-empty">Nothing in this period.</p>;

  return (
    <div className="brp-stack">
      <div className="brp-stack__bar">
        {segments.map((s, i) => (
          <span
            key={s.label}
            className="brp-stack__seg"
            style={{
              width: `${(s.count / total) * 100}%`,
              background: STATUS_COLORS[s.label] ?? DONUT_COLORS[i % DONUT_COLORS.length],
              animationDelay: `${i * 90}ms`,
            }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="brp-stack__foot">
        <span>{totalLabel}</span>
        <span className="brp-num">{total}</span>
      </div>
    </div>
  );
}

// ── shared empty ─────────────────────────────────────────────────

function ChartEmpty({ title, message }: { title: string; message: string }) {
  return (
    <figure className="brp-chart">
      <figcaption className="brp-chart__title">{title}</figcaption>
      <p className="brp-empty">{message}</p>
    </figure>
  );
}
