"use client";

/**
 * LandingLocations — "From corner cafes to multi-location groups."
 *
 * The operator-segment section of the repulabs marketing home, restyled for the
 * ONE dark cinematic canvas (#070b16). Three compressed bands:
 *   1. a transparent-glass 4-column feature bar (1-click / One inbox / QR·NFC / Autopilot),
 *   2. three segment persona cards as dark glass with colored left accents,
 *   3. one slim glass security trust row (encryption / SOC 2 / no-training).
 *
 * Animation primitives (all from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for header, bar, every card + strip item
 *   - Float    → idle bob on the feature icon tiles and the line-art building accents
 *   - ShinyText→ premium sheen sweep across the BUILT FOR OPERATORS eyebrow
 *   - DotGrid  → interactive top-left dot matrix in the section background
 *
 * Brand: dark canvas #070b16, white headings (≤700), gradient accent span,
 * body #9db0d6, glass cards rgba(255,255,255,0.035) with white/9 borders.
 * Real, official illustration SVGs live in /public/assets/repulabs/landing/locations.
 */

import { Quote } from "lucide-react";
import { DotGrid, Float, Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/locations";

/* ─────────────────────────── data ─────────────────────────── */

type BarItem = {
  file: string;
  title: string;
  accent: string;
  body: string;
  /** bright accent tone, legible on the dark canvas */
  accentColor: string;
  /** solid brand colour for the tile glow + mini accent bar */
  glow: string;
};

const BAR: BarItem[] = [
  {
    file: "lightning-icon.svg",
    title: "1-click",
    accent: "AI review replies",
    body: "Drafted in your brand voice",
    accentColor: "#5b9dff",
    glow: "#2563eb",
  },
  {
    file: "inbox-icon.svg",
    title: "One inbox",
    accent: "Every channel together",
    body: "Reviews, DMs, comments, SMS, chat",
    accentColor: "#a78bfa",
    glow: "#7c3aed",
  },
  {
    file: "qrcode-icon.svg",
    title: "QR · NFC",
    accent: "Capture at the counter",
    body: "Plus an AI phone line",
    accentColor: "#34d8a0",
    glow: "#16a34a",
  },
  {
    file: "robot-icon.svg",
    title: "Autopilot",
    accent: "Owner-safe automation",
    body: "Approval gates on every loop",
    accentColor: "#ffa552",
    glow: "#f97316",
  },
];

type Testimonial = {
  quote: string;
  initials: string;
  persona: string;
  sub: string;
  file: string;
  /** bright accent colour: quote mark + persona subtitle + left accent bar */
  accent: string;
  /** avatar gradient stops */
  avatarFrom: string;
  avatarTo: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Every patient leaves with a QR tap or a follow-up text. Five-star visits become public Google reviews; concerns route to the front desk privately.",
    initials: "DS",
    persona: "For practice owners",
    sub: "Dental & medical clinics",
    file: "building-blue.svg",
    accent: "#5b9dff",
    avatarFrom: "#3b82f6",
    avatarTo: "#2563eb",
  },
  {
    quote:
      "Review follow-ups, reply drafts, and social posts run on autopilot with approval gates — the front desk stays focused on customers, not tabs.",
    initials: "CM",
    persona: "For busy front desks",
    sub: "Cafes, salons & local shops",
    file: "storefront-green.svg",
    accent: "#34d8a0",
    avatarFrom: "#22c55e",
    avatarTo: "#16a34a",
  },
  {
    quote:
      "One inbox for every location's reviews, DMs, comments, and calls — with an AI phone line that books, answers, and asks for the review afterward.",
    initials: "OL",
    persona: "For operations leads",
    sub: "Multi-location groups",
    file: "building-orange.svg",
    accent: "#ffa552",
    avatarFrom: "#fb923c",
    avatarTo: "#f97316",
  },
];

type SecurityItem = {
  file: string;
  /** dark tile tint */
  tint: string;
  title: string;
  body: string;
};

