"use client";

/**
 * LandingSteps — "Three steps. No consultant required." (How it works)
 *
 * The process-explainer section for the repulabs marketing home, restyled for
 * the ONE dark cinematic canvas: cyan "✦ HOW IT WORKS" eyebrow + white
 * headline with a blue→violet gradient close, then a single large dark-glass
 * "flow" panel holding an animated blue→violet→cyan timeline with three
 * numbered steps. Each step is a live product-mockup card (Connect · Automate
 * · Grow) re-tinted for dark — inner surfaces #0d1526, hairline white borders,
 * body #9db0d6 — while the small colored elements (accent pills, green checks,
 * amber stars, the mini growth chart) keep their accent colors so they pop.
 *
 * Animation primitives (all from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for the header, each step card and copy
 *   - Float    → gentle idle bob on every product-mockup card (varied delay)
 *   - ShinyText→ premium sheen sweep across the ✦ HOW IT WORKS eyebrow label
 *   - DotGrid  → interactive dot matrix in the section background
 * plus a `motion/react` clip-path "draw-in" for the gradient connector line and a
 * spring pop-in for the numbered step circles (synced to the line as it advances).
 *
 * Brand: repulabs DARK — seamless #070b16 canvas (section transparent, faint
 * radial glow accents only), blue #4a7dff → violet #a855f7 → cyan #22d3ee
 * timeline, Inter ≤700. Source/workflow logos live in
 * /public/assets/repulabs/landing/steps and sit on small light plates so they
 * stay legible on dark.
 */

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { ChevronDown, Plus, Sparkles, Star, TrendingUp } from "lucide-react";
import { DotGrid, Float, Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/steps";

/* brand accents — one per step, in timeline order (brightened for dark) */
const BLUE = "#4a7dff";
const VIOLET = "#a855f7";
const TEAL = "#22d3ee";
const GREEN = "#16b875";
const AMBER = "#f5a300";

/* dark-surface tokens */
const CARD_BG = "#0d1526"; // mini-dashboard inner surface
const TITLE = "#eef2ff"; // card titles (near-white)
const BODY = "#9db0d6"; // body text
const MUTED = "#6b7ba3"; // muted small text

const LINE_H = `linear-gradient(90deg, ${BLUE} 0%, ${VIOLET} 50%, ${TEAL} 100%)`;
const LINE_V = `linear-gradient(180deg, ${BLUE} 0%, ${VIOLET} 50%, ${TEAL} 100%)`;

type StepKey = "connect" | "automate" | "grow";

type Step = {
  n: number;
  key: StepKey;
  title: string;
  body: string;
  color: string;
};

const STEPS: Step[] = [
  {
    n: 1,
    key: "connect",
    title: "Connect",
    color: BLUE,
    body: "Link Google Business, Meta and your booking or POS system in two clicks. We'll pull reviews and learn your brand voice automatically.",
  },
  {
    n: 2,
    key: "automate",
    title: "Automate",
    color: VIOLET,
    body: "Autopilot requests reviews after every visit, drafts replies in your voice and routes unhappy customers to a private channel before they go public.",
  },
  {
    n: 3,
    key: "grow",
    title: "Grow",
    color: TEAL,
    body: "Watch your rating, local rank and booked calls climb — with a weekly report that shows exactly what the system earned you.",
  },
];

/* ── tiny shared bits ─────────────────────────────────────────────── */

/** solid success-green check badge (white tick on green disc). */
function GreenCheck({ size = 20 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full text-white"
      style={{ height: size, width: size, background: GREEN }}
      aria-hidden
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12.5l4.2 4.2L19 7"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** amber 5-star row. */
function Stars({ size = 11 }: { size?: number }) {
  return (
    <div className="flex items-center gap-[1px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} size={size} fill={AMBER} color={AMBER} strokeWidth={0} />
      ))}
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-[3px] text-[10.5px] font-semibold leading-none"
      style={{ color, background: `${color}1f` }}
    >
      {children}
    </span>
  );
}

function Dropdown({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-[4px] text-[10.5px] font-medium"
      style={{ color: BODY }}
    >
      {label}
      <ChevronDown size={11} style={{ color: MUTED }} />
    </span>
  );
}

