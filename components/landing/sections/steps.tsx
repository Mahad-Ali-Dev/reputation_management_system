"use client";

/**
 * LandingSteps — "Three steps. No consultant required." (How it works)
 *
 * The process-explainer section for the repulabs marketing home: eyebrow +
 * gradient headline + subhead, then a single large white "flow" panel holding
 * an animated blue→violet→teal timeline with three numbered steps. Each step is
 * a live product-mockup card (Connect · Automate · Grow) with its title + body
 * beneath.
 *
 * Animation primitives (all from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for the header, each step card and copy
 *   - Float    → gentle idle bob on every product-mockup card (varied delay)
 *   - ShinyText→ premium sheen sweep across the HOW IT WORKS eyebrow label
 *   - DotGrid  → interactive dot matrix in the section background
 * plus a `motion/react` clip-path "draw-in" for the gradient connector line and a
 * spring pop-in for the numbered step circles (synced to the line as it advances).
 *
 * Brand: light premium — white / very-light-blue surface, blue #2563eb → violet
 * #7c3aed → teal #14b8a6 timeline, Inter ≤700. Real product-kit SVGs live in
 * /public/assets/repulabs/landing/steps.
 */

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import {
  ChevronDown,
  Plus,
  Sparkles,
  Star,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { DotGrid, Float, Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/steps";

/* brand accents — one per step, in timeline order */
const BLUE = "#2563eb";
const VIOLET = "#7c3aed";
const TEAL = "#14b8a6";
const INK = "#0b1220";
const MUTED = "#5b6473";
const GREEN = "#16b875";
const AMBER = "#f5a300";

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
      style={{ color, background: `${color}14` }}
    >
      {children}
    </span>
  );
}