const SECURITY: SecurityItem[] = [
  {
    file: "shield-blue-icon.svg",
    tint: "rgba(59, 130, 246, 0.14)",
    title: "AES-256 at rest, TLS 1.3 in transit",
    body: "Every byte of customer data encrypted by default",
  },
  {
    file: "shield-green-icon.svg",
    tint: "rgba(34, 197, 94, 0.13)",
    title: "SOC 2-aligned controls",
    body: "Security program built on SOC 2 objectives. DPA available on request, with GDPR + CCPA addenda.",
  },
  {
    file: "shield-purple-icon.svg",
    tint: "rgba(139, 92, 246, 0.15)",
    title: "No model training on your data",
    body: "Your customer data never leaves your tenant. Every AI call uses a no-training agreement.",
  },
];

/* ─────────────────────────── feature bar ─────────────────────────── */

function BarColumn({ item, index }: { item: BarItem; index: number }) {
  const { file, title, accent, body, accentColor, glow } = item;
  return (
    <Reveal delay={0.12 + index * 0.08} y={16} className="h-full">
      <div className="group relative flex h-full flex-col px-6 py-1 lg:px-7">
        {/* vertical divider + centre dot (desktop only, not before the first) */}
        {index > 0 && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-1/2 hidden h-[128px] w-px -translate-y-1/2 bg-white/10 lg:block"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-1/2 hidden h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20 lg:block"
            />
          </>
        )}

        {/* icon tile — the provided SVG already carries its coloured tile; add a soft brand glow + idle bob */}
        <Float amount={5} duration={5.2 + index * 0.4} delay={index * 0.25}>
          <span
            className="grid h-[70px] w-[70px] place-items-center rounded-2xl transition-transform duration-300 ease-out group-hover:scale-[1.05]"
            style={{ boxShadow: `0 14px 30px -10px ${glow}b3, 0 0 0 1px rgba(255,255,255,0.05)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ART}/${file}`}
              alt=""
              aria-hidden
              width={70}
              height={70}
              draggable={false}
              className="h-[70px] w-[70px] rounded-2xl"
            />
          </span>
        </Float>

        <h3 className="mt-5 text-[27px] font-bold leading-none tracking-[-0.01em] text-white">
          {title}
        </h3>

        <div className="mt-2.5 text-[15px] font-semibold leading-tight" style={{ color: accentColor }}>
          {accent}
        </div>

        <p className="mt-2 max-w-[16rem] text-[15px] leading-[1.5] text-[#9db0d6]">{body}</p>

        {/* coloured mini accent bar — widens on hover */}
        <span
          aria-hidden
          className="mt-4 h-1 w-9 rounded-full transition-all duration-300 ease-out group-hover:w-14"
          style={{ background: accentColor }}
        />
      </div>
    </Reveal>
  );
}

/* ─────────────────────────── testimonial ─────────────────────────── */

