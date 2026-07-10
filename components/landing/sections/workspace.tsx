"use client";

/**
 * LandingWorkspace — "One workspace for your whole reputation."
 *
 * The platform-overview section for the repulabs marketing home, restyled for
 * the ONE dark cinematic canvas: a cyan "✦ THE PLATFORM" eyebrow, a two-line
 * white headline whose closing word rides a blue→violet gradient, a supporting
 * subhead and a 3×2 grid of six dark glass cards. Each card floats a WHITE
 * illustration plate (the six workspace SVGs were drawn for white surfaces, so
 * they sit on a #f4f7ff frame like matted artwork) with a colour-coded icon
 * tile, then a bold two-line title and a single-line pitch.
 *
 * Animation primitives (all from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for the header + every card
 *   - ShinyText→ premium sheen sweep across the ✦ THE PLATFORM eyebrow label
 *   - DotGrid  → subtle interactive dot matrix behind the header
 *
 * Note: each hero illustration ships with its own glossy 3D badge in the top-
 * left corner. We left-align the artwork so that badge lands under a flat,
 * colour-matched lucide tile which covers it seam-free (same hue). The
 * illustrations are therefore kept static (no idle bob) so the tile stays
 * perfectly registered over the badge.
 *
 * Brand: repulabs DARK — seamless #070b16 canvas (section stays transparent,
 * only a faint radial glow accent), glass cards rgba(255,255,255,0.035) with
 * rgba(255,255,255,0.09) borders, white headings ≤700, body #9db0d6. Per-card
 * tile accents (violet / blue / green / amber / violet / red) pop on the dark
 * ground. The hero illustrations live in /public/assets/repulabs/landing/
 * workspace. Self-contained: renders nothing global and is safe to drop
 * anywhere on the page.
 */

import {
  BarChart3,
  type LucideIcon,
  MessageSquare,
  Phone,
  RadioTower,
  Star,
  Zap,
} from "lucide-react";
import { DotGrid, Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/workspace";

type Feature = {
  /** colour-coded lucide glyph in the tile */
  icon: LucideIcon;
  /** icon-tile background — the card's accent colour */
  tint: string;
  /** hero illustration filename in ART (4:3 SVG) */
  art: string;
  /** two-line card title (kept ≤700 weight) */
  title: [string, string];
  /** single-line pitch (founder wants tighter copy) */
  body: string;
};

/* Row 1 then Row 2, exactly as the mockup lays them out. */
const FEATURES: Feature[] = [
  {
    icon: Star,
    tint: "#7c3aed",
    art: "review_widget.svg",
    title: ["Every review, answered", "in your voice"],
    body: "On-brand AI replies, approved in one click.",
  },
  {
    icon: Phone,
    tint: "#2563eb",
    art: "phone_call.svg",
    title: ["A receptionist that never", "misses a call"],
    body: "AI answers, books and follows up — 24/7.",
  },
  {
    icon: RadioTower,
    tint: "#16a34a",
    art: "qr_payment.svg",
    title: ["Tap-to-review stands", "at the counter"],
    body: "QR + NFC stands catch customers at checkout.",
  },
  {
    icon: MessageSquare,
    tint: "#f59e0b",
    art: "social_messaging.svg",
    title: ["Every channel in", "one thread list"],
    body: "Google, Meta, SMS and webchat in one inbox.",
  },
  {
    icon: BarChart3,
    tint: "#7c3aed",
    art: "dashboard.svg",
    title: ["Know exactly", "where you stand"],
    body: "Rating, local rank and competitor trends.",
  },
  {
    icon: Zap,
    tint: "#ef4444",
    art: "robot.svg",
    title: ["Set guardrails,", "let the loops run"],
    body: "Auto-loops run with approval rules you set.",
  },
];

function WorkspaceCard({ feature, index }: { feature: Feature; index: number }) {
  const { icon: Icon, tint, art, title, body } = feature;
  return (
    <Reveal delay={index * 0.05} y={20} className="h-full">
      <article className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-white/[0.09] bg-white/[0.035] p-6 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-white/[0.16] sm:p-7">
        {/* WHITE illustration plate — the artwork was drawn for white surfaces,
            so it floats on a light frame like a matted print on the dark glass. */}
        <div
          className="relative mb-5 w-full overflow-hidden rounded-xl bg-[#f4f7ff] px-3 py-3"
          style={{ boxShadow: "0 18px 40px -18px rgba(0,0,0,0.55)" }}
        >
          {/* left-aligned so the illustration's built-in 3D badge lands in the
              top-left corner, where a matching flat lucide tile covers it. */}
          <div className="relative h-[210px] w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ART}/${art}`}
              alt=""
              aria-hidden
              width={280}
              height={210}
              draggable={false}
              loading="lazy"
              className="block h-[210px] w-auto max-w-none select-none"
            />

            {/* flat, colour-matched icon tile placed exactly over the
                illustration's own glossy badge (same hue → seam-free). */}
            <span
              className="absolute grid place-items-center rounded-[13px] transition-transform duration-300 ease-out group-hover:scale-[1.05]"
              style={{
                left: 12,
                top: 9,
                height: 46,
                width: 46,
                background: tint,
                boxShadow: `0 10px 20px -8px ${tint}80`,
              }}
            >
              <Icon size={23} strokeWidth={2.3} className="text-white" />
            </span>
          </div>
        </div>

        <h3 className="text-[19px] font-bold leading-[1.25] tracking-[-0.015em] text-white">
          {title[0]}
          <br />
          {title[1]}
        </h3>

        <p className="mt-2.5 text-[13.5px] leading-[1.55] text-[#9db0d6]">{body}</p>
      </article>
    </Reveal>
  );
}

export function LandingWorkspace() {
  return (
    <section
      id="platform"
      aria-labelledby="workspace-heading"
      className="relative isolate overflow-hidden py-24 sm:py-28"
    >
      {/* ── decorative background: faint radial glow + dot matrix (seamless #070b16) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 500px at 80% 0%, rgba(59,90,255,0.10), transparent 70%)",
            /* fade the glow in from the top so the section blends seamlessly
               into whatever sits above it (no hard stripe edge) */
            WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 160px)",
            maskImage: "linear-gradient(180deg, transparent 0, #000 160px)",
          }}
        />
        <div
          className="absolute left-1/2 top-0 h-[340px] w-[760px] -translate-x-1/2"
          style={{
            WebkitMaskImage: "radial-gradient(62% 100% at 50% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(62% 100% at 50% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="90, 130, 255" spacing={26} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <ShinyText
              text="✦ THE PLATFORM"
              className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]"
            />
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="workspace-heading"
              className="mx-auto mt-6 text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.02em] text-white sm:text-[64px]"
            >
              One workspace for
              <br />
              your whole{" "}
              <span className="bg-gradient-to-r from-[#6d8bff] to-[#a855f7] bg-clip-text text-transparent">
                reputation.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-6 max-w-[700px] text-[16.5px] leading-[1.6] text-[#9db0d6] sm:text-[17.5px]">
              Stop duct-taping point tools together. repulabs runs the entire reputation
              stack in one place, with the same brand voice flowing through every reply.
            </p>
          </Reveal>
        </div>

        {/* ── feature grid — 3×2 desktop, 2 tablet, 1 mobile ── */}
        <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <WorkspaceCard key={feature.title[0]} feature={feature} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default LandingWorkspace;
