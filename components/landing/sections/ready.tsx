"use client";

/**
 * LandingReady — "Ready to run your reputation like a system?"
 *
 * The closing call-to-action for the repulabs marketing home. The surrounding
 * page is light; this is its one deliberately DARK moment — a single deep-navy
 * card, centered, with a blue glow bleeding in from the top-left corner and a
 * teal glow from the bottom-right, a glowing blue→violet primary CTA and a
 * four-item trust row.
 *
 * Animation primitives (from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up: eyebrow → headline → sub → buttons → trust
 *   - ShinyText→ premium sheen sweep across the eyebrow label
 * A gentle `motion` glow-pulse sits behind the primary button.
 *
 * Brand: dark card on a light page — deep-navy gradient, blue #7aa2ff eyebrow,
 * blue→violet primary, blue/teal/violet trust icons, white text, Inter ≤700.
 */

import { ArrowRight, Lock, ShieldCheck, Star, Zap } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Fragment } from "react";
import { Reveal } from "@/components/landing/anim";

type Trust = { icon: typeof ShieldCheck; color: string; label: string };

/* Trust badges, left→right, matching the mockup's icon colours. */
const TRUST: Trust[] = [
  { icon: ShieldCheck, color: "#60a5fa", label: "No credit card" },
  { icon: Zap, color: "#2dd4bf", label: "Setup in minutes" },
  { icon: Lock, color: "#60a5fa", label: "Secure & private" },
  { icon: Star, color: "#a78bfa", label: "Loved by teams" },
];

/* A few hand-placed sparkle dots scattered across the dark card. */
const SPARKLES = [
  { top: "47%", left: "16%", size: 3, opacity: 0.9 },
  { top: "63%", left: "9%", size: 2, opacity: 0.55 },
  { top: "31%", left: "83%", size: 2, opacity: 0.5 },
  { top: "72%", left: "88%", size: 3, opacity: 0.85 },
  { top: "82%", left: "71%", size: 2, opacity: 0.5 },
];

export function LandingReady() {
  return (
    <section
      id="cta"
      aria-labelledby="cta-heading"
      className="relative isolate overflow-hidden py-16 sm:py-24"
      style={{
        background:
          "radial-gradient(130% 100% at 50% -10%, #ffffff 0%, #f0f5ff 55%, #e9f0fb 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── the one dark card ── */}
        <div
          className="relative overflow-hidden rounded-[28px] px-6 py-16 sm:px-12 sm:py-20"
          style={{
            background: "linear-gradient(135deg, #0b1020 0%, #0e1734 55%, #0a1a2e 100%)",
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.08), 0 40px 90px -45px rgba(11,16,32,0.6)",
          }}
        >
          {/* ── decorative glow / sparkle layer ── */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {/* blue glow — top-left corner */}
            <div
              className="absolute -left-40 -top-44 h-[460px] w-[460px] rounded-full blur-2xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(74,104,255,0.5) 0%, rgba(74,104,255,0.14) 42%, transparent 72%)",
              }}
            />
            {/* teal glow — bottom-right corner */}
            <div
              className="absolute -bottom-44 -right-40 h-[460px] w-[460px] rounded-full blur-2xl"
              style={{
                background:
                  "radial-gradient(circle, rgba(23,201,180,0.42) 0%, rgba(23,201,180,0.12) 42%, transparent 72%)",
              }}
            />
            {/* faint top-center sheen for depth */}
            <div
              className="absolute inset-x-0 top-0 h-40"
              style={{
                background:
                  "radial-gradient(60% 100% at 50% 0%, rgba(120,150,255,0.12), transparent 70%)",
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
                  boxShadow: "0 0 6px 1px rgba(255,255,255,0.75)",
                }}
              />
            ))}
          </div>

          {/* ── content ── */}
          <div className="relative z-10 mx-auto flex max-w-[860px] flex-col items-center text-center">
            <Reveal>
              <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#7aa2ff] sm:text-[13px]">
                ✦ START TONIGHT, SEE REVIEWS THIS WEEK ✦
              </span>
            </Reveal>

            <Reveal delay={0.08}>
              <h2
                id="cta-heading"
                className="mt-6 max-w-[12.5em] text-[34px] font-bold leading-[1.06] tracking-[-0.02em] text-white sm:text-[52px]"
              >
                Ready to run your reputation like a system?
              </h2>
            </Reveal>

            <Reveal delay={0.16}>
              <p
                className="mt-5 max-w-[560px] text-[16px] leading-[1.6] sm:text-[18px]"
                style={{ color: "#aab4cf" }}
              >
                Free for your first location. Connected, automated, and earning
                reviews before your next shift starts.
              </p>
            </Reveal>

            <Reveal delay={0.24}>
              <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
                {/* primary — glowing gradient pill */}
                <div className="relative">
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
                    Start free
                    <ArrowRight
                      size={18}
                      className="transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </Link>
                </div>

                {/* secondary — outline pill */}
                <Link
                  href="/contact"
                  className="inline-flex h-14 items-center justify-center rounded-full border px-8 text-[16px] font-bold text-white transition-colors duration-200 hover:bg-white/10"
                  style={{ borderColor: "rgba(255,255,255,0.35)" }}
                >
                  Book a demo
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.32}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:gap-x-6">
                {TRUST.map((t, i) => {
                  const Icon = t.icon;
                  return (
                    <Fragment key={t.label}>
                      {i > 0 && (
                        <span
                          aria-hidden
                          className="hidden h-4 w-px sm:block"
                          style={{ background: "rgba(255,255,255,0.14)" }}
                        />
                      )}
                      <span className="inline-flex items-center gap-2">
                        <Icon size={18} strokeWidth={2} style={{ color: t.color }} />
                        <span className="text-[15px] font-medium text-white/90">{t.label}</span>
                      </span>
                    </Fragment>
                  );
                })}
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

export default LandingReady;