function TestimonialCard({ item, index }: { item: Testimonial; index: number }) {
  const { quote, initials, persona, sub, file, accent, avatarFrom, avatarTo } = item;
  return (
    <Reveal delay={0.1 + index * 0.1} y={22} className="h-full">
      <figure
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl p-7 pl-8 transition-all duration-300 ease-out hover:-translate-y-1.5"
        style={{
          background: "rgba(255,255,255,0.035)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 24px 60px -40px rgba(0,0,0,0.6)",
        }}
      >
        {/* coloured left accent bar — the pop of colour on the dark glass */}
        <span
          aria-hidden
          className="absolute left-0 top-7 bottom-7 w-[3px] rounded-full"
          style={{ background: accent, boxShadow: `0 0 14px 0 ${accent}66` }}
        />

        <Quote
          aria-hidden
          size={34}
          strokeWidth={0}
          className="mb-3 rotate-180 fill-current"
          style={{ color: accent }}
        />

        <blockquote className="text-[17px] leading-[1.6] text-[#cdd8f2]">{quote}</blockquote>

        <hr className="my-6 h-px w-[60%] border-0" style={{ background: `${accent}33` }} />

        <figcaption className="mt-auto flex items-center gap-3.5">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-[15px] font-bold text-white"
            style={{
              background: `linear-gradient(135deg, ${avatarFrom}, ${avatarTo})`,
              boxShadow: `0 8px 18px -8px ${avatarTo}cc`,
            }}
          >
            {initials}
          </span>
          <span className="flex flex-col">
            <span className="text-[15px] font-bold leading-tight text-white">{persona}</span>
            <span className="text-[14px] leading-tight" style={{ color: accent }}>
              {sub}
            </span>
          </span>
        </figcaption>

        {/* line-art building — faint, bottom-right, gentle float */}
        <Float
          className="pointer-events-none absolute -bottom-1 right-2 w-[132px] opacity-30"
          amount={5}
          duration={6.5 + index * 0.6}
          delay={index * 0.4}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/${file}`}
            alt=""
            aria-hidden
            width={132}
            height={103}
            draggable={false}
            className="h-auto w-[132px]"
          />
        </Float>
      </figure>
    </Reveal>
  );
}

/* ─────────────────────────── section ─────────────────────────── */

export function LandingLocations() {
  return (
    <section
      id="operators"
      aria-labelledby="operators-heading"
      className="relative isolate overflow-hidden py-16 sm:py-20"
      style={{
        background:
          "radial-gradient(900px 500px at 80% 0%, rgba(59,90,255,0.10), transparent 70%), #070b16",
      }}
    >
      {/* ── decorative background layers (aria-hidden) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-0 top-0 h-[340px] w-[440px]"
          style={{
            WebkitMaskImage: "radial-gradient(100% 100% at 0% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(100% 100% at 0% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="90, 130, 255" spacing={24} />
        </div>

        {/* right-top curved contour lines */}
        <svg className="absolute right-0 top-10 h-72 w-[380px] opacity-[0.10]" viewBox="0 0 380 300" fill="none">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <path
              key={i}
              d={`M380 ${10 + i * 24} C 280 ${34 + i * 24}, 250 ${130 + i * 18}, 130 ${168 + i * 20}`}
              stroke="#7c8bff"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <ShinyText
              text="✦ BUILT FOR OPERATORS"
              className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]"
            />
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="operators-heading"
              className="mx-auto mt-5 max-w-[18ch] text-balance text-[40px] font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-[54px]"
            >
              From corner cafes to{" "}
              <span className="bg-gradient-to-r from-[#6d8bff] to-[#a855f7] bg-clip-text text-transparent">
                multi-location
              </span>{" "}
              groups.
            </h2>
          </Reveal>
        </div>

        {/* ── transparent-glass feature bar ── */}
        <Reveal delay={0.08} className="mt-10">
          <div
            className="relative overflow-hidden rounded-[26px] px-3 py-8 sm:px-6"
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            {/* thin top highlight */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(120,160,255,0.45), rgba(150,120,255,0.3), transparent)",
              }}
            />
            {/* soft blue glow, top-left */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-10 -top-16 h-56 w-72 rounded-full opacity-25 blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(59,90,255,0.5), transparent 70%)" }}
            />

            <div className="relative grid grid-cols-1 gap-y-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
              {BAR.map((item, i) => (
                <BarColumn key={item.title} item={item} index={i} />
              ))}
            </div>
          </div>
        </Reveal>

        {/* ── testimonial cards ── */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((item, i) => (
            <TestimonialCard key={item.initials} item={item} index={i} />
          ))}
        </div>

        {/* ── security trust strip — one slim glass row ── */}
        <Reveal delay={0.06} className="mt-6">
          <div
            className="grid grid-cols-1 gap-7 rounded-3xl p-6 sm:gap-5 sm:p-7 md:grid-cols-3"
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            {SECURITY.map((item, i) => (
              <Reveal key={item.title} delay={0.1 + i * 0.08} y={16}>
                <div className="group relative flex items-start gap-4 md:pl-6 md:first:pl-0">
                  {/* divider before items 2 + 3 (desktop) */}
                  {i > 0 && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 hidden h-[68px] w-px -translate-y-1/2 bg-white/10 md:block"
                    />
                  )}
                  <span
                    className="grid h-[56px] w-[56px] shrink-0 place-items-center rounded-2xl transition-transform duration-300 ease-out group-hover:scale-[1.06]"
                    style={{ background: item.tint, border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${ART}/${item.file}`}
                      alt=""
                      aria-hidden
                      width={30}
                      height={30}
                      draggable={false}
                      className="h-[30px] w-[30px]"
                    />
                  </span>
                  <div className="pt-0.5">
                    <h3 className="text-[15.5px] font-bold leading-snug text-white">{item.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-[1.55] text-[#9db0d6]">{item.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default LandingLocations;
