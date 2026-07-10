"use client";

/**
 * LandingIntegrations — "Lives where your business already lives."
 *
 * THE single integrations section for the dark repulabs landing (absorbs the
 * old LandingOrbit — integrations now appear in exactly one place):
 *
 *   1. Header — ✦ INTEGRATIONS eyebrow, white H2 with gradient accent, sub.
 *   2. CENTERPIECE — the founder's orbital system: repulabs mark centered in a
 *      dark-glass disc with three spinning dotted rings (12s/18s/24s CSS
 *      loops) riding the real brand SVGs. Riders counter-rotate on the same
 *      duration (reversed) so logos stay upright. Cropped to a ~420px band
 *      with a radial fade mask so the rings dissolve into the page.
 *   3. Dual counter-scrolling logo marquee — two rows on the same 30s linear
 *      loop, opposite directions. Items carry their own trailing padding
 *      (instead of flex gap) so the -50% translate loops seamlessly.
 *   4. Slim glass callout — connections marketplace + Zapier bridge.
 *
 * Animation primitives (from `@/components/landing/anim`):
 *   - Reveal    → staggered scroll-in fade-up
 *   - ShinyText → sheen sweep across the eyebrow
 *   - DotGrid   → faint interactive dot matrix, masked, top-left
 *
 * Brand: ONE dark cinematic canvas — page bg #070b16, white headings ≤700,
 * body #9db0d6, cyan eyebrow, blue→cyan gradient accent. Real brand SVGs in
 * /public/assets/repulabs/landing/integrations.
 */