function Dropdown({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[#E6EAF2] bg-white px-2 py-[4px] text-[10.5px] font-medium text-[#6b7488]">
      {label}
      <ChevronDown size={11} className="text-[#9aa3b2]" />
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
      className="group/card relative w-full overflow-hidden rounded-[14px] border border-[#EAEEF6] bg-white p-3.5 transition-transform duration-300 ease-out hover:-translate-y-1.5 sm:p-4"
      style={{ boxShadow: "0 16px 38px -20px rgba(26,43,95,0.28)" }}
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
      <span className="text-[12.5px] font-bold tracking-[-0.01em] text-[#0b1220]">
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
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#16b875]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: GREEN }} />
            Connected
          </span>
        }
      />

      <div className="mt-3 space-y-2">
        {SOURCES.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-2.5 rounded-[10px] border border-[#EEF1F7] bg-white px-2.5 py-2"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#EEF1F7] bg-[#FBFCFF]">
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
              <span className="block truncate text-[12px] font-semibold leading-tight text-[#0b1220]">
                {s.name}
              </span>
              <span className="block truncate text-[10.5px] leading-tight text-[#8a94a6]">
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
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-[#D7E1F7] bg-[#F6F9FF] py-2 text-[12px] font-semibold text-[#2563eb]"
      >
        <Plus size={14} strokeWidth={2.6} />
        Add another source
      </button>
    </CardChrome>
  );
}

/* ── Step 2 · Automate — "Review inbox" ───────────────────────────── */

const REVIEWS = [
  { initials: "SR", name: "Sarah J.", time: "2m ago", text: "Great service and friendly team!", tint: BLUE },
  { initials: "NB", name: "Niko B.", time: "15m ago", text: "Quick response and very helpful.", tint: VIOLET },
  { initials: "AN", name: "Anna L.", time: "1h ago", text: "Highly recommend!", tint: TEAL },
];

function ReviewRow({ r }: { r: (typeof REVIEWS)[number] }) {
  return (
    <div className="rounded-[10px] border border-[#EEF1F7] bg-white px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold"
          style={{ background: `${r.tint}16`, color: r.tint }}
        >
          {r.initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[#0b1220]">
          {r.name}
        </span>
        <span className="shrink-0 text-[9.5px] text-[#9aa3b2]">{r.time}</span>
      </div>
      <div className="mt-1.5">
        <Stars size={10} />
      </div>
      <p className="mt-1 truncate text-[10.5px] leading-tight text-[#6b7488]">{r.text}</p>
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
    <div className="flex items-center gap-2 rounded-[10px] border border-[#EEF1F7] bg-white px-2.5 py-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[#EEF1F7] bg-[#FBFCFF]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/${file}`} alt="" aria-hidden width={14} height={14} draggable={false} loading="lazy" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-semibold leading-tight text-[#0b1220]">
          {label}
        </span>
        <span className="block truncate text-[9.5px] leading-tight text-[#9aa3b2]">{sub}</span>
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
            <Pill color={VIOLET}>3 new</Pill>
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
              "repeating-linear-gradient(180deg, #d7ddea 0 4px, transparent 4px 9px)",
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
          <div className="rounded-[10px] border border-[#EAE2FF] bg-[#FBFAFF] px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ART}/ai.svg`} alt="" aria-hidden width={13} height={13} draggable={false} loading="lazy" />
              <span className="text-[10.5px] font-bold" style={{ color: VIOLET }}>
                AI draft reply
              </span>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-[#6b7488]">
              Thank you for the kind words! We appreciate your support.
            </p>
            <div className="mt-1.5 flex items-center gap-1 text-[9px] font-medium text-[#a3abba]">
              <Sparkles size={9} style={{ color: VIOLET }} />
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
    <div className="rounded-[10px] border border-[#EEF1F7] bg-white px-2.5 py-2">
      <div className="truncate text-[9.5px] font-medium text-[#8a94a6]">{label}</div>
      <div className="mt-0.5 text-[17px] font-bold leading-none text-[#0b1220]">{value}</div>
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

function GrowCard() {
  return (
    <CardChrome accent={TEAL}>
      <CardHeader title="Overview" right={<Dropdown label="This week" />} />

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Average rating" value="4.8" delta="0.4" stars />
        <Metric label="New reviews" value="128" delta="18%" />
        <Metric label="Response rate" value="96%" delta="12%" />
      </div>

      <div className="mt-2.5 rounded-[10px] border border-[#EEF1F7] bg-white px-2.5 pt-2 pb-1">
        <div className="text-[10.5px] font-semibold text-[#6b7488]">Reviews over time</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ART}/chart.svg`}
          alt="Reviews over time — an upward trend across the week"
          className="mt-1 h-auto w-full"
          width={2200}
          height={800}
          draggable={false}
          loading="lazy"
        />
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
        <div className="absolute inset-0 rounded-full" style={{ background: LINE_H, opacity: 0.16 }} />
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
      <div className="hidden lg:block lg:h-7" aria-hidden />

      <Reveal delay={index * 0.12} y={20} className="w-full">
        <Float amount={5} duration={5.4 + index * 0.5} delay={index * 0.4}>
          <Mockup />
        </Float>
      </Reveal>

      <Reveal delay={index * 0.12 + 0.08} y={16} className="w-full">
        <h3 className="mt-7 text-center text-[23px] font-bold leading-none tracking-[-0.02em] text-[#0b1220] sm:text-[25px]">
          {step.title}
        </h3>
        <p className="mx-auto mt-3 max-w-[360px] text-center text-[15px] leading-[1.55] text-[#5b6473] sm:text-[16px]">
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
      className="relative isolate overflow-hidden py-24 sm:py-28"
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #ffffff 0%, #f5f8ff 46%, #f8faff 100%)",
      }}
    >
      {/* ── decorative background (aria-hidden) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute right-0 top-0 h-[340px] w-[440px]"
          style={{
            WebkitMaskImage: "radial-gradient(100% 100% at 100% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(100% 100% at 100% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="37, 99, 235" spacing={24} />
        </div>
        {/* soft brand glows */}
        <div
          className="absolute -left-24 top-40 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(37,99,235,0.10), transparent 70%)" }}
        />
        <div
          className="absolute -right-20 bottom-24 h-72 w-72 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(20,184,166,0.10), transparent 70%)" }}
        />
      </div>

      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur"
              style={{ borderColor: "#D4E0FB", background: "rgba(255,255,255,0.7)" }}
            >
              <Workflow size={17} className="text-[#2563eb]" strokeWidth={2.5} />
              <ShinyText
                text="HOW IT WORKS"
                className="text-[13px] font-bold tracking-[0.18em] text-[#2563eb]"
              />
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="how-it-works-heading"
              className="mx-auto mt-6 max-w-[18ch] text-balance text-[38px] font-bold leading-[1.03] tracking-[-0.028em] text-[#0b1220] sm:text-[54px]"
            >
              Three steps. No{" "}
              <span className="bg-gradient-to-r from-[#2563eb] via-[#5b4ff0] to-[#7c3aed] bg-clip-text text-transparent">
                consultant required.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-[1.5] text-[#5b6473] sm:text-[19px]">
              Just your name and website — no engineer, no 40-field setup form.
              Most teams are sending automated requests within six minutes.
            </p>
          </Reveal>
        </div>

        {/* ── flow panel ── */}
        <Reveal delay={0.14} y={26}>
          <div
            className="relative mt-14 rounded-[26px] border border-[#E1E7F3] bg-white p-3 sm:p-5 lg:p-6"
            style={{ boxShadow: "0 18px 46px rgba(35,51,102,0.10)" }}
          >
            <div className="relative overflow-hidden rounded-[20px] border border-[#E7EEFB] px-4 py-7 sm:px-6 lg:px-8 lg:pt-7 lg:pb-9">
              {/* soft lavender glow behind the centre step */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-4 hidden h-[88%] w-[38%] -translate-x-1/2 rounded-[18px] lg:block"
                style={{ background: "radial-gradient(58% 62% at 50% 38%, rgba(124,58,237,0.06), transparent 72%)" }}
              />

              <DesktopTimeline />

              {/* mobile vertical rail behind the stacked circles */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-10 bottom-10 w-[2px] -translate-x-1/2 rounded-full opacity-25 lg:hidden"
                style={{ background: LINE_V }}
              />

              <ol className="relative grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-[#E2E7F0]">
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
