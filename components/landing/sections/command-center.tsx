"use client";

/**
 * LandingCommandCenter — "Every location. One pane of glass."
 *
 * The multi-location proof section of the repulabs marketing home, ported from
 * the founder's `hero section.txt` CombinedFeaturedSection + WorldMap: a 2×2
 * command-center grid of white panels —
 *   1. WorldMap    → dotted-map@3 world dots + motion/react animated connection
 *                    arcs (blue→cyan gradient, comet heads, pulsing endpoints,
 *                    hoverable city labels) with a floating live-review chip,
 *   2. InboxFeed   → the RuixenFeaturedMessageCard message stack re-cast as a
 *                    live unified-inbox feed (same scaleUp stagger keyframes,
 *                    gradient avatar tiles, bottom fade),
 *   3. VolumeChart → the MonitoringChart AreaChart on recharts@3 (two series,
 *                    dual vertical gradient fills, hidden axes, rounded tooltip),
 *   4. FeatureCards→ two ported hover cards with the corner preview panel and
 *                    the arrow chip that rotates -45° on hover.
 *
 * Animation primitives (from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for the header and each panel
 *   - ShinyText→ premium sheen sweep across the COMMAND CENTER badge label
 *   - DotGrid  → interactive dot matrix in the section background
 *   - Float    → gentle idle bob on the floating "new 5-star" chip
 *
 * Brand: light premium — white / very-light-blue surface, 1px #e7ecf6 card
 * borders, blue #2563eb primary, cyan #22d3ee + violet #7c3aed accents,
 * Inter ≤700 (no faux-bold).
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
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DotGrid, Float, Reveal, ShinyText } from "@/components/landing/anim";

/* ─────────────────────────── shared panel shell ─────────────────────────── */

const PANEL_SHADOW = "0 14px 34px -18px rgba(26,43,95,0.16)";

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative h-full overflow-hidden rounded-2xl border border-[#e7ecf6] bg-white ${className}`}
      style={{ boxShadow: PANEL_SHADOW }}
    >
      {children}
    </div>
  );
}

/** Small icon+label kicker row shared by every panel (original tag row). */
function PanelKicker({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a86a3]">
      {icon}
      {label}
    </span>
  );
}

/* ─────────────────────────── 1. WorldMap ───────────────────────────
   Port of the founder's WorldMap (dotted-map + motion arcs). Light-only:
   #94a3c8 dots, arcs sweep blue #2563eb → cyan #22d3ee, comet heads ride
   each arc via CSS offset-path, endpoints pulse, labels fade in. */

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

