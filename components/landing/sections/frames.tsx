"use client";

/**
 * LandingFrames — "Six more modules, one login." hover-expand screenshot grid.
 *
 * Port of the founder's DynamicFrameLayout + FrameComponent (hero section.txt),
 * adapted from looping videos to real product screenshots. The signature
 * mechanic is kept verbatim: a CSS grid whose `grid-template-rows/columns`
 * animate when a cell is hovered, growing that cell's whole row + column
 * (`transition: grid-template-* 0.4s ease`). Hover-to-play video became a
 * gentle hover zoom (`mediaSize` scale) + a label chip that fades in; the
 * video/frame-asset props (autoPlay, corner/edge sprites, showFrame) were
 * stripped since they don't apply to stills.
 *
 * Dark cinematic restyle — this is the tour's closing beat ("and everything
 * else"), sitting directly on the page's #070b16 canvas. Frames are #0d1526
 * on white/10 borders with a cyan hover ring, label chips are dark glass.
 */

import { motion } from "motion/react";
import { useState } from "react";
import { Reveal, ShinyText } from "@/components/landing/anim";

const ART = "/assets/repulabs/landing/tour";

interface Frame {
  id: number;
  image: string;
  label: string;
  accent: string;
  /** original grid coords — x ∈ {0,4,8} (3 cols), y ∈ {0,4} (2 rows) */
  defaultPos: { x: number; y: number; w: number; h: number };
  /** hover zoom applied to the media (the original's mediaSize) */
  mediaSize: number;
}

const FRAMES: Frame[] = [
  { id: 1, image: "dashboard.png", label: "Command dashboard", accent: "#60a5fa", defaultPos: { x: 0, y: 0, w: 4, h: 4 }, mediaSize: 1.05 },
  { id: 2, image: "inbox.png", label: "Unified inbox", accent: "#a78bfa", defaultPos: { x: 4, y: 0, w: 4, h: 4 }, mediaSize: 1.05 },
  { id: 3, image: "outreach.png", label: "Review requests", accent: "#22d3ee", defaultPos: { x: 8, y: 0, w: 4, h: 4 }, mediaSize: 1.05 },
  { id: 4, image: "surveys.png", label: "Surveys & NPS", accent: "#4ade80", defaultPos: { x: 0, y: 4, w: 4, h: 4 }, mediaSize: 1.05 },
  { id: 5, image: "qr.png", label: "QR stands", accent: "#fb923c", defaultPos: { x: 4, y: 4, w: 4, h: 4 }, mediaSize: 1.05 },
  { id: 6, image: "social.png", label: "Social studio", accent: "#f472b6", defaultPos: { x: 8, y: 4, w: 4, h: 4 }, mediaSize: 1.05 },
];

/* how far a hovered track grows — rows sum to 8fr (2 tracks), cols to 12fr (3 tracks) */
const HOVER_ROW = 5;
const HOVER_COL = 6;
const GAP_SIZE = 12;