function CardChrome({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <div
      className="group/card relative w-full overflow-hidden rounded-[14px] border border-white/[0.08] p-3.5 transition-transform duration-300 ease-out hover:-translate-y-1.5 sm:p-4"
      style={{ background: CARD_BG, boxShadow: "0 18px 44px -20px rgba(0,0,0,0.65)" }}
    >
      {/* top accent hairline that widens on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-[2px] rounded-full opacity-0 transition-all duration-300 group-hover/card:inset-x-4 group-hover/card:opacity-100"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      {children}
    </div>
  );
}

function CardHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[12.5px] font-bold tracking-[-0.01em]" style={{ color: TITLE }}>
        {title}
      </span>
      {right}
    </div>
  );
}

/* ── Step 1 · Connect — "Connected sources" ───────────────────────── */

const SOURCES = [
  { file: "google.svg", name: "Google Business Profile", detail: "23 locations", pad: 0 },
  { file: "meta.svg", name: "Meta (Facebook & Instagram)", detail: "2 Facebook Pages · 1 Instagram", pad: 3 },
  { file: "booking.svg", name: "Booking / POS System", detail: "Square", pad: 3 },
];

function ConnectCard() {
  return (
    <CardChrome accent={BLUE}>
      <CardHeader
        title="Connected sources"
        right={
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: GREEN }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
            Connected
          </span>
        }
      />

      <div className="mt-3 space-y-2">
        {SOURCES.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-2.5 rounded-[10px] border border-white/[0.07] bg-white/[0.04] px-2.5 py-2"
          >
            {/* light plate so the source logos (drawn for light UI) stay legible */}
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f4f7ff]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${ART}/${s.file}`}
                alt=""
                aria-hidden
                width={22}
                height={22}
                style={{ height: 22 - s.pad, width: 22 - s.pad }}
                draggable={false}
                loading="lazy"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-[12px] font-semibold leading-tight"
                style={{ color: TITLE }}
              >
                {s.name}
              </span>
              <span className="block truncate text-[10.5px] leading-tight" style={{ color: MUTED }}>
                {s.detail}
              </span>
            </span>
            <GreenCheck size={18} />
          </div>
        ))}
      </div>

      <button
        type="button"
        tabIndex={-1}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] py-2 text-[12px] font-semibold"
        style={{
          border: "1px solid rgba(74,125,255,0.32)",
          background: "rgba(74,125,255,0.10)",
          color: "#8fb0ff",
        }}
      >
        <Plus size={14} strokeWidth={2.6} />
        Add another source
      </button>
    </CardChrome>
  );
}

/* ── Step 2 · Automate — "Review inbox" ───────────────────────────── */

const REVIEWS = [
  { initials: "SR", name: "Sarah J.", time: "2m ago", text: "Great service and friendly team!", tint: "#7ea2ff" },
  { initials: "NB", name: "Niko B.", time: "15m ago", text: "Quick response and very helpful.", tint: "#c084fc" },
  { initials: "AN", name: "Anna L.", time: "1h ago", text: "Highly recommend!", tint: "#5eead4" },
];

function ReviewRow({ r }: { r: (typeof REVIEWS)[number] }) {
  return (
    <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.04] px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold"
          style={{ background: `${r.tint}24`, color: r.tint }}
        >
          {r.initials}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[11.5px] font-semibold"
          style={{ color: TITLE }}
        >
          {r.name}
        </span>
        <span className="shrink-0 text-[9.5px]" style={{ color: MUTED }}>
          {r.time}
        </span>
      </div>
      <div className="mt-1.5">
        <Stars size={10} />
      </div>
      <p className="mt-1 truncate text-[10.5px] leading-tight" style={{ color: BODY }}>
        {r.text}
      </p>
    </div>
  );
}

function WorkflowRow({
  file,
  label,
  sub,
}: {
  file: string;
  label: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-white/[0.07] bg-white/[0.04] px-2.5 py-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#f4f7ff]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/${file}`} alt="" aria-hidden width={14} height={14} draggable={false} loading="lazy" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold leading-tight" style={{ color: TITLE }}>
          {label}
        </span>
        <span className="block truncate text-[9.5px] leading-tight" style={{ color: MUTED }}>
          {sub}
        </span>
      </span>
      <GreenCheck size={17} />
    </div>
  );
}

function AutomateCard() {
  return (
    <CardChrome accent={VIOLET}>
      <CardHeader
        title="Review inbox"
        right={
          <span className="flex items-center gap-1.5">
            <Pill color="#c084fc">3 new</Pill>
            <Dropdown label="All locations" />
          </span>
        }
      />

      <div className="relative mt-3 grid grid-cols-2 gap-2.5">
        {/* thin flow rail between the two columns */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2"
          style={{
            background:
              "repeating-linear-gradient(180deg, rgba(255,255,255,0.14) 0 4px, transparent 4px 9px)",
          }}
        />

        {/* left — incoming reviews */}
        <div className="space-y-2">
          {REVIEWS.map((r) => (
            <ReviewRow key={r.initials} r={r} />
          ))}
        </div>

        {/* right — AI workflow */}
        <div className="space-y-2">
          <div
            className="rounded-[10px] px-2.5 py-2"
            style={{
              border: "1px solid rgba(168,85,247,0.28)",
              background: "rgba(168,85,247,0.10)",
            }}
          >
            <div className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ART}/ai.svg`} alt="" aria-hidden width={13} height={13} draggable={false} loading="lazy" />
              <span className="text-[10.5px] font-bold" style={{ color: "#c084fc" }}>
                AI draft reply
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-snug" style={{ color: BODY }}>
              Thank you for the kind words! We appreciate your support.
            </p>
            <div
              className="mt-1.5 flex items-center gap-1 text-[9px] font-medium"
              style={{ color: MUTED }}
            >
              <Sparkles size={9} style={{ color: "#c084fc" }} />
              Generated in seconds
            </div>
          </div>

          <WorkflowRow file="review-approve.svg" label="Review & approve" sub="Looks great!" />
          <WorkflowRow file="send.svg" label="Reply sent" sub="2m ago" />
        </div>
      </div>
    </CardChrome>
  );
}

/* ── Step 3 · Grow — "Overview" ───────────────────────────────────── */

function Metric({
  label,
  value,
  delta,
  stars,
}: {
  label: string;
  value: string;
  delta: string;
  stars?: boolean;
}) {
  return (
    <div className="rounded-[10px] border border-white/[0.07] bg-white/[0.04] px-2.5 py-2">
      <div className="truncate text-[9.5px] font-medium" style={{ color: MUTED }}>
        {label}
      </div>
      <div className="mt-0.5 text-[17px] font-bold leading-none" style={{ color: TITLE }}>
        {value}
      </div>
      {stars ? (
        <div className="mt-1">
          <Stars size={9} />
        </div>
      ) : null}
      <div
        className="mt-1 flex items-center gap-0.5 text-[9.5px] font-semibold"
        style={{ color: GREEN }}
      >
        <TrendingUp size={10} strokeWidth={2.6} />
        {delta}
      </div>
    </div>
  );
}

/** "Reviews over time" mini-chart, drawn inline and tinted for dark: hairline
 *  grid rgba(255,255,255,0.07), muted axis labels, mint bars + green trend
 *  line keep their accent colors so they pop on #0d1526. */
function GrowChart() {
  const bars: Array<[number, number]> = [
    [70, 15],
    [110, 37],
    [150, 31],
    [190, 37],
    [230, 59],
    [270, 47],
    [310, 50],
    [350, 72],
    [390, 60],
    [430, 59],
    [470, 85],
    [510, 103],
  ];
  const line =
    "M67 137L105 127L141 102L178 113L215 82L251 92L288 101L325 87L361 63L398 73L434 74L471 54L508 54L543 29";
  const dots: Array<[number, number]> = [
    [67, 137],
    [105, 127],
    [141, 102],
    [178, 113],
    [215, 82],
    [251, 92],
    [288, 101],
    [361, 63],
    [434, 74],
    [471, 54],
    [508, 54],
  ];
  const days: Array<[string, number]> = [
    ["Mon", 58],
    ["Tue", 136],
    ["Wed", 212],
    ["Thu", 289],
    ["Fri", 367],
    ["Sat", 442],
    ["Sun", 516],
  ];
  return (
    <svg
      viewBox="0 0 560 190"
      className="mt-1 h-auto w-full"
      role="img"
      aria-label="Reviews over time — an upward trend across the week"
    >
      <defs>
        <linearGradient id="steps-bar-mint" x1="0" y1="60" x2="0" y2="152" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7bdcbb" stopOpacity="0.4" />
          <stop offset="1" stopColor="#7bdcbb" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="steps-line-green" x1="60" y1="60" x2="545" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#12b978" />
          <stop offset="1" stopColor="#0aa66c" />
        </linearGradient>
      </defs>

      {/* baseline + dashed grid — hairline white on dark */}
      <line x1="45" y1="152" x2="545" y2="152" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      {[112, 72, 32].map((y) => (
        <line
          key={y}
          x1="45"
          y1={y}
          x2="545"
          y2={y}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}

      {/* axis labels */}
      {([["0", 156], ["50", 116], ["100", 76], ["150", 36]] as Array<[string, number]>).map(
        ([t, y]) => (
          <text
            key={t}
            x="38"
            y={y}
            textAnchor="end"
            fontSize="11"
            fontWeight="700"
            fill={MUTED}
            fontFamily="inherit"
          >
            {t}
          </text>
        ),
      )}

      {/* mint volume bars */}
      <g fill="url(#steps-bar-mint)">
        {bars.map(([x, h]) => (
          <rect key={x} x={x} y={152 - h} width="18" height={h} rx="2" />
        ))}
      </g>

      {/* green trend line + dots */}
      <path
        d={line}
        fill="none"
        stroke="url(#steps-line-green)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="#10b878">
        {dots.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" />
        ))}
        <circle cx="543" cy="29" r="4.5" fill="#eafff5" stroke="#10b878" strokeWidth="2.5" />
      </g>

      {/* day labels */}
      {days.map(([d, x]) => (
        <text
          key={d}
          x={x}
          y="176"
          fontSize="11.5"
          fontWeight="700"
          fill={MUTED}
          fontFamily="inherit"
        >
          {d}
        </text>
      ))}
    </svg>
  );
}

function GrowCard() {
  return (
    <CardChrome accent={TEAL}>
      <CardHeader title="Overview" right={<Dropdown label="This week" />} />

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Average rating" value="4.8" delta="0.4" stars />
        <Metric label="New reviews" value="128" delta="18%" />
        <Metric label="Response rate" value="96%" delta="12%" />
      </div>

      <div className="mt-2.5 rounded-[10px] border border-white/[0.07] bg-white/[0.04] px-2.5 pt-2 pb-1">
        <div className="text-[10.5px] font-semibold" style={{ color: BODY }}>
          Reviews over time
        </div>
        <GrowChart />
      </div>
    </CardChrome>
  );
}

const MOCKUPS: Record<StepKey, () => React.ReactElement> = {
  connect: ConnectCard,
  automate: AutomateCard,
  grow: GrowCard,
};

/* ── numbered step circle — spring pop-in, self-triggering ────────── */

function StepCircle({
  n,
  color,
  delay = 0,
}: {
  n: number;
  color: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  return (
    <motion.div
      ref={ref}
      className="relative grid h-11 w-11 place-items-center rounded-full text-white"
      style={{
        background: color,
        boxShadow: `0 10px 22px -8px ${color}, 0 0 0 4px ${color}1f, 0 0 0 7px ${color}0d`,
      }}
      initial={{ scale: 0, opacity: 0 }}
      animate={inView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 17, delay }}
    >
      <span className="text-[16px] font-bold leading-none">{n}</span>
    </motion.div>
  );
}

/* ── desktop horizontal timeline (line + 3 circles) ───────────────── */

function DesktopTimeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  return (
    <div ref={ref} className="relative mb-1 hidden lg:block">
      {/* connector track between the centres of circle 1 and circle 3 (16.6% → 83.3%) */}
      <div className="absolute left-[16.666%] right-[16.666%] top-1/2 h-[2px] -translate-y-1/2">
        <div className="absolute inset-0 rounded-full" style={{ background: LINE_H, opacity: 0.22 }} />
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: LINE_H }}
          initial={{ clipPath: "inset(0 100% 0 0)" }}
          animate={inView ? { clipPath: "inset(0 0% 0 0)" } : { clipPath: "inset(0 100% 0 0)" }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
        />
      </div>

      <div className="relative grid grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex justify-center">
            <StepCircle n={s.n} color={s.color} delay={0.2 + i * 0.45} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── one step column (card + title + body); circle inline on mobile ─ */

function StepColumn({ step, index }: { step: Step; index: number }) {
  const Mockup = MOCKUPS[step.key];
  return (
    <li className="relative flex flex-col items-center px-0 lg:px-6 xl:px-9">
      {/* mobile-only numbered circle (desktop shows the top timeline instead) */}
      <div className="mb-5 lg:hidden">
        <StepCircle n={step.n} color={step.color} delay={index * 0.08} />
      </div>

      {/* desktop breathing room beneath the timeline row */}
      <div className="hidden lg:block lg:h-6" aria-hidden />

      <Reveal delay={index * 0.12} y={20} className="w-full">
        <Float amount={5} duration={5.4 + index * 0.5} delay={index * 0.4}>
          <Mockup />
        </Float>
      </Reveal>

      <Reveal delay={index * 0.12 + 0.08} y={16} className="w-full">
        <h3 className="mt-6 text-center text-[23px] font-bold leading-none tracking-[-0.02em] text-white sm:text-[25px]">
          {step.title}
        </h3>
        <p
          className="mx-auto mt-3 max-w-[360px] text-center text-[15px] leading-[1.55] sm:text-[15.5px]"
          style={{ color: BODY }}
        >
          {step.body}
        </p>
      </Reveal>
    </li>
  );
}

/* ── section ──────────────────────────────────────────────────────── */

export function LandingSteps() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="relative isolate overflow-hidden py-20 sm:py-[88px]"
    >
      {/* ── decorative background (aria-hidden) — seamless #070b16 canvas ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 500px at 15% 0%, rgba(59,90,255,0.08), transparent 70%)",
            /* fade the glow in from the top so the section blends seamlessly
               into whatever sits above it (no hard stripe edge) */
            WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 160px)",
            maskImage: "linear-gradient(180deg, transparent 0, #000 160px)",
          }}
        />
        <div
          className="absolute right-0 top-0 h-[340px] w-[440px]"
          style={{
            WebkitMaskImage: "radial-gradient(100% 100% at 100% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(100% 100% at 100% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="90, 130, 255" spacing={24} />
        </div>
        {/* soft brand glows */}
        <div
          className="absolute -right-20 bottom-24 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.07), transparent 70%)" }}
        />
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <ShinyText
              text="✦ HOW IT WORKS"
              className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]"
            />
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="how-it-works-heading"
              className="mx-auto mt-6 max-w-[18ch] text-balance text-[38px] font-bold leading-[1.04] tracking-[-0.02em] text-white sm:text-[54px]"
            >
              Three steps. No{" "}
              <span className="bg-gradient-to-r from-[#6d8bff] to-[#a855f7] bg-clip-text text-transparent">
                consultant required.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-[620px] text-[16.5px] leading-[1.55] text-[#9db0d6] sm:text-[18px]">
              Just your name and website — no engineer, no 40-field setup form.
              Most teams are sending automated requests within six minutes.
            </p>
          </Reveal>
        </div>

        {/* ── flow panel — dark glass ── */}
        <Reveal delay={0.14} y={26}>
          <div
            className="relative mt-11 rounded-[26px] border border-white/[0.09] bg-white/[0.035] p-3 backdrop-blur-sm sm:p-5 lg:p-6"
            style={{ boxShadow: "0 24px 60px -30px rgba(0,0,0,0.7)" }}
          >
            <div className="relative overflow-hidden rounded-[20px] border border-white/[0.07] px-4 py-6 sm:px-6 lg:px-8 lg:pt-6 lg:pb-8">
              {/* soft violet glow behind the centre step */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-4 hidden h-[88%] w-[38%] -translate-x-1/2 rounded-[18px] lg:block"
                style={{ background: "radial-gradient(58% 62% at 50% 38%, rgba(168,85,247,0.08), transparent 72%)" }}
              />

              <DesktopTimeline />

              {/* mobile vertical rail behind the stacked circles */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-10 bottom-10 w-[2px] -translate-x-1/2 rounded-full opacity-25 lg:hidden"
                style={{ background: LINE_V }}
              />

              <ol className="relative grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-white/[0.06]">
                {STEPS.map((step, i) => (
                  <StepColumn key={step.key} step={step} index={i} />
                ))}
              </ol>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default LandingSteps;