import { ArrowRight, Store } from "lucide-react";
import { DotGrid, Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/integrations";

type Integration = {
  name: string;
  /** filename in ART */
  file: string;
  /** brand accent — colored glow behind the disc */
  accent: string;
  /** rendered logo edge in the 76px light-theme disc; scaled down here */
  size: number;
  /** dark-ink logos (X, Square) flip to white on the dark discs */
  invert?: boolean;
};

const INTEGRATIONS: Integration[] = [
  { name: "Google", file: "google.svg", accent: "#1A73E8", size: 46 },
  { name: "Meta", file: "meta.svg", accent: "#0866FF", size: 52 },
  { name: "Instagram", file: "instagram.svg", accent: "#E1306C", size: 48 },
  { name: "LinkedIn", file: "linkedin.svg", accent: "#0A66C2", size: 46 },
  { name: "X (Twitter)", file: "x.svg", accent: "#94A7C9", size: 42, invert: true },
  { name: "Stripe", file: "stripe.svg", accent: "#635BFF", size: 46 },
  { name: "Shopify", file: "shopify.svg", accent: "#4F9A2E", size: 46 },
  { name: "HubSpot", file: "hubspot.svg", accent: "#E8541F", size: 44 },
  { name: "Mailchimp", file: "mailchimp.svg", accent: "#C99700", size: 52 },
  { name: "QuickBooks", file: "quickbooks.svg", accent: "#2CA01C", size: 50 },
  { name: "Square", file: "square.svg", accent: "#7A8699", size: 40, invert: true },
  { name: "Slack", file: "slack.svg", accent: "#9B197A", size: 46 },
  { name: "Zapier", file: "zapier.svg", accent: "#EA4E00", size: 46 },
  { name: "WhatsApp", file: "whatsapp.svg", accent: "#16A34A", size: 50 },
];

/** 8-digit-hex alpha helper — glow / ring tints from one accent. */
const alpha = (hex: string, a: string) => `${hex}${a}`;

/* ────────────────────────── orbit centerpiece ──────────────────────────
   Ported from the founder's FeatureSection orbit (via the old orbit.tsx):
   center disc + three spinning dotted rings carrying 4 logos each, restyled
   for the dark canvas and centered instead of split-card. */

/* 12 riders → 4 per ring, exactly like the original's even slicing. */
const ORBIT_ICONS: Integration[] = INTEGRATIONS.filter(
  (i) => i.name !== "QuickBooks" && i.name !== "Square",
);

const ORBIT_COUNT = 3;
/** ring diameters, px — equal 174px spacing inside the ~620px stage */
const ORBIT_SIZES = [232, 406, 580];
const ICONS_PER_ORBIT = Math.ceil(ORBIT_ICONS.length / ORBIT_COUNT);

function OrbitSystem() {
  return (
    <div className="relative flex h-[620px] w-[620px] shrink-0 items-center justify-center">
      {/* soft blue core glow behind the whole system */}
      <div
        aria-hidden
        className="absolute h-[360px] w-[360px] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(79,70,229,0.28), rgba(34,211,238,0.06) 60%, transparent 75%)",
        }}
      />

      {/* Center disc — dark glass with the repulabs R mark */}
      <div
        className="z-10 flex h-24 w-24 items-center justify-center rounded-full backdrop-blur"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(13,21,38,0.85))",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.16), 0 0 0 8px rgba(255,255,255,0.03), 0 18px 50px -12px rgba(79,70,229,0.65)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/favicon.png"
          alt="repulabs"
          width={48}
          height={48}
          draggable={false}
          className="rounded-xl"
          style={{ height: 48, width: 48, boxShadow: "0 0 0 1px rgba(255,255,255,0.10)" }}
        />
      </div>

      {/* Dotted rings spinning at 12s / 18s / 24s */}
      {ORBIT_SIZES.map((size, orbitIdx) => {
        const angleStep = (2 * Math.PI) / ICONS_PER_ORBIT;
        /* small per-ring phase offset so rings don't start aligned */
        const phase = orbitIdx * (angleStep / 3);

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative rings
            key={orbitIdx}
            className="lp-int-ring absolute rounded-full border-2 border-dotted"
            style={{
              width: size,
              height: size,
              borderColor: "rgba(255,255,255,0.14)",
              animation: `lp-int-spin ${12 + orbitIdx * 6}s linear infinite`,
            }}
          >
            {ORBIT_ICONS.slice(
              orbitIdx * ICONS_PER_ORBIT,
              orbitIdx * ICONS_PER_ORBIT + ICONS_PER_ORBIT,
            ).map((icon, iconIdx) => {
              const angle = iconIdx * angleStep + phase;
              /* fixed precision — long floats get normalised by the browser's
                 style parser and trip React's hydration diff */
              const x = +(50 + 50 * Math.cos(angle)).toFixed(3);
              const y = +(50 + 50 * Math.sin(angle)).toFixed(3);
              const logo = Math.round(icon.size * 0.6);

              return (
                <div
                  key={icon.name}
                  /* explicit box — a shrink-to-fit abspos wrapper collapses to
                     ~0px when left is ≈100% of the ring */
                  className="absolute h-12 w-12"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {/* counter-spin (same duration, reversed) keeps logos upright */}
                  <div
                    className="lp-int-ring grid h-full w-full place-items-center rounded-full"
                    style={{
                      background: "#0d1526",
                      animation: `lp-int-spin ${12 + orbitIdx * 6}s linear infinite reverse`,
                      boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.12), 0 10px 24px -8px ${alpha(icon.accent, "8C")}, 0 0 20px -4px ${alpha(icon.accent, "40")}`,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${ART}/${icon.file}`}
                      alt={`${icon.name} logo`}
                      width={logo}
                      height={logo}
                      loading="lazy"
                      draggable={false}
                      className="object-contain"
                      style={{
                        height: logo,
                        width: logo,
                        filter: icon.invert ? "invert(1)" : undefined,
                      }}
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

/** The orbit stage — centered, cropped to a ~420px band, radial fade mask. */
function OrbitCenterpiece() {
  const mask =
    "radial-gradient(50% 50% at 50% 50%, #000 62%, rgba(0,0,0,0.6) 82%, transparent 99%)";
  return (
    <div
      aria-hidden
      className="relative mx-auto mt-6 h-[420px] w-full max-w-[620px] overflow-hidden sm:mt-8"
      style={{ WebkitMaskImage: mask, maskImage: mask }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <OrbitSystem />
      </div>
    </div>
  );
}

/* ── dual logo marquee — the founder's IntegrationHero carousel on the real
      brand SVGs. Two rows scroll in opposite directions on the same 30s
      linear loop, with edge fades into the page bg. Items carry their own
      trailing padding (instead of flex gap) so the -50% translate loops
      seamlessly. ── */

const MARQUEE_ROW_1 = INTEGRATIONS.slice(0, 7);
const MARQUEE_ROW_2 = INTEGRATIONS.slice(7);

const repeated = (row: Integration[], times = 4) =>
  Array.from({ length: times }).flatMap(() => row);

function MarqueeDisc({ item }: { item: Integration }) {
  return (
    <div className="shrink-0 pr-10">
      <div
        className="grid h-16 w-16 place-items-center rounded-full"
        style={{
          background: "#0d1526",
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.10), 0 10px 24px -10px ${alpha(item.accent, "66")}`,
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
          style={{
            height: 34,
            width: 34,
            filter: item.invert ? "invert(1)" : undefined,
          }}
        />
      </div>
    </div>
  );
}

function LogoMarquee() {
  return (
    <div aria-hidden className="relative mt-10 overflow-hidden pb-1">
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

      {/* edge fades into the page canvas */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#070b16] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#070b16] to-transparent" />

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
    >
      {/* ── decorative background — faint glow + masked dot matrix (one canvas,
             no stripe: the page bg #070b16 shows through) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 500px at 50% 12%, rgba(59,90,255,0.10), transparent 70%)",
          }}
        />
        <div
          className="absolute left-0 top-0 h-[340px] w-[440px]"
          style={{
            WebkitMaskImage: "radial-gradient(100% 100% at 0% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(100% 100% at 0% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="90, 130, 255" spacing={24} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <ShinyText
              text="✦ INTEGRATIONS"
              className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]"
            />
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="integrations-heading"
              className="mx-auto mt-5 max-w-[16ch] text-balance text-[40px] font-bold leading-[1.05] tracking-[-0.02em] text-white sm:text-[54px]"
            >
              Lives where your business{" "}
              <span className="bg-gradient-to-r from-[#4a7dff] via-[#22d3ee] to-[#22d3ee] bg-clip-text text-transparent">
                already lives.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-[600px] text-[17px] leading-[1.55] text-[#9db0d6] sm:text-[18px]">
              Two-click native connections to the review hosts, social channels,
              payment systems and CRMs your reputation depends on.
            </p>
          </Reveal>
        </div>

        {/* ── centerpiece: the stack in orbit ── */}
        <Reveal delay={0.1}>
          <OrbitCenterpiece />
        </Reveal>

        {/* ── dual counter-scrolling logo marquee ── */}
        <Reveal delay={0.08}>
          <LogoMarquee />
        </Reveal>

        {/* ── slim glass marketplace callout ── */}
        <Reveal delay={0.1} className="mt-10">
          <div
            className="mx-auto flex max-w-[980px] flex-col items-center gap-4 rounded-2xl px-5 py-4 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 sm:flex-row sm:gap-5 sm:px-6"
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.09)",
            }}
          >
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
              style={{
                background: "rgba(168,85,247,0.12)",
                color: "#c084fc",
                boxShadow: "inset 0 0 0 1px rgba(168,85,247,0.25)",
              }}
            >
              <Store size={24} strokeWidth={2.2} />
            </span>

            <p className="flex flex-1 flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-[15.5px] text-[#9db0d6] sm:justify-start sm:text-left sm:text-[16.5px]">
              <span>And 30+ more via</span>
              <a
                href="/connections"
                className="group inline-flex items-center gap-1 font-bold text-[#6d8bff] underline-offset-4 hover:text-[#8ba4ff] hover:underline"
              >
                our connections marketplace
                <ArrowRight
                  size={17}
                  className="transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </a>
            </p>

            <span aria-hidden className="hidden h-8 w-px bg-white/10 sm:block" />

            <p className="text-center text-[15.5px] text-[#9db0d6] sm:text-left sm:text-[16.5px]">
              <span className="font-semibold text-[#a855f7]">Zapier-bridged</span>{" "}
              for anything not yet native.
            </p>
          </div>
        </Reveal>
      </div>

      {/* Orbit keyframes — plain <style>, no styled-jsx */}
      <style>{`
        @keyframes lp-int-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-int-ring { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

export default LandingIntegrations;