/* ── FrameComponent, ported from video to a still screenshot ── */
function FrameCell({ frame, isHovered }: { frame: Frame; isHovered: boolean }) {
  return (
    <div
      className="relative"
      style={{
        width: "100%",
        height: "100%",
        transition: "width 0.3s ease-in-out, height 0.3s ease-in-out",
      }}
    >
      <div
        className="relative h-full w-full overflow-hidden rounded-xl border bg-[#0d1526]"
        style={{
          borderColor: isHovered ? "rgba(34,211,238,0.55)" : "rgba(255,255,255,0.10)",
          boxShadow: isHovered
            ? `0 0 0 1px rgba(34,211,238,0.28), 0 26px 60px -24px rgba(0,0,0,0.8), 0 0 40px -12px ${frame.accent}45`
            : "0 20px 45px -28px rgba(0,0,0,0.7)",
          transition: "border-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out",
        }}
      >
        {/* media — the original's mediaSize scale, now driven by hover */}
        <div
          className="h-full w-full overflow-hidden"
          style={{
            transform: `scale(${isHovered ? frame.mediaSize : 1})`,
            transformOrigin: "center",
            transition: "transform 0.3s ease-in-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/${frame.image}`}
            alt={`repulabs — ${frame.label}`}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover object-top"
          />
        </div>

        {/* label chip — dark glass, appears on hover */}
        <div
          className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 py-1.5 backdrop-blur"
          style={{
            background: "rgba(13,21,38,0.85)",
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.3s ease-in-out, transform 0.3s ease-in-out",
            boxShadow: "0 10px 24px -12px rgba(0,0,0,0.7)",
          }}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: frame.accent }}
          />
          <span className="text-[13px] font-bold tracking-[-0.01em] text-[#cdd8f2]">
            {frame.label}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── DynamicFrameLayout — the grid-template hover-expand mechanic, 3×2 ── */
function DynamicFrameGrid() {
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);

  const getRowSizes = () => {
    if (hovered === null) return "4fr 4fr";
    return [0, 1]
      .map((r) => (r === hovered.row ? `${HOVER_ROW}fr` : `${8 - HOVER_ROW}fr`))
      .join(" ");
  };

  const getColSizes = () => {
    if (hovered === null) return "4fr 4fr 4fr";
    const nonHoveredSize = (12 - HOVER_COL) / 2;
    return [0, 1, 2]
      .map((c) => (c === hovered.col ? `${HOVER_COL}fr` : `${nonHoveredSize}fr`))
      .join(" ");
  };

  const getTransformOrigin = (x: number, y: number) => {
    const vertical = y === 0 ? "top" : "bottom";
    const horizontal = x === 0 ? "left" : x === 4 ? "center" : "right";
    return `${vertical} ${horizontal}`;
  };

  return (
    <div
      className="relative h-[440px] w-full sm:h-[560px] lg:h-[680px]"
      style={{
        display: "grid",
        gridTemplateRows: getRowSizes(),
        gridTemplateColumns: getColSizes(),
        gap: `${GAP_SIZE}px`,
        transition: "grid-template-rows 0.4s ease, grid-template-columns 0.4s ease",
      }}
    >
      {FRAMES.map((frame) => {
        const row = Math.floor(frame.defaultPos.y / 4);
        const col = Math.floor(frame.defaultPos.x / 4);
        const transformOrigin = getTransformOrigin(frame.defaultPos.x, frame.defaultPos.y);

        return (
          <motion.div
            key={frame.id}
            className="relative"
            style={{ transformOrigin, transition: "transform 0.4s ease" }}
            onMouseEnter={() => setHovered({ row, col })}
            onMouseLeave={() => setHovered(null)}
          >
            <FrameCell
              frame={frame}
              isHovered={hovered?.row === row && hovered?.col === col}
            />
          </motion.div>
        );
      })}
    </div>
  );
}

export function LandingFrames() {
  return (
    <section
      id="explore"
      aria-labelledby="explore-heading"
      className="relative isolate overflow-hidden py-24 sm:py-28"
    >
      {/* faint radial glow accent — the only background this section owns.
          Centered well below the section edge so it fades to zero at the
          boundary (no visible seam against the tour section above). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[900px]"
        style={{
          background:
            "radial-gradient(760px 440px at 22% 430px, rgba(124,58,237,0.08), transparent 70%)",
        }}
      />

      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <ShinyText
              text="✦ AND EVERYTHING ELSE"
              className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]"
            />
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="explore-heading"
              className="mx-auto mt-6 max-w-[16ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.02em] text-white sm:text-[56px]"
            >
              Six more modules,{" "}
              <span className="bg-gradient-to-r from-[#6d8bff] to-[#a855f7] bg-clip-text text-transparent">
                one login.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-[1.55] text-[#9db0d6] sm:text-[19px]">
              Hover any panel — everything ships in every plan, already wired
              together.
            </p>
          </Reveal>
        </div>

        {/* ── hover-expand grid ── */}
        <Reveal delay={0.1} className="mt-14">
          <DynamicFrameGrid />
        </Reveal>
      </div>
    </section>
  );
}

export default LandingFrames;
