"use client";

/**
 * LandingTour — the scroll-driven product tour for the repulabs marketing home.
 *
 * Port of the founder's "parallax scroll Component" (hero section.txt): three
 * alternating full-height panels, each pairing a big title + description with a
 * real product screenshot. The ORIGINAL scroll animations are kept verbatim:
 *   - per-section `useScroll({ target, offset: ["start end", "center start"] })`
 *   - image reveal via clip-path `inset(0 100% 0 0)` → `inset(0 0% 0 0)` + fade
 *   - text translateY drift (-50 → 0) as the panel scrolls through
 *   - the fixed-array hook pattern (hooks mapped over a CONST section array)
 *
 * Dark cinematic restyle — the section sits directly on the page's #070b16
 * canvas (no own background stripe, just a faint radial glow accent). Cyan
 * kicker eyebrows, white titles, #9db0d6 body, and the screenshots live in
 * dark glass frames (white/10 border, deep black drop shadow, a soft glow
 * ring tinted with each panel's accent color).
 */

import { ArrowDown } from "lucide-react";
import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/tour";

/* CONST section array — the hook arrays below map over this, so its length
   must never change at runtime (that is how the original component works). */
const SECTIONS = [
  {
    id: 1,
    kicker: "Reviews",
    accent: "#4a7dff",
    title: "Every review, one inbox",
    description:
      "Google, Facebook and Yelp stream into a single queue the moment they land. AI drafts the reply in your voice — you skim, approve and move on with your day.",
    image: `${ART}/reviews.png`,
    alt: "repulabs Reviews — every platform in one moderated queue",
    reverse: false,
  },
  {
    id: 2,
    kicker: "Phone AI",
    accent: "#a855f7",
    title: "A phone line that sells for you",
    description:
      "The AI receptionist answers 24/7, qualifies the caller, books the appointment and hands off to a human when it matters. No more missed-call revenue leaks.",
    image: `${ART}/phone.png`,
    alt: "repulabs Phone AI — calls answered, qualified and booked",
    reverse: true,
  },
  {
    id: 3,
    kicker: "Analytics",
    accent: "#22d3ee",
    title: "Reports your team will actually read",
    description:
      "Rating trends, QR scans, response rates and sentiment on one auto-refreshed page. The Monday number everyone asks for — without the spreadsheet stitching.",
    image: `${ART}/reports.png`,
    alt: "repulabs Analytics — the whole reputation picture on one page",
    reverse: false,
  },
] as const;

export function LandingTour() {
  /* ── original fixed-array hook pattern — one ref / progress / transform set
        per section, mapped over the CONST array above ── */
  // biome-ignore lint/correctness/useHookAtTopLevel: fixed-length const array — hook order is stable (original component's pattern)
  const sectionRefs = SECTIONS.map(() => useRef<HTMLDivElement>(null));

  const scrollYProgress = SECTIONS.map(
    (_, index) =>
      // biome-ignore lint/correctness/useHookAtTopLevel: fixed-length const array — hook order is stable
      useScroll({
        target: sectionRefs[index],
        offset: ["start end", "center start"],
      }).scrollYProgress,
  );

  const opacityContents = scrollYProgress.map((progress) =>
    // biome-ignore lint/correctness/useHookAtTopLevel: fixed-length const array — hook order is stable
    useTransform(progress, [0, 0.7], [0, 1]),
  );

  const clipProgresses = scrollYProgress.map((progress) =>
    // biome-ignore lint/correctness/useHookAtTopLevel: fixed-length const array — hook order is stable
    useTransform(progress, [0, 0.7], ["inset(0 100% 0 0)", "inset(0 0% 0 0)"]),
  );

  const translateContents = scrollYProgress.map((progress) =>
    // biome-ignore lint/correctness/useHookAtTopLevel: fixed-length const array — hook order is stable
    useTransform(progress, [0, 1], [-50, 0]),
  );

  return (
    <section
      id="tour"
      aria-labelledby="tour-heading"
      className="relative isolate overflow-hidden"
    >
      {/* faint radial glow accent — the only background this section owns.
          Centered well below the section edge so it fades to zero at the
          boundary (no visible seam against the neighbouring sections). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px]"
        style={{
          background:
            "radial-gradient(900px 520px at 80% 380px, rgba(59,90,255,0.10), transparent 70%)",
        }}
      />

      {/* ── compact header (stands in for the original's full-screen intro) ── */}
      <div className="mx-auto w-full max-w-[1200px] px-5 pt-24 text-center sm:px-8 sm:pt-28">
        <Reveal>
          <ShinyText
            text="✦ SEE IT WORKING"
            className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]"
          />
        </Reveal>

        <Reveal delay={0.06}>
          <h2
            id="tour-heading"
            className="mx-auto mt-6 max-w-[18ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.02em] text-white sm:text-[56px]"
          >
            Three screens that{" "}
            <span className="bg-gradient-to-r from-[#4a7dff] via-[#22d3ee] to-[#22d3ee] bg-clip-text text-transparent">
              run your reputation.
            </span>
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.14em] text-[#6b7ba3]">
            SCROLL <ArrowDown size={15} />
          </p>
        </Reveal>
      </div>

      {/* ── the three parallax panels (original structure + animations) ── */}
      <div className="flex flex-col px-6 md:px-0">
        {SECTIONS.map((section, index) => (
          <div
            key={section.id}
            ref={sectionRefs[index]}
            className={cn(
              "flex min-h-screen flex-col items-center justify-center gap-14 py-16 md:flex-row md:gap-24 lg:gap-32",
              section.reverse && "md:flex-row-reverse",
            )}
          >
            {/* text side — the original's translateY drift on both nodes */}
            <motion.div style={{ y: translateContents[index] }} className="max-w-sm">
              <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]">
                ✦ {section.kicker.toUpperCase()}
              </p>
              <div className="mt-3 max-w-sm text-[38px] font-bold leading-[1.06] tracking-[-0.02em] text-white sm:text-[48px]">
                {section.title}
              </div>
              <motion.p
                style={{ y: translateContents[index] }}
                className="mt-14 max-w-sm text-[17px] leading-[1.6] text-[#9db0d6]"
              >
                {section.description}
              </motion.p>
            </motion.div>

            {/* image side — the original clip-path inset reveal + fade */}
            <motion.div
              style={{
                opacity: opacityContents[index],
                clipPath: clipProgresses[index],
              }}
              className="relative"
            >
              {/* soft accent glow, revealed together with the shot */}
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-8 -z-10 rounded-[36px] blur-3xl"
                style={{
                  background: `radial-gradient(60% 60% at 50% 45%, ${section.accent}30 0%, transparent 70%)`,
                }}
              />
              <div
                className="w-[560px] max-w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0d1526]"
                style={{
                  boxShadow: `0 40px 90px -40px rgba(0,0,0,0.8), 0 0 44px -14px ${section.accent}4d`,
                }}
              >
                <div className="aspect-[16/11] w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={section.image}
                    alt={section.alt}
                    loading="lazy"
                    draggable={false}
                    className="h-full w-full object-cover object-top"
                  />
                </div>
              </div>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default LandingTour;