const ARC_BLUE = "#2563eb";
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
          <span className="rounded-md border border-[#e7ecf6] bg-white/95 px-2 py-0.5 text-sm font-medium text-[#0b1220] shadow-sm">
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
        color: "#94a3c8",
        shape: "circle",
        backgroundColor: "white",
      }),
    [map],
  );

  // Calculate animation timing — draw all arcs, hold, reset (original loop).
  const staggerDelay = 0.3;
  const totalAnimationTime = arcs.length * staggerDelay + animationDuration;
  const pauseTime = 2;
  const fullCycleDuration = totalAnimationTime + pauseTime;

  return (
    <div className="relative aspect-[2/1] w-full overflow-hidden rounded-lg bg-white font-sans">
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
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="5%" stopColor={ARC_BLUE} stopOpacity="1" />
            <stop offset="95%" stopColor={ARC_CYAN} stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          <filter id={`${uid}-glow`}>
            <feMorphology operator="dilate" radius="0.5" />
            <feGaussianBlur stdDeviation="1" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
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

          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative arc list
            <g key={`path-group-${i}`}>
              <motion.path
                d={path}
                fill="none"
                stroke={`url(#${uid}-arc)`}
                strokeWidth="1"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: [0, 0, 1, 1, 0] }}
                transition={{
                  duration: fullCycleDuration,
                  times: [0, startTime, endTime, resetTime, 1],
                  ease: "easeInOut",
                  repeat: Number.POSITIVE_INFINITY,
                  repeatDelay: 0,
                }}
              />

              {/* comet head riding the arc */}
              <motion.circle
                r="4"
                fill={ARC_CYAN}
                initial={{ offsetDistance: "0%", opacity: 0 }}
                animate={{
                  offsetDistance: [null, "0%", "100%", "100%", "100%"],
                  opacity: [0, 0, 1, 0, 0],
                }}
                transition={{
                  duration: fullCycleDuration,
                  times: [0, startTime, endTime, resetTime, 1],
                  ease: "easeInOut",
                  repeat: Number.POSITIVE_INFINITY,
                  repeatDelay: 0,
                }}
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
                    <circle cx={point.x} cy={point.y} r="3" fill={ARC_BLUE} opacity="0.5">
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
            className="absolute bottom-4 left-4 rounded-lg border border-[#e7ecf6] bg-white/90 px-3 py-2 text-sm font-medium text-[#0b1220] backdrop-blur-sm sm:hidden"
          >
            {hoveredLocation}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── 2. Unified-inbox feed ───────────────────────────
   Port of RuixenFeaturedMessageCard — same scaleUp stagger (keyframes inlined,
   300ms per row, fill forwards), gradient avatar tiles, bottom fade. Rows only
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
    <div ref={ref} className="relative h-[280px] w-full overflow-hidden">
      {/* fade shadow overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-white to-transparent" />

      <div className="relative z-0 space-y-2">
        {FEED.map((msg, i) => (
          <div
            key={msg.title}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-[#e7ecf6] bg-white p-3 transition duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-sm"
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
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0b1220]">
                {msg.title}
                <span className="text-xs font-normal text-[#8b93a7] before:mr-1 before:content-['•']">
                  {msg.time}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-[#5b6473]">{msg.content}</p>
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

/* ─────────────────────────── 3. Volume chart ───────────────────────────
   Port of MonitoringChart to recharts@3 — AreaChart, two series, dual vertical
   gradient fills, hidden axes, rounded white tooltip. */

const CHART_DATA = [
  { month: "Feb", reviews: 42, requests: 118 },
  { month: "Mar", reviews: 61, requests: 176 },
  { month: "Apr", reviews: 96, requests: 224 },
  { month: "May", reviews: 128, requests: 297 },
  { month: "Jun", reviews: 169, requests: 358 },
  { month: "Jul", reviews: 236, requests: 462 },
];

const SERIES = {
  reviews: { label: "Reviews collected", color: "#2563eb" },
  requests: { label: "Requests sent", color: "#60a5fa" },
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
      className="rounded-xl border border-[#e7ecf6] bg-white px-3 py-2"
      style={{ boxShadow: "0 10px 26px -12px rgba(26,43,95,0.28)" }}
    >
      <div className="text-xs font-semibold text-[#0b1220]">{label}</div>
      {payload.map((p) => (
        <div key={String(p.name)} className="mt-1 flex items-center gap-2 text-xs text-[#5b6473]">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-3 font-semibold text-[#0b1220]">{p.value}</span>
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
      <div className="mb-2 flex items-center gap-4 text-xs text-[#5b6473]">
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
                <stop offset="0%" stopColor={SERIES.reviews.color} stopOpacity={0.8} />
                <stop offset="55%" stopColor={SERIES.reviews.color} stopOpacity={0.08} />
              </linearGradient>
              <linearGradient id={`${uid}-requests`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES.requests.color} stopOpacity={0.8} />
                <stop offset="55%" stopColor={SERIES.requests.color} stopOpacity={0.08} />
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

/* ─────────────────────────── 4. Feature cards ───────────────────────────
   Port of FeatureCard — corner preview panel pinned bottom-right behind a
   thick pale frame, arrow chip that rotates -45° on hover. */

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
      className="group relative flex h-full min-h-[220px] flex-col gap-3 overflow-hidden rounded-2xl border border-[#e7ecf6] bg-white p-5 pb-28 transition-transform duration-300 ease-out hover:-translate-y-1"
      style={{ boxShadow: PANEL_SHADOW }}
    >
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a86a3]">
        {icon}
        {title}
      </span>
      <h4 className="text-lg font-bold leading-snug text-[#0b1220]">
        {subtitle}{" "}
        <span className="font-normal text-[#5b6473]">{description}</span>
      </h4>

      {/* capability chips — pinned above the corner panel, clear of the art */}
      <div className="mt-auto flex flex-col items-start gap-1.5 pr-32">
        {chips.map((chip) => (
          <span
            key={chip}
            className="whitespace-nowrap rounded-full border border-[#e7ecf6] bg-[#f6f9ff] px-2.5 py-1 text-[11px] font-medium text-[#5b6473]"
          >
            {chip}
          </span>
        ))}
      </div>

      {/* preview panel pinned to bottom right (original thick-framed Card) */}
      <div className="absolute bottom-0 right-0 h-24 w-28 overflow-hidden rounded-tl-xl border-8 border-b-0 border-r-0 border-[#eef3fc] sm:h-28 sm:w-36">
        {art}
      </div>

      {/* arrow chip on top — rotates on hover */}
      <div className="absolute bottom-2.5 right-2.5 z-10 grid h-10 w-10 place-items-center rounded-full border border-[#e7ecf6] bg-white shadow-sm transition-transform duration-300 group-hover:-rotate-45">
        <ArrowRight className="h-4 w-4 text-[#2563eb]" />
      </div>
    </div>
  );
}

function AutopilotArt() {
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5 bg-gradient-to-br from-[#2563eb] to-[#22d3ee] p-3">
      <div className="h-1.5 w-3/4 rounded-full bg-white/70" />
      <div className="h-1.5 w-1/2 rounded-full bg-white/45" />
      <div className="mt-1 inline-flex w-max items-center gap-1 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-semibold text-[#2563eb]">
        ✓ Approved
      </div>
    </div>
  );
}

function DigestArt() {
  return (
    <div className="flex h-full w-full items-end gap-1.5 bg-gradient-to-br from-[#7c3aed] to-[#2563eb] p-3">
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
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #ffffff 0%, #f0f5ff 45%, #f8faff 100%)",
      }}
    >
      {/* ── decorative background (aria-hidden) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute right-0 top-0 h-[360px] w-[460px]"
          style={{
            WebkitMaskImage: "radial-gradient(100% 100% at 100% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(100% 100% at 100% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="37, 99, 235" spacing={22} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur"
              style={{ borderColor: "#D9DDF7", background: "rgba(255,255,255,0.65)" }}
            >
              <ShinyText
                text="✦ COMMAND CENTER"
                className="text-[13px] font-bold tracking-[0.16em] text-[#2563eb]"
              />
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="command-heading"
              className="mx-auto mt-6 max-w-[16ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-[#0b1220] sm:text-[56px]"
            >
              Every location.{" "}
              <span className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] bg-clip-text text-transparent">
                One pane of glass.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-[1.55] text-[#5b6473] sm:text-[19px]">
              Reviews, messages, calls and reports from every storefront stream
              into one live command center — so nothing slips, anywhere.
            </p>
          </Reveal>
        </div>

        {/* ── 2×2 command grid ── */}
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* 1. World map — top left */}
          <Reveal className="h-full">
            <Panel className="p-5 sm:p-6">
              <PanelKicker icon={<MapPin className="h-4 w-4" />} label="Live locations" />
              <h3 className="text-xl font-bold leading-snug text-[#0b1220]">
                Reviews landing from every location.{" "}
                <span className="font-normal text-[#5b6473]">
                  Watch feedback stream in across the map, live.
                </span>
              </h3>

              <div className="relative mt-4">
                <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2">
                  <Float amount={5} duration={4.4}>
                    <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-[#e7ecf6] bg-white px-3 py-1 text-xs font-medium text-[#0b1220] shadow-md">
                      🌟 New 5-star from Austin, TX
                    </div>
                  </Float>
                </div>
                <WorldMap />
              </div>
            </Panel>
          </Reveal>

          {/* 2. Unified inbox feed — top right */}
          <Reveal delay={0.08} className="h-full">
            <Panel className="flex flex-col justify-between gap-4 p-5 sm:p-6">
              <div>
                <PanelKicker icon={<Inbox className="h-4 w-4" />} label="Unified inbox" />
                <h3 className="text-xl font-bold leading-snug text-[#0b1220]">
                  Every channel, one inbox.{" "}
                  <span className="font-normal text-[#5b6473]">
                    Google, WhatsApp, SMS, socials and your AI phone line.
                  </span>
                </h3>
              </div>
              <div className="flex w-full items-center justify-center">
                <div className="w-full max-w-sm">
                  <InboxFeed />
                </div>
              </div>
            </Panel>
          </Reveal>

          {/* 3. Monitoring chart — bottom left */}
          <Reveal delay={0.12} className="h-full">
            <Panel className="space-y-4 p-5 sm:p-6">
              <PanelKicker icon={<Activity className="h-4 w-4" />} label="repulabs analytics" />
              <h3 className="text-xl font-bold leading-snug text-[#0b1220]">
                Watch the volume climb.{" "}
                <span className="font-normal text-[#5b6473]">
                  Requests out, reviews in — trending up every month.
                </span>
              </h3>
              <VolumeChart />
            </Panel>
          </Reveal>

          {/* 4. Feature cards — bottom right */}
          <Reveal delay={0.18} className="h-full">
            <div className="grid h-full gap-5 sm:grid-cols-2">
              <FeatureCard
                icon={<Bot className="h-4 w-4" />}
                title="Autopilot"
                subtitle="Approval gates on every loop."
                description="AI drafts every reply and request — nothing ships without your yes."
                chips={["Draft → approve", "Escalation rules", "Tone controls"]}
                art={<AutopilotArt />}
              />
              <FeatureCard
                icon={<Mail className="h-4 w-4" />}
                title="Weekly digest"
                subtitle="A report your team will read."
                description="Wins, trends and to-dos in one Monday-morning email."
                chips={["Rating trend", "Reply times", "Leaderboard"]}
                art={<DigestArt />}
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default LandingCommandCenter;
