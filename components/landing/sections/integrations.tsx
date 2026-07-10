"use client";

/**
 * LandingIntegrations — "Lives where your business already lives."
 *
 * THE single integrations section for the repulabs marketing home: a badge,
 * gradient headline and subhead over the founder's orbit visual (center
 * repulabs disc + three spinning dotted rings riding the real brand logos),
 * the dual counter-scrolling logo marquee, and a "connections marketplace"
 * callout. (The old 14-card grid and the standalone orbit section were merged
 * here so integrations appear in exactly ONE place.)
 *
 * Animation primitives (all from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for header, orbit, marquee, callout
 *   - ShinyText→ premium sheen sweep across the INTEGRATIONS badge label
 *   - DotGrid  → interactive top-left dot matrix in the section background
 *
 * Brand: light premium — white / very-light-blue surface, blue #2563eb primary,
 * blue→violet gradient accent, Inter ≤700. Real, official brand SVGs live in
 * /public/assets/repulabs/landing/integrations.
 */

import { ArrowRight, Puzzle, Store } from "lucide-react";
import { DotGrid, Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/integrations";

type Integration = {
  name: string;
  /** filename in ART */
  file: string;
  /** brand accent — bottom bar + status colour + disc tint/ring */
  accent: string;
  /** rendered logo edge, px */
  size: number;
};

/* Row 1 then Row 2, exactly as the mockup lays them out. */
const INTEGRATIONS: Integration[] = [
  { name: "Google", file: "google.svg", accent: "#1A73E8", size: 46 },
  { name: "Meta", file: "meta.svg", accent: "#0866FF", size: 52 },
  { name: "Instagram", file: "instagram.svg", accent: "#E1306C", size: 48 },
  { name: "LinkedIn", file: "linkedin.svg", accent: "#0A66C2", size: 46 },
  { name: "X (Twitter)", file: "x.svg", accent: "#0F172A", size: 42 },
  { name: "Stripe", file: "stripe.svg", accent: "#635BFF", size: 46 },
  { name: "Shopify", file: "shopify.svg", accent: "#4F9A2E", size: 46 },
  { name: "HubSpot", file: "hubspot.svg", accent: "#E8541F", size: 44 },
  { name: "Mailchimp", file: "mailchimp.svg", accent: "#C99700", size: 52 },
  { name: "QuickBooks", file: "quickbooks.svg", accent: "#2CA01C", size: 50 },
  { name: "Square", file: "square.svg", accent: "#7A8699", size: 40 },
  { name: "Slack", file: "slack.svg", accent: "#9B197A", size: 46 },
  { name: "Zapier", file: "zapier.svg", accent: "#EA4E00", size: 46 },
  { name: "WhatsApp", file: "whatsapp.svg", accent: "#16A34A", size: 50 },
];

/** 8-digit-hex alpha helper — pale tint / ring / glow from one accent. */
const alpha = (hex: string, a: string) => `${hex}${a}`;

/* ── orbit centerpiece — the founder's FeatureSection orbit (merged in from
      the former standalone orbit section so integrations live in ONE place):
      a center repulabs disc + three spinning dotted rings (12s/18s/24s)
      carrying the brand logos, counter-rotated so logos stay upright. ── */

const ORBIT_ICONS = INTEGRATIONS.slice(0, 12);
const ORBIT_COUNT = 3;
const ORBIT_GAP = 8; // rem between rings — same spacing as the original
const ICONS_PER_ORBIT = Math.ceil(ORBIT_ICONS.length / ORBIT_COUNT);

function OrbitSystem() {
  return (
    <div className="relative flex h-[50rem] w-[50rem] shrink-0 items-center justify-center">
      {/* Center circle — repulabs R logo in a white shadow disc */}
      <div
        className="z-10 flex h-24 w-24 items-center justify-center rounded-full bg-white"
        style={{
          boxShadow:
            "inset 0 0 0 1px rgba(37,99,235,0.14), 0 18px 40px -14px rgba(35,82,255,0.45)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/favicon.png"
          alt="repulabs"
          width={48}
          height={48}
          draggable={false}
          style={{ height: 48, width: 48 }}
        />
      </div>

      {/* dotted rings spinning at 12s / 18s / 24s */}
      {[...Array(ORBIT_COUNT)].map((_, orbitIdx) => {
        const size = `${12 + ORBIT_GAP * (orbitIdx + 1)}rem`;
        const angleStep = (2 * Math.PI) / ICONS_PER_ORBIT;
        const phase = orbitIdx * (angleStep / 3);

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative rings
            key={orbitIdx}
            className="lp-orbit-ring absolute rounded-full border-2 border-dotted border-[#c9d5ec]"
            style={{
              width: size,
              height: size,
              animation: `lp-orbit-spin ${12 + orbitIdx * 6}s linear infinite`,
            }}
          >
            {ORBIT_ICONS.slice(
              orbitIdx * ICONS_PER_ORBIT,
              orbitIdx * ICONS_PER_ORBIT + ICONS_PER_ORBIT,
            ).map((icon, iconIdx) => {
              const angle = iconIdx * angleStep + phase;
              /* fixed precision — long floats trip React's hydration diff */
              const x = +(50 + 50 * Math.cos(angle)).toFixed(3);
              const y = +(50 + 50 * Math.sin(angle)).toFixed(3);

              return (
                <div
                  key={icon.name}
                  className="absolute h-12 w-12"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {/* counter-spin (same duration, reversed) keeps logos upright */}
                  <div
                    className="lp-orbit-ring grid h-full w-full place-items-center rounded-full bg-white"
                    style={{
                      animation: `lp-orbit-spin ${12 + orbitIdx * 6}s linear infinite reverse`,
                      boxShadow:
                        "inset 0 0 0 1px rgba(26,43,95,0.08), 0 10px 22px -10px rgba(26,43,95,0.4)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${ART}/${icon.file}`}
                      alt={`${icon.name} logo`}
                      width={32}
                      height={32}
                      loading="lazy"
                      draggable={false}
                      className="object-contain"
                      style={{ height: 32, width: 32 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ── dual logo marquee — the founder's IntegrationHero carousel, adapted to
      the real brand SVGs. Two rows scroll in opposite directions on the same
      30s linear loop, with edge fades. Items carry their own trailing padding
      (instead of flex gap) so the -50% translate loops seamlessly. ── */

const MARQUEE_ROW_1 = INTEGRATIONS.slice(0, 7);
const MARQUEE_ROW_2 = INTEGRATIONS.slice(7);

const repeated = (row: Integration[], times = 4) =>
  Array.from({ length: times }).flatMap(() => row);

function MarqueeDisc({ item }: { item: Integration }) {
  return (
    <div className="shrink-0 pr-10">
      <div
        className="grid h-16 w-16 place-items-center rounded-full bg-white"
        style={{
          boxShadow: `inset 0 0 0 1px ${alpha(item.accent, "22")}, 0 10px 22px -10px ${alpha(item.accent, "66")}`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ART}/${item.file}`}
          alt=""
          width={34}
          height={34}
          loading="lazy"
          draggable={false}
          style={{ height: 34, width: 34 }}
        />
      </div>
    </div>
  );
}

function LogoMarquee() {
  return (
    <div aria-hidden className="relative mt-12 overflow-hidden pb-1">
      {/* Row 1 — scrolls left */}
      <div className="lp-scroll-left flex w-max items-center">
        {repeated(MARQUEE_ROW_1).map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: repeated decorative loop
          <MarqueeDisc key={`a${i}`} item={item} />
        ))}
      </div>

      {/* Row 2 — scrolls right */}
      <div className="lp-scroll-right mt-6 flex w-max items-center">
        {repeated(MARQUEE_ROW_2).map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: repeated decorative loop
          <MarqueeDisc key={`b${i}`} item={item} />
        ))}
      </div>

      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#f5f8ff] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#f7f9ff] to-transparent" />

      <style>{`
        @keyframes lp-scroll-left { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        @keyframes lp-scroll-right { 0% { transform: translateX(-50%); } 100% { transform: translateX(0); } }
        .lp-scroll-left { animation: lp-scroll-left 30s linear infinite; }
        .lp-scroll-right { animation: lp-scroll-right 30s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .lp-scroll-left, .lp-scroll-right { animation: none; }
        }
      `}</style>
    </div>
  );
}

export function LandingIntegrations() {
  return (
    <section
      id="integrations"
      aria-labelledby="integrations-heading"
      className="relative isolate overflow-hidden py-24 sm:py-28"
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #ffffff 0%, #f4f7ff 45%, #f8faff 100%)",
      }}
    >
      {/* ── decorative background layers (aria-hidden) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* top-left interactive dot matrix, masked to fade out */}
        <div
          className="absolute left-0 top-0 h-[360px] w-[460px]"
          style={{
            WebkitMaskImage: "radial-gradient(100% 100% at 0% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(100% 100% at 0% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="37, 99, 235" spacing={22} />
        </div>

        {/* right-edge contour lines */}
        <svg
          className="absolute right-0 top-16 h-64 w-[340px] opacity-[0.14]"
          viewBox="0 0 340 260"
          fill="none"
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M340 ${20 + i * 22} C 250 ${40 + i * 22}, 220 ${120 + i * 18}, 120 ${150 + i * 20}`}
              stroke="#7c8bff"
              strokeWidth="1.5"
            />
          ))}
        </svg>

        {/* bottom-left wave lines */}
        <svg
          className="absolute bottom-8 left-0 h-40 w-[360px] opacity-[0.16]"
          viewBox="0 0 360 160"
          fill="none"
        >
          {[0, 1, 2, 3].map((i) => (
            <path
              key={i}
              d={`M-10 ${60 + i * 24} C 90 ${20 + i * 24}, 180 ${110 + i * 20}, 340 ${50 + i * 22}`}
              stroke="#8aa0ff"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur"
              style={{ borderColor: "#D9DDF7", background: "rgba(255,255,255,0.65)" }}
            >
              <Puzzle size={18} className="text-[#654DF4]" strokeWidth={2.5} />
              <ShinyText
                text="INTEGRATIONS"
                className="text-[13px] font-bold tracking-[0.16em] text-[#654DF4]"
              />
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="integrations-heading"
              className="mx-auto mt-6 max-w-[16ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-[#0b1220] sm:text-[56px]"
            >
              Lives where your business{" "}
              <span className="bg-gradient-to-r from-[#2563eb] to-[#654df4] bg-clip-text text-transparent">
                already lives.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-[600px] text-[17px] leading-[1.55] text-[#5b6473] sm:text-[19px]">
              Two-click native connections to the review hosts, social channels,
              payment systems and CRMs your reputation depends on.
            </p>
          </Reveal>
        </div>

        {/* ── orbit centerpiece (replaces the old 14-card grid) ── */}
        <Reveal delay={0.1}>
          <div className="relative mx-auto mt-6 h-[380px] w-full max-w-[720px] overflow-hidden sm:h-[440px]">
            <div className="absolute inset-0 flex items-center justify-center">
              <OrbitSystem />
            </div>
            {/* radial edge fade so the ring crop reads intentional */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(closest-side at 50% 50%, transparent 62%, #f6f8ff 96%)",
              }}
            />
          </div>
          <style>{`
            @keyframes lp-orbit-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            @media (prefers-reduced-motion: reduce) {
              .lp-orbit-ring { animation: none !important; }
            }
          `}</style>
        </Reveal>

        {/* ── dual logo marquee (founder's IntegrationHero carousel) ── */}
        <Reveal delay={0.14}>
          <LogoMarquee />
        </Reveal>

        {/* ── marketplace callout ── */}
        <Reveal delay={0.1} className="mt-8">

          <div
            className="mx-auto flex max-w-[1020px] flex-col items-center gap-4 rounded-2xl border px-5 py-4 backdrop-blur sm:flex-row sm:gap-5 sm:px-6"
            style={{
              borderColor: "#DADFF4",
              background: "rgba(255,255,255,0.75)",
              boxShadow: "0 12px 34px -20px rgba(26,43,95,0.18)",
            }}
          >
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-xl"
              style={{ background: "rgba(101,77,244,0.10)", color: "#654DF4" }}
            >
              <Store size={26} strokeWidth={2.2} />
            </span>

            <p className="flex flex-1 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[16px] text-[#677089] sm:justify-start sm:text-left sm:text-[17px]">
              <span>And 30+ more via</span>
              <a
                href="/connections"
                className="group inline-flex items-center gap-1 font-bold text-[#2563eb] underline-offset-4 hover:underline"
              >
                our connections marketplace
                <ArrowRight
                  size={17}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </a>
            </p>

            <span aria-hidden className="hidden h-8 w-px bg-[#D7DFF0] sm:block" />

            <p className="text-center text-[16px] text-[#677089] sm:text-left sm:text-[17px]">
              <span className="font-semibold text-[#654DF4]">Zapier-bridged</span>{" "}
              for anything not yet native.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default LandingIntegrations;
