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
 * Restyled from the original dark theme to the repulabs LIGHT brand: ink type,
 * muted #5b6473 body copy, screenshots framed in rounded-2xl light borders with
 * a soft blue-tinted shadow — and bigger than the original's `size-80` (fluid
 * `w-[560px] max-w-full` cards showing the real app).
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
    accent: "#2563eb",
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
    accent: "#7c3aed",
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
    accent: "#0891b2",
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
      style={{
        background:
          "radial-gradient(130% 80% at 50% 0%, #ffffff 0%, #f2f6ff 55%, #f8faff 100%)",
      }}
    >
      {/* ── compact header (stands in for the original's full-screen intro) ── */}
      <div className="mx-auto w-full max-w-[1200px] px-5 pt-24 text-center sm:px-8 sm:pt-28">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur"
            style={{ borderColor: "#D9DDF7", background: "rgba(255,255,255,0.65)" }}
          >
            <ShinyText
              text="✦ SEE IT IN ACTION"
              className="text-[13px] font-bold tracking-[0.16em] text-[#2563eb]"
            />
          </span>
        </Reveal>

        <Reveal delay={0.06}>
          <h2
            id="tour-heading"
            className="mx-auto mt-6 max-w-[18ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-[#0b1220] sm:text-[56px]"
          >
            Three screens that{" "}
            <span className="bg-gradient-to-r from-[#2563eb] to-[#7c3aed] bg-clip-text text-transparent">
              run your reputation.
            </span>
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-semibold tracking-[0.14em] text-[#5b6473]">
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
              <p
                className="text-[13px] font-bold tracking-[0.18em]"
                style={{ color: section.accent }}
              >
                {section.kicker.toUpperCase()}
              </p>
              <div className="mt-3 max-w-sm text-[38px] font-bold leading-[1.06] tracking-[-0.02em] text-[#0b1220] sm:text-[48px]">
                {section.title}
              </div>
              <motion.p
                style={{ y: translateContents[index] }}
                className="mt-14 max-w-sm text-[17px] leading-[1.6] text-[#5b6473]"
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
                className="pointer-events-none absolute -inset-6 -z-10 rounded-[32px] blur-2xl"
                style={{
                  background: `radial-gradient(60% 60% at 50% 45%, ${section.accent}2e 0%, transparent 70%)`,
                }}
              />
              <div
                className="w-[560px] max-w-full overflow-hidden rounded-2xl border border-[#E1E6F0] bg-white"
                style={{ boxShadow: "0 34px 70px -34px rgba(26,43,95,0.38)" }}
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
