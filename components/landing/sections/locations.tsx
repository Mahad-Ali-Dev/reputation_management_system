"use client";

/**
 * LandingLocations — "From corner cafes to multi-location groups."
 *
 * The operator-segment section of the repulabs marketing home. It broadens the
 * positioning from a single local shop to multi-location groups with three
 * stacked bands:
 *   1. a dark navy feature ribbon (1-click / One inbox / QR·NFC / Autopilot),
 *   2. three segment testimonial cards (practice owners / front desks / ops leads),
 *   3. a security trust strip (encryption / SOC 2 / no-training).
 *
 * Animation primitives (all from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for header, ribbon, every card + strip item
 *   - Float    → idle bob on the ribbon icon tiles and the line-art building accents
 *   - ShinyText→ premium sheen sweep across the BUILT FOR OPERATORS badge label
 *   - DotGrid  → interactive top-left dot matrix in the section background
 *
 * Brand: light premium — white / very-light-blue surface, blue #2563eb primary,
 * blue→violet gradient headline accent, Inter ≤700 (no faux-bold). Real, official
 * illustration SVGs live in /public/assets/repulabs/landing/locations.
 */

import { Quote, Sparkles } from "lucide-react";
import { DotGrid, Float, Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/locations";

/* ─────────────────────────── data ─────────────────────────── */

type RibbonItem = {
  file: string;
  title: string;
  accent: string;
  body: string;
  /** bright accent tone, legible on the dark ribbon */
  accentColor: string;
  /** solid brand colour for the tile glow + mini accent bar */
  glow: string;
};

const RIBBON: RibbonItem[] = [
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
  /** accent colour: quote mark + persona subtitle + avatar */
  accent: string;
  /** card border tint */
  border: string;
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
    accent: "#2563eb",
    border: "#B7D1FF",
    avatarFrom: "#3b82f6",
    avatarTo: "#2563eb",
  },
  {
    quote:
      "Review follow-ups, reply drafts, and social posts run on autopilot with approval gates, the front desk stays focused on customers, not tabs.",
    initials: "CM",
    persona: "For busy front desks",
    sub: "Cafes, salons & local shops",
    file: "storefront-green.svg",
    accent: "#16b875",
    border: "#B8E8D5",
    avatarFrom: "#22c55e",
    avatarTo: "#16a34a",
  },
  {
    quote:
      "One inbox for every location's reviews, DMs, comments, and calls, with an AI phone line that books, answers, and asks for the review afterward.",
    initials: "OL",
    persona: "For operations leads",
    sub: "Multi-location groups",
    file: "building-orange.svg",
    accent: "#ff7a00",
    border: "#FFD0B0",
    avatarFrom: "#fb923c",
    avatarTo: "#f97316",
  },
];

type SecurityItem = {
  file: string;
  /** pale tile tint */
  tint: string;
  title: string;
  body: string;
};

const SECURITY: SecurityItem[] = [
  {
    file: "shield-blue-icon.svg",
    tint: "#EAF1FF",
    title: "AES-256 at rest, TLS 1.3 in transit",
    body: "Every byte of customer data encrypted by default",
  },
  {
    file: "shield-green-icon.svg",
    tint: "#E7F8EF",
    title: "SOC 2-aligned controls",
    body: "Security program built on SOC 2 objectives. DPA available on request, with GDPR + CCPA addenda.",
  },
  {
    file: "shield-purple-icon.svg",
    tint: "#F1EAFE",
    title: "No model training on your data",
    body: "Your customer data never leaves your tenant. Every AI call uses a no-training agreement.",
  },
];

/* ─────────────────────────── ribbon ─────────────────────────── */

