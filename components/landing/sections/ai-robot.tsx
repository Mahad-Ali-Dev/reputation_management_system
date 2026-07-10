"use client";

/**
 * LandingAiRobot — "Meet the receptionist that never sleeps."
 *
 * The AI-receptionist showcase for the repulabs marketing home: the founder's
 * react-three-fiber RobotHero scene (blinking eyes, cyan glass face-dome,
 * antenna ears, pointer-follow head, click → heart-eyes) ported into a dark
 * full-bleed section — the page's second deliberately dark moment alongside
 * the closing CTA card (ready.tsx shares the same deep-navy treatment).
 *
 * Left column: eyebrow → headline → sub → glowing gradient CTA → 3 stat chips,
 * all staggered in with `Reveal`. Right column: the 3D robot in a ~560px
 * stage. The three.js chunk is loaded via next/dynamic({ ssr: false }) so it
 * never blocks SSR or the main bundle — a dark pulsing placeholder holds the
 * stage until the Canvas mounts. Scene lives in ./ai-robot-scene.tsx.
 *
 * Brand: dark section on a light page — deep-navy gradient, cyan #22d3ee
 * eyebrow/accents, blue→cyan gradient headline turn, blue→violet glowing CTA,
 * white text, Inter ≤700.
 */

import { ArrowRight, CalendarCheck, PhoneCall, Star } from "lucide-react";
import { motion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { DotPattern, Reveal, ShinyText } from "@/components/landing/anim";

/* ── lazy three.js chunk — dark placeholder while the Canvas loads ── */
const RobotScene = dynamic(() => import("./ai-robot-scene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center">
      <motion.span
        aria-hidden
        className="h-40 w-40 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(34,211,238,0.35) 0%, rgba(74,104,255,0.18) 55%, transparent 75%)",
        }}
        animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.9, 1.05, 0.9] }}
        transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      />
    </div>
  ),
});

type Stat = { icon: typeof PhoneCall; label: string };

/* Three proof chips under the CTA. */
const STATS: Stat[] = [
  { icon: PhoneCall, label: "24/7 — never misses a call" },
  { icon: CalendarCheck, label: "Books & reschedules" },
  { icon: Star, label: "Asks for the review" },
];

/* Hand-placed sparkle dots, same treatment as the closing CTA card. */
const SPARKLES = [
  { top: "18%", left: "12%", size: 2, opacity: 0.55 },
  { top: "68%", left: "6%", size: 3, opacity: 0.85 },
  { top: "24%", left: "56%", size: 2, opacity: 0.5 },
  { top: "12%", left: "88%", size: 3, opacity: 0.9 },
  { top: "78%", left: "93%", size: 2, opacity: 0.6 },
  { top: "88%", left: "46%", size: 2, opacity: 0.5 },
];

export function LandingAiRobot() {
  return (
    <section
      id="ai"
      aria-labelledby="ai-heading"
      className="relative isolate overflow-hidden py-20 sm:py-28"
      style={{
        background: "linear-gradient(135deg, #0b1020 0%, #0e1734 55%, #0a1a2e 100%)",
      }}
    >
      {/* ── decorative glow / sparkle layer ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        {/* faint dot matrix, masked to the top-right */}
        <DotPattern
          width={22}
          height={22}
          cr={0.9}
          className="fill-white/[0.06] [mask-image:radial-gradient(520px_300px_at_82%_10%,#000,transparent)] [-webkit-mask-image:radial-gradient(520px_300px_at_82%_10%,#000,transparent)]"
        />
        {/* blue glow — top-left */}
        <div
          className="absolute -left-44 -top-48 h-[520px] w-[520px] rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(74,104,255,0.42) 0%, rgba(74,104,255,0.12) 42%, transparent 72%)",
          }}
        />
        {/* cyan glow — bottom-right, behind the robot stage */}
        <div
          className="absolute -bottom-40 -right-36 h-[560px] w-[560px] rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(34,211,238,0.30) 0%, rgba(34,211,238,0.09) 45%, transparent 72%)",
          }}
        />
        {/* faint top-center sheen for depth */}
        <div
          className="absolute inset-x-0 top-0 h-44"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, rgba(120,150,255,0.10), transparent 70%)",
          }}
        />
        {/* sparkle dots */}
        {SPARKLES.map((s) => (
          <span
            key={`${s.top}-${s.left}`}
            className="absolute rounded-full bg-white"
            style={{
              top: s.top,
              left: s.left,
              height: s.size,
              width: s.size,
              opacity: s.opacity,
              boxShadow: "0 0 6px 1px rgba(255,255,255,0.7)",
            }}
          />
        ))}
      </div>

      <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-8">
        {/* ── left — copy ── */}
        <div className="max-w-[540px]">
          <Reveal>
            <ShinyText
              text="✦ AI RECEPTIONIST"
              className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee] sm:text-[13px]"
            />
          </Reveal>

          <Reveal delay={0.08}>
            <h2
              id="ai-heading"
              className="mt-6 text-balance text-[36px] font-bold leading-[1.06] tracking-[-0.02em] text-white sm:text-[52px]"
            >
              Meet the receptionist that{" "}
              <span className="bg-gradient-to-r from-[#4a68ff] to-[#22d3ee] bg-clip-text text-transparent">
                never sleeps.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.16}>
            <p
              className="mt-5 max-w-[480px] text-[16px] leading-[1.6] sm:text-[18px]"
              style={{ color: "#aab4cf" }}
            >
              Every missed call is a missed review. Your repulabs AI phone line
              answers instantly, books and reschedules appointments, follows up
              after the visit — and turns happy callers into five-star
              reviewers.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-9">
              {/* glowing gradient pill CTA — same treatment as the closing CTA */}
              <div className="relative inline-block">
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute -inset-1 rounded-full blur-lg"
                  style={{ background: "linear-gradient(90deg, #4f46e5, #7c3aed)" }}
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{
                    duration: 2.8,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }}
                />
                <Link
                  href="/signup"
                  className="group relative inline-flex h-14 items-center justify-center gap-2 rounded-full px-8 text-[16px] font-bold text-white transition-transform duration-200 hover:-translate-y-0.5"
                  style={{
                    background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
                    boxShadow: "0 12px 40px -6px rgba(99,102,241,0.7)",
                  }}
                >
                  Hear it in action
                  <ArrowRight
                    size={18}
                    className="transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.32}>
            <div className="mt-9 flex flex-wrap items-center gap-2.5">
              {STATS.map((s) => {
                const Icon = s.icon;
                return (
                  <span
                    key={s.label}
                    className="inline-flex items-center gap-2 rounded-full border px-4 py-2"
                    style={{
                      borderColor: "rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                    }}
                  >
                    <Icon size={15} strokeWidth={2.2} className="text-[#22d3ee]" />
                    <span className="text-[13.5px] font-semibold text-white/85">{s.label}</span>
                  </span>
                );
              })}
            </div>
          </Reveal>
        </div>

        {/* ── right — the 3D robot stage ── */}
        <Reveal delay={0.12} y={28}>
          <div className="relative h-[420px] sm:h-[560px]">
            {/* floor glow grounding the robot on the dark card */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-[12%] bottom-[6%] h-[38%] blur-2xl"
              style={{
                background:
                  "radial-gradient(50% 60% at 50% 70%, rgba(34,211,238,0.22) 0%, rgba(74,104,255,0.14) 45%, transparent 75%)",
              }}
            />
            <div className="absolute inset-0">
              <RobotScene />
            </div>
          </div>
          <p className="mt-2 text-center text-[13px] font-medium text-white/40">
            He follows your cursor. Go on — give him a click.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export default LandingAiRobot;
