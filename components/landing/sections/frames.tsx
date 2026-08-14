"use client";

/**
 * LandingFrames — "Explore the whole workspace." hover-expand screenshot grid.
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
 * Restyled to the repulabs LIGHT brand: rounded-xl frames on 1px #E1E6F0
 * borders, soft blue-tinted shadows, Inter ≤700, standard section header with
 * Reveal + ShinyText from `@/components/landing/anim`.
 */

import { motion } from "motion/react";
import { useState } from "react";
import { Reveal, ShinyText } from "@/components/landing/anim";

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
  {
    id: 1,
    image: "/assets/repulabs/landingPage/image_1.jpeg",
    label: "Command dashboard",
    accent: "#2563eb",
    defaultPos: { x: 0, y: 0, w: 4, h: 4 },
    mediaSize: 1.05,
  },
  {
    id: 2,
    image: "/assets/repulabs/landingPage/image_2.jpeg",
    label: "AI Knowledge Base",
    accent: "#7c3aed",
    defaultPos: { x: 4, y: 0, w: 4, h: 4 },
    mediaSize: 1.05,
  },
  {
    id: 3,
    image: "/assets/repulabs/landingPage/image_3.jpeg",
    label: "Dispute Center",
    accent: "#0891b2",
    defaultPos: { x: 8, y: 0, w: 4, h: 4 },
    mediaSize: 1.05,
  },
  {
    id: 4,
    image: "/assets/repulabs/landingPage/image_4.jpeg",
    label: "Social Studio",
    accent: "#16a34a",
    defaultPos: { x: 0, y: 4, w: 4, h: 4 },
    mediaSize: 1.05,
  },
  {
    id: 5,
    image: "/assets/repulabs/landingPage/image_5.jpeg",
    label: "Surveys",
    accent: "#ea580c",
    defaultPos: { x: 4, y: 4, w: 4, h: 4 },
    mediaSize: 1.05,
  },
  {
    id: 6,
    image: "/assets/repulabs/landingPage/image_6.jpeg",
    label: "Connections",
    accent: "#db2777",
    defaultPos: { x: 8, y: 4, w: 4, h: 4 },
    mediaSize: 1.05,
  },
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
        className="relative h-full w-full overflow-hidden rounded-xl border bg-white"
        style={{
          borderColor: isHovered ? `${frame.accent}55` : "#E1E6F0",
          boxShadow: isHovered
            ? `0 26px 55px -24px ${frame.accent}59`
            : "0 16px 38px -24px rgba(26,43,95,0.28)",
          transition:
            "border-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out",
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
            src={frame.image}
            alt={`repulabs — ${frame.label}`}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover object-top"
          />
        </div>

        {/* label chip — appears on hover */}
        <div
          className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-[#E1E6F0] bg-white/90 px-3.5 py-1.5 backdrop-blur"
          style={{
            opacity: isHovered ? 1 : 0,
            transform: isHovered ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.3s ease-in-out, transform 0.3s ease-in-out",
            boxShadow: "0 10px 24px -12px rgba(26,43,95,0.35)",
          }}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ background: frame.accent }}
          />
          <span className="text-[13px] font-bold tracking-[-0.01em] text-[#0b1220]">
            {frame.label}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── DynamicFrameLayout — the grid-template hover-expand mechanic, 3×2 ── */
function DynamicFrameGrid() {
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(
    null,
  );

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
      .map((c) =>
        c === hovered.col ? `${HOVER_COL}fr` : `${nonHoveredSize}fr`,
      )
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
        transition:
          "grid-template-rows 0.4s ease, grid-template-columns 0.4s ease",
      }}
    >
      {FRAMES.map((frame) => {
        const row = Math.floor(frame.defaultPos.y / 4);
        const col = Math.floor(frame.defaultPos.x / 4);
        const transformOrigin = getTransformOrigin(
          frame.defaultPos.x,
          frame.defaultPos.y,
        );

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
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #ffffff 0%, #f4f7ff 50%, #ffffff 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
        {/* ── header ── */}
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur"
              style={{
                borderColor: "#D9DDF7",
                background: "rgba(255,255,255,0.65)",
              }}
            >
              <ShinyText
                text="✦ PRODUCT TOUR"
                className="text-[13px] font-bold tracking-[0.16em] text-[#654DF4]"
              />
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h2
              id="explore-heading"
              className="mx-auto mt-6 max-w-[16ch] text-balance text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-[#0b1220] sm:text-[56px]"
            >
              Explore the{" "}
              <span className="bg-gradient-to-r from-[#2563eb] to-[#654df4] bg-clip-text text-transparent">
                whole workspace.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mx-auto mt-5 max-w-[620px] text-[17px] leading-[1.55] text-[#5b6473] sm:text-[19px]">
              Six more modules, one login. Hover any panel — everything below
              ships in every plan, already wired together.
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