function RibbonColumn({ item, index }: { item: RibbonItem; index: number }) {
  const { file, title, accent, body, accentColor, glow } = item;
  return (
    <Reveal delay={0.12 + index * 0.08} y={16} className="h-full">
      <div className="group relative flex h-full flex-col px-6 py-1 lg:px-7">
        {/* vertical divider + centre dot (desktop only, not before the first) */}
        {index > 0 && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-1/2 hidden h-[128px] w-px -translate-y-1/2 bg-white/15 lg:block"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-1/2 hidden h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300/40 lg:block"
            />
          </>
        )}

        {/* icon tile — the provided SVG already carries its coloured tile; add a soft brand glow + idle bob */}
        <Float amount={5} duration={5.2 + index * 0.4} delay={index * 0.25}>
          <span
            className="grid h-[70px] w-[70px] place-items-center rounded-2xl transition-transform duration-300 ease-out group-hover:scale-[1.05]"
            style={{ boxShadow: `0 14px 30px -10px ${glow}b3, 0 0 0 1px rgba(255,255,255,0.04)` }}
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

        <p className="mt-2 max-w-[16rem] text-[15px] leading-[1.5] text-white/80">{body}</p>

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
  const { quote, initials, persona, sub, file, accent, border, avatarFrom, avatarTo } = item;
  return (
    <Reveal delay={0.1 + index * 0.1} y={22} className="h-full">
      <figure
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border bg-white p-7 transition-all duration-300 ease-out hover:-translate-y-1.5"
        style={{ borderColor: border, boxShadow: "0 18px 44px -26px rgba(20,40,90,0.28)" }}
      >
        <Quote
          aria-hidden
          size={34}
          strokeWidth={0}
          className="mb-3 rotate-180 fill-current"
          style={{ color: accent }}
        />

        <blockquote className="text-[17px] leading-[1.6] text-[#111a33]">{quote}</blockquote>

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
            <span className="text-[15px] font-bold leading-tight text-[#0b1220]">{persona}</span>
            <span className="text-[14px] leading-tight" style={{ color: accent }}>
              {sub}
            </span>
          </span>
        </figcaption>

        {/* line-art building — pale, bottom-right, gentle float */}
        <Float
          className="pointer-events-none absolute -bottom-1 right-2 w-[132px] opacity-70"
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
      className="relative isolate overflow-hidden py-24 sm:py-28"
      style={{
        background: "radial-gradient(120% 90% at 50% -10%, #ffffff 0%, #f4f7ff 45%, #f8faff 100%)",
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
          <DotGrid color="37, 99, 235" spacing={24} />
        </div>

        {/* right-top curved contour lines */}
        <svg className="absolute right-0 top-10 h-72 w-[380px] opacity-[0.12]" viewBox="0 0 380 300" fill="none">
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

      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur"
              style={{ borderColor: "#AFC9FF", background: "rgba(255,255,255,0.7)" }}
            >
              <Sparkles size={18} className="text-[#2563eb]" strokeWidth={2.5} />
              <ShinyText
                text="BUILT FOR OPERATORS"
                className="text-[13px] font-bold tracking-[0.16em] text-[#2563eb]"
              />
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="operators-heading"
              className="mx-auto mt-6 max-w-[18ch] text-balance text-[40px] font-bold leading-[1.05] tracking-[-0.025em] text-[#020A2B] sm:text-[57px]"
            >
              From corner cafes to{" "}
              <span className="bg-gradient-to-r from-[#2563eb] via-[#5b5bf0] to-[#7c3aed] bg-clip-text text-transparent">
                multi-location
              </span>{" "}
              groups.
            </h2>
          </Reveal>
        </div>

        {/* ── dark feature ribbon ── */}
        <Reveal delay={0.08} className="mt-14">
          <div
            className="relative overflow-hidden rounded-[26px] px-3 py-9 sm:px-6"
            style={{
              background: "linear-gradient(105deg, #17336B 0%, #071A45 52%, #050A28 100%)",
              boxShadow: "0 40px 80px -40px rgba(7,26,69,0.7)",
            }}
          >
            {/* thin top highlight */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(120,160,255,0.55), rgba(150,120,255,0.4), transparent)",
              }}
            />
            {/* soft blue glow, top-left */}
            <span
              aria-hidden
              className="pointer-events-none absolute -left-10 -top-16 h-56 w-72 rounded-full opacity-40 blur-3xl"
              style={{ background: "radial-gradient(circle, rgba(37,99,235,0.5), transparent 70%)" }}
            />

            <div className="relative grid grid-cols-1 gap-y-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-0">
              {RIBBON.map((item, i) => (
                <RibbonColumn key={item.title} item={item} index={i} />
              ))}
            </div>
          </div>
        </Reveal>

        {/* ── testimonial cards ── */}
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((item, i) => (
            <TestimonialCard key={item.initials} item={item} index={i} />
          ))}
        </div>

        {/* ── security trust strip ── */}
        <Reveal delay={0.06} className="mt-8">
          <div
            className="grid grid-cols-1 gap-8 rounded-3xl border bg-white/90 p-8 backdrop-blur sm:gap-6 md:grid-cols-3"
            style={{ borderColor: "#D8E5F8", boxShadow: "0 18px 44px -30px rgba(20,40,90,0.22)" }}
          >
            {SECURITY.map((item, i) => (
              <Reveal key={item.title} delay={0.1 + i * 0.08} y={16}>
                <div className="group relative flex items-start gap-4 md:pl-6 md:first:pl-0">
                  {/* divider before items 2 + 3 (desktop) */}
                  {i > 0 && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 hidden h-[76px] w-px -translate-y-1/2 bg-[#E1E9F6] md:block"
                    />
                  )}
                  <span
                    className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-2xl transition-transform duration-300 ease-out group-hover:scale-[1.06]"
                    style={{ background: item.tint }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${ART}/${item.file}`}
                      alt=""
                      aria-hidden
                      width={34}
                      height={34}
                      draggable={false}
                      className="h-[34px] w-[34px]"
                    />
                  </span>
                  <div className="pt-0.5">
                    <h3 className="text-[16px] font-bold leading-snug text-[#0b1220]">{item.title}</h3>
                    <p className="mt-1.5 text-[15px] leading-[1.55] text-[#5F6C8B]">{item.body}</p>
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
