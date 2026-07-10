"use client";

/**
 * LandingCommandCenter — "Every location. One pane of glass."
 *
 * The ONE product-data section of the dark repulabs marketing home: a single
 * mega-bento on the shared #070b16 canvas that absorbs the old metrics-cards
 * section. Twelve-column dark glass grid —
 *   Row 1: WorldMap (7 cols)   → dotted-map@3 world dots re-tinted for dark +
 *           motion/react cyan→blue glowing arcs (stroke + blurred glow copy,
 *           comet heads, pulsing endpoints, dark-glass city labels) with a
 *           floating live-review chip,
 *          InboxFeed (5 cols)  → live unified-inbox feed, dark rows, same
 *           scaleUp stagger + gradient avatar tiles,
 *   Row 2: VolumeChart (5 cols)→ recharts AreaChart re-tinted (blue/cyan 45%→0
 *           vertical gradients, dark tooltip),
 *          Metric cells (7 cols)→ three compact Visual3 hover-layer cells
 *           ported from metrics-cards.tsx (Average rating / Reviews / Bookings)
 *           with #4a7dff / #a78bfa / #34d399 colorways glowing on dark,
 *   Row 3: two wide hover FeatureCards (Autopilot / Weekly digest) with the
 *           corner preview panel + arrow chip that rotates -45° on hover.
 *
 * Animation primitives (from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for the header and each cell
 *   - ShinyText→ sheen sweep across the COMMAND CENTER eyebrow
 *   - DotGrid  → interactive dot matrix accent in the section background
 *   - Float    → gentle idle bob on the floating "new 5-star" chip
 *
 * Dark design system: bg #070b16 (seamless canvas — glow accent only), glass
 * cards rgba(255,255,255,0.035) with rgba(255,255,255,0.09) borders, white
 * headings ≤700, body #9db0d6, muted #6b7ba3, cyan #22d3ee eyebrow.
 */

import DottedMap from "dotted-map";
import {
  Activity,
  ArrowRight,
  Bot,
  Inbox,
  Mail,
  MapPin,
} from "lucide-react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DotGrid, Float, Reveal, ShinyText } from "@/components/landing/anim";

/* ─────────────────────────── shared dark glass shell ─────────────────────────── */

