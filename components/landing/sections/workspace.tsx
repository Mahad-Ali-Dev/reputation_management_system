"use client";

/**
 * LandingWorkspace — "One workspace for your whole reputation."
 *
 * The platform-overview section for the repulabs marketing home: a dashed
 * eyebrow, a two-line headline whose closing word rides a blue→violet gradient,
 * a supporting subhead and a 3×2 grid of six product cards. Each card leads with
 * a colour-coded icon tile, then a large hero illustration, a bold two-line
 * title and a muted one-paragraph pitch.
 *
 * Animation primitives (all from `@/components/landing/anim`):
 *   - Reveal   → staggered scroll-in fade-up for the header + every card
 *   - ShinyText→ premium sheen sweep across the THE PLATFORM eyebrow label
 *   - DotGrid  → subtle interactive dot matrix behind the header
 *
 * Note: each hero illustration ships with its own glossy 3D badge in the top-left
 * corner. We left-align the artwork so that badge lands under a flat, colour-
 * matched lucide tile which covers it seam-free (same hue) — reproducing the
 * mockup's flat icon tiles. The illustrations are therefore kept static (no idle
 * bob) so the tile stays perfectly registered over the badge.
 *
 * Brand: repulabs LIGHT — near-white surface, blue #2563eb primary, blue→violet
 * gradient accent, Inter capped at 700. Per-card tile accents (violet / blue /
 * green / amber / violet / red) reproduce the mockup's colour-coding. The hero
 * illustrations live in /public/assets/repulabs/landing/workspace. Self-contained:
 * renders nothing global and is safe to drop anywhere on the page.
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
  body: string;
};

/* Row 1 then Row 2, exactly as the mockup lays them out. */
const FEATURES: Feature[] = [
  {
    icon: Star,
    tint: "#7c3aed",
    art: "review_widget.svg",
    title: ["Every review, answered", "in your voice"],
    body: "AI drafts on-brand replies the moment a review lands — you approve and publish in one click.",
  },
  {
    icon: Phone,
    tint: "#2563eb",
    art: "phone_call.svg",
    title: ["A receptionist that never", "misses a call"],
    body: "The AI phone line answers, books and follows up — then turns happy callers into reviewers.",
  },
  {
    icon: RadioTower,
    tint: "#16a34a",
    art: "qr_payment.svg",
    title: ["Tap-to-review stands", "at the counter"],
    body: "Branded QR plaques and NFC cards catch customers at their happiest — right after checkout.",
  },
  {
    icon: MessageSquare,
    tint: "#f59e0b",
    art: "social_messaging.svg",
    title: ["Every channel in", "one thread list"],
    body: "Google, Meta, SMS and webchat unified — with AI-suggested replies so nothing slips overnight.",
  },
  {
    icon: BarChart3,
    tint: "#7c3aed",
    art: "dashboard.svg",
    title: ["Know exactly", "where you stand"],
    body: "Rating trends, local-rank tracking and competitor compare — a weekly report your team will read.",
  },
  {
    icon: Zap,
    tint: "#ef4444",
    art: "robot.svg",
    title: ["Set guardrails,", "let the loops run"],
    body: "Auto-request, auto-reply and auto-post loops with approval rules you control — audited per action.",
  },
];

function WorkspaceCard({ feature, index }: { feature: Feature; index: number }) {
  const { icon: Icon, tint, art, title, body } = feature;
  return (
    <Reveal delay={index * 0.05} y={20} className="h-full">
      <article
        className="group relative flex h-full flex-col overflow-hidden rounded-[20px] border border-[#eef1f7] bg-white p-7 transition-transform duration-300 ease-out hover:-translate-y-1"
        style={{ boxShadow: "0 12px 32px -18px rgba(16,24,40,0.18)" }}
      >
        {/* hero illustration — left-aligned so its built-in 3D badge lands in the
            top-left corner, where a matching flat lucide tile covers it. */}
        <div className="relative mb-5 h-[210px] w-fit">
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

          {/* flat, colour-matched icon tile placed exactly over the illustration's
              own glossy badge (same hue → seam-free), giving the mockup's flat look. */}
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

        <h3 className="text-[20px] font-bold leading-[1.25] tracking-[-0.015em] text-[#0b1220]">
          {title[0]}
          <br />
          {title[1]}
        </h3>

        <p className="mt-2.5 text-[14.5px] leading-[1.55] text-[#5b6473]">{body}</p>
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
      style={{
        background:
          "radial-gradient(120% 90% at 50% -8%, #ffffff 0%, #f7f9ff 55%, #f5f8ff 100%)",
      }}
    >
      {/* ── decorative background: subtle dot matrix behind the header ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-0 h-[340px] w-[760px] -translate-x-1/2"
          style={{
            WebkitMaskImage: "radial-gradient(62% 100% at 50% 0%, #000 0%, transparent 72%)",
            maskImage: "radial-gradient(62% 100% at 50% 0%, #000 0%, transparent 72%)",
          }}
        >
          <DotGrid color="37, 99, 235" spacing={26} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span className="inline-flex items-center justify-center gap-3">
              <span
                aria-hidden
                className="h-px w-9"
                style={{ background: "linear-gradient(90deg, transparent, #2563eb)" }}
              />
              <ShinyText
                text="THE PLATFORM"
                className="text-[13px] font-bold uppercase tracking-[0.22em] text-[#2563eb]"
              />
              <span
                aria-hidden
                className="h-px w-9"
                style={{ background: "linear-gradient(90deg, #2563eb, transparent)" }}
              />
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="workspace-heading"
              className="mx-auto mt-6 text-balance text-[40px] font-bold leading-[1.02] tracking-[-0.032em] text-[#0b1220] sm:text-[74px]"
            >
              One workspace for
              <br />
              your whole{" "}
              <span
                style={{
                  backgroundImage: "linear-gradient(96deg, #2563eb 0%, #7c3aed 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                reputation.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-6 max-w-[700px] text-[16.5px] leading-[1.6] text-[#5b6473] sm:text-[17.5px]">
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
