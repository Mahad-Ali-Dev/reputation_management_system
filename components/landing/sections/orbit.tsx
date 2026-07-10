"use client";

/**
 * LandingOrbit — "Your whole stack, in orbit."
 *
 * Faithful port of the founder's FeatureSection orbit component: a white
 * rounded-3xl card with a left-side heading block and, on the right, a
 * center-cropped orbital system — a center disc with three spinning dotted
 * rings (12s / 18s / 24s CSS keyframe loops) carrying integration logos.
 *
 * Adaptations for repulabs:
 *   - react-icons → real brand SVGs from /assets/repulabs/landing/integrations
 *   - center circle → the repulabs R logo (favicon.png) in a white shadow disc
 *   - styled-jsx keyframes → plain <style> tag (App Router / RSC safe)
 *   - responsive: below lg the orbit drops under the copy, center-cropped
 *
 * Animation primitives (from `@/components/landing/anim`):
 *   - Reveal    → staggered scroll-in for the copy block
 *   - ShinyText → sheen sweep on the eyebrow badge
 *
 * Brand: light premium — white surface, blue #2563eb primary, blue→violet
 * gradient accent, Inter ≤700.
 */

import { ArrowRight, Orbit } from "lucide-react";
import { motion } from "motion/react";
import { Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/integrations";

type OrbitIcon = {
  name: string;
  /** filename in ART */
  file: string;
};

/* 12 riders → 4 per ring, exactly like the original's even slicing. */
const ORBIT_ICONS: OrbitIcon[] = [
  { name: "Google", file: "google.svg" },
  { name: "Meta", file: "meta.svg" },
  { name: "Instagram", file: "instagram.svg" },
  { name: "LinkedIn", file: "linkedin.svg" },
  { name: "X (Twitter)", file: "x.svg" },
  { name: "Stripe", file: "stripe.svg" },
  { name: "Shopify", file: "shopify.svg" },
  { name: "HubSpot", file: "hubspot.svg" },
  { name: "Slack", file: "slack.svg" },
  { name: "Zapier", file: "zapier.svg" },
  { name: "WhatsApp", file: "whatsapp.svg" },
  { name: "Mailchimp", file: "mailchimp.svg" },
];

const ORBIT_COUNT = 3;
const ORBIT_GAP = 8; // rem between rings — same spacing as the original
const ICONS_PER_ORBIT = Math.ceil(ORBIT_ICONS.length / ORBIT_COUNT);

/** The orbital system — center disc + spinning dotted rings with logo riders. */
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

      {/* Generate orbits — dotted rings spinning at 12s / 18s / 24s */}
      {[...Array(ORBIT_COUNT)].map((_, orbitIdx) => {
        const size = `${12 + ORBIT_GAP * (orbitIdx + 1)}rem`; // equal spacing
        const angleStep = (2 * Math.PI) / ICONS_PER_ORBIT;
        /* small per-ring phase offset so rings don't start aligned */
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
              /* fixed precision — long floats get normalised by the browser's
                 style parser and trip React's hydration diff */
              const x = +(50 + 50 * Math.cos(angle)).toFixed(3);
              const y = +(50 + 50 * Math.sin(angle)).toFixed(3);

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

export function LandingOrbit() {
  return (
    <section
      id="orbit"
      aria-labelledby="orbit-heading"
      className="relative py-16 sm:py-20"
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #ffffff 0%, #f4f7ff 45%, #f8faff 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        {/* white card — rounded-3xl border, orbit cropped inside, like the original */}
        <div
          className="relative flex flex-col overflow-hidden rounded-3xl border border-[#e7ecf6] bg-white lg:h-[30rem] lg:flex-row lg:items-center lg:justify-between lg:pl-12"
          style={{ boxShadow: "0 18px 50px -24px rgba(26,43,95,0.22)" }}
        >
          {/* Left side: heading and text */}
          <div className="z-10 px-6 pt-10 text-center sm:px-10 lg:w-1/2 lg:px-0 lg:pt-0 lg:text-left">
            <Reveal>
              <span
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2"
                style={{ borderColor: "#D9DDF7", background: "rgba(255,255,255,0.65)" }}
              >
                <Orbit size={17} className="text-[#2563eb]" strokeWidth={2.5} />
                <ShinyText
                  text="ALWAYS IN SYNC"
                  className="text-[12.5px] font-bold tracking-[0.16em] text-[#2563eb]"
                />
              </span>
            </Reveal>

            <Reveal delay={0.06}>
              <h2
                id="orbit-heading"
                className="mt-5 text-balance text-[34px] font-bold leading-[1.06] tracking-[-0.025em] text-[#0b1220] sm:text-[46px]"
              >
                Your whole stack,{" "}
                <span className="bg-gradient-to-r from-[#2563eb] to-[#654df4] bg-clip-text text-transparent">
                  in orbit.
                </span>
              </h2>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mx-auto mt-4 max-w-lg text-[16px] leading-[1.55] text-[#5b6473] sm:text-[17px] lg:mx-0">
                Every channel and tool you already use feeds the same reputation
                engine — nothing to migrate, nothing to re-learn.
              </p>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <motion.a
                  href="/signup"
                  whileHover={{ y: -1, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-[#2f6bff] to-[#1e40af] px-5 py-2.5 text-[15px] font-bold text-white shadow-[0_12px_26px_-10px_rgba(35,82,255,0.7)]"
                >
                  Start free <ArrowRight size={17} />
                </motion.a>
                <motion.a
                  href="#integrations"
                  whileHover={{ y: -1, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18 }}
                  className="inline-flex items-center rounded-2xl border border-[#dce4f2] bg-white px-5 py-2.5 text-[15px] font-bold text-[#0b1220] shadow-[0_10px_26px_-16px_rgba(49,92,170,0.4)] hover:border-[#c7d4ee]"
                >
                  See integrations
                </motion.a>
              </div>
            </Reveal>
          </div>

          {/* Right side: orbit animation — cropped by the card like the original
              (rings bleed past the card edges; centered band below lg) */}
          <div className="relative mt-6 h-[21rem] w-full overflow-hidden lg:mt-0 lg:h-full lg:w-1/2">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="translate-x-0 lg:translate-x-[8%]">
                <OrbitSystem />
              </div>
            </div>
            {/* soft fade so the crop edge reads intentional */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent lg:hidden"
            />
          </div>
        </div>
      </div>

      {/* Animation keyframes — plain <style>, no styled-jsx */}
      <style>{`
        @keyframes lp-orbit-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lp-orbit-ring { animation: none !important; }
        }
      `}</style>
    </section>
  );
}

export default LandingOrbit;
