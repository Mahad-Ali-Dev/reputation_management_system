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

/**
 * Monotone cubic (Fritsch–Carlson) through the points: a soft curve that never
 * overshoots between samples, so a day of zero never dips below the axis.
 */
function smoothPath(pts: Array<[number, number]>): string {
  const n = pts.length;
  const p = (i: number) => pts[i] ?? [0, 0];
  if (n < 2) return "";
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = p(i + 1)[0] - p(i)[0];
    slope.push(dx === 0 ? 0 : (p(i + 1)[1] - p(i)[1]) / dx);
  }
  const tan: number[] = pts.map((_, i) => {
    if (i === 0) return slope[0] ?? 0;
    if (i === n - 1) return slope[n - 2] ?? 0;
    const a = slope[i - 1] ?? 0;
    const b = slope[i] ?? 0;
    return a * b <= 0 ? 0 : (a + b) / 2;
  });
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i] ?? 0;
    if (s === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = (tan[i] ?? 0) / s;
    const b = (tan[i + 1] ?? 0) / s;
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      tan[i] = k * a * s;
      tan[i + 1] = k * b * s;
    }
  }
  let d = `M ${p(0)[0].toFixed(1)} ${p(0)[1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = p(i);
    const [x1, y1] = p(i + 1);
    const third = (x1 - x0) / 3;
    d += ` C ${(x0 + third).toFixed(1)} ${(y0 + (tan[i] ?? 0) * third).toFixed(1)}, ${(x1 - third).toFixed(1)} ${(y1 - (tan[i + 1] ?? 0) * third).toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

/**
 * The plot is a stretched SVG (it fills whatever width its column has), but the
 * axis labels and point markers are HTML laid over it by percentage — text and
 * dots inside a non-uniformly scaled SVG come out squashed into ellipses.
 */
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
  if (total === 0) {
    return <ChartEmpty title={title} message="Nothing to chart in this period." />;
  }

  const W = 600;
  const H = 150;
  const padT = 8;
  const plotH = H - padT;

  const max = niceMax(Math.max(...points.map((p) => p.count), 1));
  const x = (i: number) => (i * W) / (points.length - 1);
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  const line = smoothPath(points.map((p, i) => [x(i), y(p.count)]));
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const ticks = tickIndices(points.length);
  const yTicks = [max, max / 2, 0];

  return (
    <figure className="brp-chart">
      <figcaption className="brp-chart__title">{title}</figcaption>
      <div className="brp-trend" style={{ height }}>
        <div className="brp-trend__y" aria-hidden="true">
          {yTicks.map((v, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-item [max, mid, 0] axis labels, order never changes
              key={i}
              style={{ top: `${((padT + plotH * (i / 2)) / H) * 100}%` }}
            >
              {Number.isInteger(v) ? v : ""}
            </span>
          ))}
        </div>
        <div className="brp-trend__plot">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="brp-trend__svg"
            preserveAspectRatio="none"
            role="img"
            aria-label={`${title}: ${total} in total across ${points.length} days`}
          >
            <defs>
              <linearGradient id="brpArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity="0.24" />
                <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
              </linearGradient>
            </defs>
            {yTicks.map((_, i) => (
              <line
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed 3-item grid, order never changes
                key={i}
                x1={0}
                x2={W}
                y1={padT + plotH * (i / 2)}
                y2={padT + plotH * (i / 2)}
                className="brp-chart__grid"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path d={area} fill="url(#brpArea)" className="brp-trend__area" />
            <path
              d={line}
              fill="none"
              stroke={ACCENT}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className="brp-trend__line"
            />
          </svg>
          {points.map((p, i) =>
            p.count > 0 ? (
              <span
                key={p.date}
                className="brp-trend__dot"
                title={`${shortDate(p.date)}: ${p.count}`}
                style={{
                  left: `${(x(i) / W) * 100}%`,
                  top: `${(y(p.count) / H) * 100}%`,
                  animationDelay: `${380 + i * 20}ms`,
                }}
              />
            ) : null,
          )}
        </div>
        <div className="brp-trend__x" aria-hidden="true">
          {ticks.map((i) => (
            <span
              key={i}
              style={{
                left: `${(x(i) / W) * 100}%`,
                transform: `translateX(${i === 0 ? "0" : i === points.length - 1 ? "-100%" : "-50%"})`,
              }}
            >
              {shortDate(points[i]?.date ?? "")}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

// ── sparkline (compact, axis-free) ───────────────────────────────

export function Sparkline({ points, label }: { points: DailyPoint[]; label: string }) {
  const total = points.reduce((s, p) => s + p.count, 0);
  const W = 300;
  const H = 44;

  // All-zero series: draw nothing. The card's own empty state says so in words;
  // a flat line (dashed or solid) just looks like a broken chart.
  if (points.length < 2 || total === 0) return null;

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
  // Nothing published: no bare axis with dates under it — the card's empty state covers it.
  if (points.length === 0 || total === 0) return null;

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

const DONUT_COLORS = ["#4b3bff", "#0a84ff", "#8a5cff", "#ff9500", "#34c759", "#ff2d55"];

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
  removed: "#34c759",
  accepted: "#34c759",
  submitted: "#4b3bff",
  submitted_to_google: "#0a84ff",
  rejected: "#ff3b30",
  withdrawn: "#aeaeb2",
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

  const color = (label: string, i: number) =>
    STATUS_COLORS[label] ?? DONUT_COLORS[i % DONUT_COLORS.length];

  return (
    <div className="brp-stack">
      <div className="brp-stack__bar">
        {segments.map((s, i) => (
          <span
            key={s.label}
            className="brp-stack__seg"
            style={{
              width: `${(s.count / total) * 100}%`,
              background: color(s.label, i),
              animationDelay: `${i * 90}ms`,
            }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <ul className="brp-stack__legend">
        {segments.map((s, i) => (
          <li key={s.label}>
            <i style={{ background: color(s.label, i) }} />
            <span>{statusLabel(s.label)}</span>
            <span className="brp-num">{s.count}</span>
          </li>
        ))}
      </ul>
      <div className="brp-stack__foot">
        <span>{totalLabel}</span>
        <span className="brp-num">{total}</span>
      </div>
    </div>
  );
}

/** "submitted_to_google" → "Submitted to google". */
function statusLabel(s: string): string {
  const t = s.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
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