const PANEL_SHADOW = "0 24px 60px -36px rgba(2,6,23,0.9)";

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative h-full overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] ${className}`}
      style={{ boxShadow: PANEL_SHADOW }}
    >
      {children}
    </div>
  );
}

/** Small icon+label kicker row shared by every panel. */
function PanelKicker({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7ba3]">
      <span className="text-[#22d3ee]">{icon}</span>
      {label}
    </span>
  );
}

/* ─────────────────────────── 1. WorldMap (dark) ───────────────────────────
   dotted-map + motion arcs re-tinted for the dark canvas: rgba(158,180,255,.35)
   dots, arcs sweep cyan #22d3ee → blue #4a7dff with a blurred glow copy under
   the stroke, comet heads ride each arc via CSS offset-path, endpoints pulse,
   labels are dark-glass chips. */

type Arc = {
  start: { lat: number; lng: number; label?: string };
  end: { lat: number; lng: number; label?: string };
};

const ARCS: Arc[] = [
  { start: { lat: 34.05, lng: -118.24 }, end: { lat: 30.27, lng: -97.74, label: "Austin" } },
  { start: { lat: 40.71, lng: -74.0, label: "New York" }, end: { lat: 51.51, lng: -0.13, label: "London" } },
  { start: { lat: 30.27, lng: -97.74 }, end: { lat: 25.77, lng: -80.19 } },
  { start: { lat: 51.51, lng: -0.13 }, end: { lat: 28.61, lng: 77.21 } },
  { start: { lat: -33.87, lng: 151.21, label: "Sydney" }, end: { lat: 1.35, lng: 103.82 } },
];

const ARC_BLUE = "#4a7dff";
const ARC_CYAN = "#22d3ee";

function projectPoint(lat: number, lng: number) {
  const x = (lng + 180) * (800 / 360);
  const y = (90 - lat) * (400 / 180);
  return { x, y };
}

function createCurvedPath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const midX = (start.x + end.x) / 2;
  const midY = Math.min(start.y, end.y) - 50;
  return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
}

function MapLabel({ x, y, text, delay }: { x: number; y: number; text: string; delay: number }) {
  return (
    <motion.g
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="pointer-events-none"
    >
      <foreignObject x={x - 50} y={y - 35} width="100" height="30" className="block">
        <div className="flex h-full items-center justify-center">
          <span className="rounded-md border border-white/10 bg-[#0d1526]/90 px-2 py-0.5 text-xs font-medium text-[#e6ecff] backdrop-blur-sm">
            {text}
          </span>
        </div>
      </foreignObject>
    </motion.g>
  );
}

function WorldMap({
  arcs = ARCS,
  animationDuration = 2,
}: {
  arcs?: Arc[];
  animationDuration?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);

  const map = useMemo(() => new DottedMap({ height: 100, grid: "diagonal" }), []);
  const svgMap = useMemo(
    () =>
      map.getSVG({
        radius: 0.22,
        color: "rgba(158,180,255,0.35)",
        shape: "circle",
        backgroundColor: "transparent",
      }),
    [map],
  );

  // Calculate animation timing — draw all arcs, hold, reset (original loop).
  const staggerDelay = 0.3;
  const totalAnimationTime = arcs.length * staggerDelay + animationDuration;
  const pauseTime = 2;
  const fullCycleDuration = totalAnimationTime + pauseTime;

  return (
    <div className="relative aspect-[2/1] w-full overflow-hidden rounded-lg font-sans">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svgMap)}`}
        className="pointer-events-none h-full w-full select-none object-cover [mask-image:linear-gradient(to_bottom,transparent,white_10%,white_90%,transparent)]"
        alt="world map"
        height="495"
        width="1056"
        draggable={false}
      />
      <svg
        viewBox="0 0 800 400"
        className="pointer-events-auto absolute inset-0 h-full w-full select-none"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id={`${uid}-arc`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={ARC_CYAN} stopOpacity="0" />
            <stop offset="5%" stopColor={ARC_CYAN} stopOpacity="1" />
            <stop offset="95%" stopColor={ARC_BLUE} stopOpacity="1" />
            <stop offset="100%" stopColor={ARC_BLUE} stopOpacity="0" />
          </linearGradient>

          <filter id={`${uid}-glow`}>
            <feMorphology operator="dilate" radius="0.5" />
            <feGaussianBlur stdDeviation="1" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id={`${uid}-arcblur`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
        </defs>

        {arcs.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);
          const path = createCurvedPath(startPoint, endPoint);

          // Keyframe times for this arc within the full loop.
          const startTime = (i * staggerDelay) / fullCycleDuration;
          const endTime = (i * staggerDelay + animationDuration) / fullCycleDuration;
          const resetTime = totalAnimationTime / fullCycleDuration;

          const arcTransition = {
            duration: fullCycleDuration,
            times: [0, startTime, endTime, resetTime, 1],
            ease: "easeInOut" as const,
            repeat: Number.POSITIVE_INFINITY,
            repeatDelay: 0,
          };

          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative arc list
            <g key={`path-group-${i}`}>
              {/* blurred glow copy under the stroke — makes the arc bloom on dark */}
              <motion.path
                d={path}
                fill="none"
                stroke={`url(#${uid}-arc)`}
                strokeWidth="3.5"
                opacity="0.55"
                filter={`url(#${uid}-arcblur)`}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: [0, 0, 1, 1, 0] }}
                transition={arcTransition}
              />
              <motion.path
                d={path}
                fill="none"
                stroke={`url(#${uid}-arc)`}
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: [0, 0, 1, 1, 0] }}
                transition={arcTransition}
              />

              {/* comet head riding the arc */}
              <motion.circle
                r="4"
                fill={ARC_CYAN}
                filter={`url(#${uid}-glow)`}
                initial={{ offsetDistance: "0%", opacity: 0 }}
                animate={{
                  offsetDistance: [null, "0%", "100%", "100%", "100%"],
                  opacity: [0, 0, 1, 0, 0],
                }}
                transition={arcTransition}
                style={{ offsetPath: `path('${path}')` }}
              />
            </g>
          );
        })}

        {arcs.map((dot, i) => {
          const startPoint = projectPoint(dot.start.lat, dot.start.lng);
          const endPoint = projectPoint(dot.end.lat, dot.end.lng);

          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative arc list
            <g key={`points-group-${i}`}>
              {[
                { point: startPoint, label: dot.start.label, begin: "0s", delay: 0.5 * i + 0.3 },
                { point: endPoint, label: dot.end.label, begin: "0.5s", delay: 0.5 * i + 0.5 },
              ].map(({ point, label, begin, delay }, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: start/end pair
                <g key={j}>
                  <motion.g
                    onHoverStart={() => setHoveredLocation(label ?? `Location ${i + 1}`)}
                    onHoverEnd={() => setHoveredLocation(null)}
                    className="cursor-pointer"
                    whileHover={{ scale: 1.2 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  >
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="3"
                      fill={ARC_BLUE}
                      filter={`url(#${uid}-glow)`}
                      className="drop-shadow-lg"
                    />
                    <circle cx={point.x} cy={point.y} r="3" fill={ARC_CYAN} opacity="0.5">
                      <animate attributeName="r" from="3" to="12" dur="2s" begin={begin} repeatCount="indefinite" />
                      <animate attributeName="opacity" from="0.6" to="0" dur="2s" begin={begin} repeatCount="indefinite" />
                    </circle>
                  </motion.g>
                  {label && <MapLabel x={point.x} y={point.y} text={label} delay={delay} />}
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Mobile tooltip (hover echo) */}
      <AnimatePresence>
        {hoveredLocation && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-4 left-4 rounded-lg border border-white/10 bg-[#0d1526]/90 px-3 py-2 text-sm font-medium text-[#e6ecff] backdrop-blur-sm sm:hidden"
          >
            {hoveredLocation}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── 2. Unified-inbox feed (dark) ───────────────────────────
   Same scaleUp stagger (keyframes inlined, 300ms per row, fill forwards) with
   dark glass rows — the gradient avatar tiles pop on the dark canvas. Rows only
   start animating once scrolled into view. */

type FeedMessage = {
  title: string;
  time: string;
  content: string;
  color: string;
};

const FEED: FeedMessage[] = [
  {
    title: "Google Reviews",
    time: "1m ago",
    content: "New 5★ review — “Best front desk experience I've ever had.”",
    color: "from-amber-400 to-orange-500",
  },
  {
    title: "WhatsApp",
    time: "3m ago",
    content: "AI reply approved and sent to Sarah M.",
    color: "from-emerald-400 to-green-600",
  },
  {
    title: "AI Phone",
    time: "6m ago",
    content: "Missed call answered — callback booked for 2:30 pm.",
    color: "from-violet-500 to-fuchsia-500",
  },
  {
    title: "SMS Requests",
    time: "10m ago",
    content: "Review request delivered to 24 of today's customers.",
    color: "from-sky-400 to-blue-600",
  },
  {
    title: "Facebook",
    time: "12m ago",
    content: "New comment on your latest post — awaiting a reply.",
    color: "from-blue-600 to-indigo-500",
  },
  {
    title: "Weekly Report",
    time: "15m ago",
    content: "Your Monday digest is ready — rating climbed to 4.8.",
    color: "from-cyan-400 to-blue-500",
  },
];

function InboxFeed() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  return (
    <div ref={ref} className="relative h-full min-h-[280px] w-full overflow-hidden">
      {/* fade shadow overlay — fades to the composite glass-card surface */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-[#10141e] to-transparent" />

      <div className="relative z-0 space-y-2">
        {FEED.map((msg, i) => (
          <div
            key={msg.title}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/[0.08] bg-white/[0.04] p-3 transition duration-300 ease-in-out hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.07]"
            style={{
              opacity: 0,
              animation: inView
                ? `lp-cc-scale-up 0.55s cubic-bezier(0.16, 1, 0.3, 1) ${i * 300}ms forwards`
                : "none",
            }}
          >
            <div
              className={`h-8 w-8 min-h-[2rem] min-w-[2rem] rounded-lg bg-gradient-to-br ${msg.color}`}
            />
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#e8eeff]">
                {msg.title}
                <span className="text-xs font-normal text-[#6b7ba3] before:mr-1 before:content-['•']">
                  {msg.time}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-[#9db0d6]">{msg.content}</p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes lp-cc-scale-up {
          0% { opacity: 0; transform: scale(0.92) translateY(8px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ─────────────────────────── 3. Volume chart (dark) ───────────────────────────
   recharts AreaChart re-tinted — blue #4a7dff / cyan #22d3ee series, vertical
   gradient fills 45% → 0%, hidden axes, no grid, dark #0d1526 tooltip. */

const CHART_DATA = [
  { month: "Feb", reviews: 42, requests: 118 },
  { month: "Mar", reviews: 61, requests: 176 },
  { month: "Apr", reviews: 96, requests: 224 },
  { month: "May", reviews: 128, requests: 297 },
  { month: "Jun", reviews: 169, requests: 358 },
  { month: "Jul", reviews: 236, requests: 462 },
];

const SERIES = {
  reviews: { label: "Reviews collected", color: "#4a7dff" },
  requests: { label: "Requests sent", color: "#22d3ee" },
} as const;

type TipItem = {
  name?: string | number;
  value?: string | number;
  color?: string;
};

function ChartTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border border-white/10 bg-[#0d1526] px-3 py-2"
      style={{ boxShadow: "0 14px 34px -14px rgba(2,6,23,0.9)" }}
    >
      <div className="text-xs font-semibold text-white">{label}</div>
      {payload.map((p) => (
        <div key={String(p.name)} className="mt-1 flex items-center gap-2 text-xs text-[#9db0d6]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-3 font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function VolumeChart() {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <div>
      {/* mini legend */}
      <div className="mb-2 flex items-center gap-4 text-xs text-[#9db0d6]">
        {Object.values(SERIES).map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={CHART_DATA} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`${uid}-reviews`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.reviews.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={SERIES.reviews.color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`${uid}-requests`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.requests.color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={SERIES.requests.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" hide />
            <YAxis hide />
            <Tooltip cursor={false} content={<ChartTip />} />
            <Area
              strokeWidth={2}
              dataKey="requests"
              name={SERIES.requests.label}
              type="monotone"
              fill={`url(#${uid}-requests)`}
              stroke={SERIES.requests.color}
            />
            <Area
              strokeWidth={2}
              dataKey="reviews"
              name={SERIES.reviews.label}
              type="monotone"
              fill={`url(#${uid}-reviews)`}
              stroke={SERIES.reviews.color}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─────────────────────────── 4. Visual3 metric cells (dark) ───────────────────────────
   Compact port of the metrics-cards Visual3 layer stack — GridLayer (masked
   grid, rgba(255,255,255,0.07) lines) → EllipseGradient (radial tint) →
   Layer1 (stat pills, fade OUT on hover) → Layer2 (info chip, slides UP) →
   Layer3 (bottom wash) → Layer4 (layered bars: base white/10, colored bars
   with a drop-shadow glow; scales to 150% while every bar re-tweens). Same
   cubic-bezier(0.6,0.6,0,1) 500ms choreography, made fluid-width via viewBox. */

const CELL_VB = "0 0 356 180";

const MetricGridLayer = () => (
  <div
    style={{ "--grid-color": "rgba(255,255,255,0.07)" } as CSSProperties}
    className="pointer-events-none absolute inset-0 z-[4] h-full w-full bg-transparent bg-[linear-gradient(to_right,var(--grid-color)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-color)_1px,transparent_1px)] bg-[size:20px_20px] bg-center opacity-70 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]"
  />
);

const MetricEllipse = ({ color }: { color: string }) => {
  const gid = `lp-cc-radial-${color.replace("#", "")}`;
  return (
    <div className="absolute inset-0 z-[5] h-full w-full">
      <svg
        className="h-full w-full"
        viewBox={CELL_VB}
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect width="356" height="180" fill={`url(#${gid})`} />
        <defs>
          <radialGradient
            id={gid}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(178 98) rotate(90) scale(98 178)"
          >
            <stop stopColor={color} stopOpacity="0.28" />
            <stop offset="0.34" stopColor={color} stopOpacity="0.15" />
            <stop offset="1" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
};

const MetricPills = ({
  color,
  secondaryColor,
  pillPrimary,
  pillSecondary,
}: {
  color: string;
  secondaryColor: string;
  pillPrimary: string;
  pillSecondary: string;
}) => (
  <div
    className="absolute left-3 top-3 z-[8] flex items-center gap-1"
    style={{ "--color": color, "--secondary-color": secondaryColor } as CSSProperties}
  >
    <div className="flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 backdrop-blur-sm transition-opacity duration-300 ease-in-out group-hover/animated-card:opacity-0">
      <div className="h-1.5 w-1.5 rounded-full bg-[var(--color)]" />
      <span className="ml-1 text-[10px] font-semibold text-[#e8eeff]">{pillPrimary}</span>
    </div>
    <div className="flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.06] px-1.5 py-0.5 backdrop-blur-sm transition-opacity duration-300 ease-in-out group-hover/animated-card:opacity-0">
      <div className="h-1.5 w-1.5 rounded-full bg-[var(--secondary-color)]" />
      <span className="ml-1 text-[10px] font-semibold text-[#e8eeff]">{pillSecondary}</span>
    </div>
  </div>
);

const MetricHoverChip = ({ color, title, sub }: { color: string; title: string; sub: string }) => (
  <div className="group relative h-full w-full" style={{ "--color": color } as CSSProperties}>
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[7] flex w-full translate-y-full items-start justify-center bg-transparent p-3 transition-transform duration-500 group-hover/animated-card:translate-y-0">
      <div className="ease-[cubic-bezier(0.6,0.6,0,1)] rounded-md border border-white/10 bg-[#0d1526]/85 p-1.5 opacity-0 backdrop-blur-sm transition-opacity duration-500 group-hover/animated-card:opacity-100">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--color)]" />
          <p className="text-xs font-semibold text-white">{title}</p>
        </div>
        <p className="text-xs text-[#9db0d6]">{sub}</p>
      </div>
    </div>
  </div>
);

const MetricWash = ({ color }: { color: string }) => {
  const gid = `lp-cc-linear-${color.replace("#", "")}`;
  return (
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[6] translate-y-full opacity-0 transition-all duration-500 group-hover/animated-card:translate-y-0 group-hover/animated-card:opacity-100">
      <svg
        className="h-full w-full"
        viewBox={CELL_VB}
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <rect width="356" height="180" fill={`url(#${gid})`} />
        <defs>
          <linearGradient id={gid} x1="178" y1="0" x2="178" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0.35" stopColor={color} stopOpacity="0" />
            <stop offset="1" stopColor={color} stopOpacity="0.3" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

const MetricBars = ({
  color,
  secondaryColor,
  hovered,
}: {
  color: string;
  secondaryColor: string;
  hovered: boolean;
}) => {
  const rectsData = [
    { width: 15, height: 20, y: 110, hoverHeight: 20, hoverY: 130, x: 40, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 20, y: 90, hoverHeight: 20, hoverY: 130, x: 60, fill: color, hoverFill: color },
    { width: 15, height: 40, y: 70, hoverHeight: 30, hoverY: 120, x: 80, fill: color, hoverFill: color },
    { width: 15, height: 30, y: 80, hoverHeight: 50, hoverY: 100, x: 100, fill: color, hoverFill: color },
    { width: 15, height: 30, y: 110, hoverHeight: 40, hoverY: 110, x: 120, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 50, y: 110, hoverHeight: 20, hoverY: 130, x: 140, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 50, y: 60, hoverHeight: 30, hoverY: 120, x: 160, fill: color, hoverFill: color },
    { width: 15, height: 30, y: 80, hoverHeight: 20, hoverY: 130, x: 180, fill: color, hoverFill: color },
    { width: 15, height: 20, y: 110, hoverHeight: 40, hoverY: 110, x: 200, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 40, y: 70, hoverHeight: 60, hoverY: 90, x: 220, fill: color, hoverFill: color },
    { width: 15, height: 30, y: 110, hoverHeight: 70, hoverY: 80, x: 240, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 50, y: 110, hoverHeight: 50, hoverY: 100, x: 260, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 20, y: 110, hoverHeight: 80, hoverY: 70, x: 280, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 30, y: 80, hoverHeight: 90, hoverY: 60, x: 300, fill: color, hoverFill: color },
  ];

  return (
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[8] h-full w-full text-white/10 transition-transform duration-500 group-hover/animated-card:scale-150">
      <svg
        className="h-full w-full"
        viewBox={CELL_VB}
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {rectsData.map((rect, index) => {
          const fill = hovered ? rect.hoverFill : rect.fill;
          const colored = fill !== "currentColor";
          return (
            <rect
              // biome-ignore lint/suspicious/noArrayIndexKey: static bar chart
              key={index}
              width={rect.width}
              height={hovered ? rect.hoverHeight : rect.height}
              x={rect.x}
              y={hovered ? rect.hoverY : rect.y}
              fill={fill}
              rx="2"
              ry="2"
              className="ease-[cubic-bezier(0.6,0.6,0,1)] transition-all duration-500"
              style={colored ? { filter: `drop-shadow(0 0 5px ${fill}80)` } : undefined}
            />
          );
        })}
      </svg>
    </div>
  );
};

type MetricCell = {
  mainColor: string;
  secondaryColor: string;
  value: string;
  label: string;
  pillPrimary: string;
  pillSecondary: string;
  hoverTitle: string;
  hoverSub: string;
};

const METRIC_CELLS: MetricCell[] = [
  {
    mainColor: "#4a7dff",
    secondaryColor: "#22d3ee",
    value: "4.8",
    label: "Average rating",
    pillPrimary: "4.8 avg",
    pillSecondary: "+0.3 QoQ",
    hoverTitle: "Rating trend",
    hoverSub: "Climbing across every location.",
  },
  {
    mainColor: "#a78bfa",
    secondaryColor: "#f0abfc",
    value: "+47/mo",
    label: "Reviews",
    pillPrimary: "+47 new",
    pillSecondary: "96% replied",
    hoverTitle: "Review velocity",
    hoverSub: "New reviews vs. responses.",
  },
  {
    mainColor: "#34d399",
    secondaryColor: "#22d3ee",
    value: "+31",
    label: "Bookings",
    pillPrimary: "+31 booked",
    pillSecondary: "0 missed",
    hoverTitle: "Call conversions",
    hoverSub: "AI answers, callers become visits.",
  },
];

function MetricCellCard({ cell }: { cell: MetricCell }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group/animated-card relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white/[0.16]"
      style={{ boxShadow: PANEL_SHADOW }}
    >
      {/* layered visual — hover captured on the top layer */}
      <div className="relative min-h-[140px] w-full flex-1 overflow-hidden">
        <div
          className="absolute inset-0 z-20"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />
        <MetricBars color={cell.mainColor} secondaryColor={cell.secondaryColor} hovered={hovered} />
        <MetricWash color={cell.mainColor} />
        <MetricHoverChip color={cell.mainColor} title={cell.hoverTitle} sub={cell.hoverSub} />
        <MetricPills
          color={cell.mainColor}
          secondaryColor={cell.secondaryColor}
          pillPrimary={cell.pillPrimary}
          pillSecondary={cell.pillSecondary}
        />
        <MetricEllipse color={cell.mainColor} />
        <MetricGridLayer />
      </div>

      {/* metric readout */}
      <div className="border-t border-white/[0.08] p-4">
        <div className="text-lg font-bold leading-none tracking-[-0.01em] text-white">{cell.value}</div>
        <p className="mt-1.5 text-xs text-[#9db0d6]">{cell.label}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── 5. Feature cards (dark) ───────────────────────────
   Wide flat hover cells — corner preview panel pinned bottom-right behind a
   thick dark frame, arrow chip that rotates -45° on hover. */

function FeatureCard({
  icon,
  title,
  subtitle,
  description,
  chips,
  art,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  description: string;
  chips: string[];
  art: ReactNode;
}) {
  return (
    <div
      className="group relative flex h-full min-h-[200px] flex-col gap-3 overflow-hidden rounded-2xl border border-white/[0.09] bg-white/[0.035] p-5 pb-24 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] sm:p-6 sm:pb-24"
      style={{ boxShadow: PANEL_SHADOW }}
    >
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#6b7ba3]">
        <span className="text-[#22d3ee]">{icon}</span>
        {title}
      </span>
      <h4 className="text-lg font-bold leading-snug text-white">
        {subtitle}{" "}
        <span className="font-normal text-[#9db0d6]">{description}</span>
      </h4>

      {/* capability chips — pinned above the corner panel, clear of the art */}
      <div className="mt-auto flex flex-wrap items-start gap-1.5 pr-40">
        {chips.map((chip) => (
          <span
            key={chip}
            className="whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[#cdd8f2]"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* preview panel pinned to bottom right (thick-framed corner card) */}
      <div className="absolute bottom-0 right-0 h-24 w-28 overflow-hidden rounded-tl-xl border-8 border-b-0 border-r-0 border-[#101a30] sm:h-28 sm:w-40">
        {art}
      </div>

      {/* arrow chip on top — rotates on hover */}
      <div className="absolute bottom-2.5 right-2.5 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-[#0d1526]/90 backdrop-blur-sm transition-transform duration-300 group-hover:-rotate-45">
        <ArrowRight className="h-4 w-4 text-[#22d3ee]" />
      </div>
    </div>
  );
}

function AutopilotArt() {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 bg-gradient-to-br from-[#4f46e5] to-[#22d3ee] p-3">
      <div className="h-1.5 w-3/4 rounded-full bg-white/70" />
      <div className="h-1.5 w-1/2 rounded-full bg-white/45" />
      <div className="mt-1 inline-flex w-max items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-semibold text-[#4f46e5]">
        ✓ Approved
      </div>
    </div>
  );
}

function DigestArt() {
  return (
    <div className="flex h-full w-full items-end gap-1.5 bg-gradient-to-br from-[#7c3aed] to-[#4a7dff] p-3">
      {[35, 55, 45, 70, 88, 100].map((h) => (
        <div key={h} className="w-full rounded-t-sm bg-white/70" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

/* ─────────────────────────── section ─────────────────────────── */

export function LandingCommandCenter() {
  return (
    <section
      id="command"
      aria-labelledby="command-heading"
      className="relative isolate overflow-hidden py-24 sm:py-28"
      style={{ background: "#070b16" }}
    >
      {/* ── decorative background (aria-hidden) — faint glow, seamless canvas ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 500px at 80% 0%, rgba(59,90,255,0.10), transparent 70%)",
          }}
        />
        <div
          className="absolute right-0 top-0 h-[360px] w-[460px]"
          style={{
            WebkitMaskImage: "radial-gradient(100% 100% at 100% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(100% 100% at 100% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="90, 130, 255" spacing={22} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <ShinyText
              text="✦ COMMAND CENTER"
              className="text-xs font-bold uppercase tracking-[0.22em] text-[#22d3ee]"
            />
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="command-heading"
              className="mx-auto mt-6 max-w-[16ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.02em] text-white sm:text-[56px]"
            >
              Every location.{" "}
              <span className="bg-gradient-to-r from-[#4a7dff] via-[#22d3ee] to-[#22d3ee] bg-clip-text text-transparent">
                One pane of glass.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-[1.55] text-[#9db0d6] sm:text-[19px]">
              Reviews, messages, calls and reports from every storefront stream
              into one live command center — so nothing slips, anywhere.
            </p>
          </Reveal>
        </div>

        {/* ── mega-bento grid ── */}
        <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Row 1 — world map (7) */}
          <Reveal className="lg:col-span-7">
            <Panel className="flex flex-col p-5 sm:p-6">
              <PanelKicker icon={<MapPin className="h-4 w-4" />} label="Live locations" />
              <h3 className="text-xl font-bold leading-snug text-white">
                Reviews landing from every location.{" "}
                <span className="font-normal text-[#9db0d6]">
                  Watch feedback stream in across the map, live.
                </span>
              </h3>

              <div className="mt-4 flex flex-1 items-center">
                <div className="relative w-full">
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
                    <Float amount={5} duration={4.4}>
                      <div
                        className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#0d1526]/90 px-3 py-1 text-xs font-medium text-[#e6ecff] backdrop-blur-sm"
                        style={{ boxShadow: "0 10px 30px -10px rgba(59,90,255,0.5)" }}
                      >
                        🌟 New 5-star from Austin, TX
                      </div>
                    </Float>
                  </div>
                  <WorldMap />
                </div>
              </div>
            </Panel>
          </Reveal>

          {/* Row 1 — unified inbox feed (5) */}
          <Reveal delay={0.08} className="lg:col-span-5">
            <Panel className="flex flex-col justify-between gap-4 p-5 sm:p-6">
              <div>
                <PanelKicker icon={<Inbox className="h-4 w-4" />} label="Unified inbox" />
                <h3 className="text-xl font-bold leading-snug text-white">
                  Every channel, one inbox.{" "}
                  <span className="font-normal text-[#9db0d6]">
                    Google, WhatsApp, SMS, socials and your AI phone line.
                  </span>
                </h3>
              </div>
              <div className="flex w-full flex-1 items-stretch justify-center">
                <div className="flex w-full max-w-sm flex-col">
                  <InboxFeed />
                </div>
              </div>
            </Panel>
          </Reveal>

          {/* Row 2 — monitoring chart (5) */}
          <Reveal delay={0.12} className="lg:col-span-5">
            <Panel className="space-y-4 p-5 sm:p-6">
              <PanelKicker icon={<Activity className="h-4 w-4" />} label="repulabs analytics" />
              <h3 className="text-xl font-bold leading-snug text-white">
                Watch the volume climb.{" "}
                <span className="font-normal text-[#9db0d6]">
                  Requests out, reviews in — trending up every month.
                </span>
              </h3>
              <VolumeChart />
            </Panel>
          </Reveal>

          {/* Row 2 — three Visual3 metric cells (7) */}
          <Reveal delay={0.16} className="lg:col-span-7">
            <div className="grid h-full grid-cols-1 gap-5 sm:grid-cols-3">
              {METRIC_CELLS.map((cell) => (
                <MetricCellCard key={cell.label} cell={cell} />
              ))}
            </div>
          </Reveal>

          {/* Row 3 — wide feature cells (6 + 6) */}
          <Reveal delay={0.2} className="lg:col-span-6">
            <FeatureCard
              icon={<Bot className="h-4 w-4" />}
              title="Autopilot"
              subtitle="Approval gates on every loop."
              description="AI drafts every reply and request — nothing ships without your yes."
              chips={["Draft → approve", "Escalation rules", "Tone controls"]}
              art={<AutopilotArt />}
            />
          </Reveal>
          <Reveal delay={0.24} className="lg:col-span-6">
            <FeatureCard
              icon={<Mail className="h-4 w-4" />}
              title="Weekly digest"
              subtitle="A report your team will read."
              description="Wins, trends and to-dos in one Monday-morning email."
              chips={["Rating trend", "Reply times", "Leaderboard"]}
              art={<DigestArt />}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default LandingCommandCenter;
