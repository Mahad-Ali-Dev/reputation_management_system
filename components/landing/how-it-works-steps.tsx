"use client";

/**
 * HowItWorksSteps — pinned "sticky note" step cards laid out in a zig-zag with
 * an animated dashed connector between them.
 *
 * Adapted from a community "how-it-works" component, restyled for repulabs:
 *   - brand blue accents (blue / indigo / sky) instead of orange & purple
 *   - project fonts: step numbers in --f-mono, everything else inherits --f-ui
 *     (no Comic Sans / handwriting font)
 *   - landing palette for ink, muted text, borders and shadows
 *   - rotation + absolute zig-zag only from md up; cards stack flat on mobile
 *
 * The zig-zag positions and connector path are tuned for exactly 5 steps.
 */

import { LazyMotion, domAnimation, m } from "motion/react";
import type { CSSProperties } from "react";

const INK = "#0b1220";
const MUTE = "#5b6473";

type Accent = { fill: string; tint: string; border: string };

/* Brand-aligned accents, cycled across the cards. */
const BLUE: Accent = { fill: "#2563eb", tint: "rgba(37,99,235,.07)", border: "rgba(37,99,235,.18)" };
const ACCENTS: Accent[] = [
  BLUE,
  { fill: "#4f46e5", tint: "rgba(79,70,229,.07)", border: "rgba(79,70,229,.18)" },
  { fill: "#0284c7", tint: "rgba(2,132,199,.07)", border: "rgba(2,132,199,.18)" },
];

export type HowStep = { title: string; description: string };

type Position = { className: string; rotate: string };

/* Zig-zag positions (md+) for 5 cards inside a 1000 × 1130 canvas. */
const FIRST: Position = { className: "md:absolute md:top-0 md:left-[15%]", rotate: "md:rotate-[8deg]" };
const POSITIONS: Position[] = [
  FIRST,
  { className: "md:absolute md:top-[120px] md:right-[15%]", rotate: "md:-rotate-[8deg]" },
  { className: "md:absolute md:top-[450px] md:left-[15%]", rotate: "md:rotate-[8deg]" },
  { className: "md:absolute md:top-[570px] md:right-[10%]", rotate: "md:-rotate-[8deg]" },
  { className: "md:absolute md:top-[850px] md:left-[15%]", rotate: "md:rotate-[8deg]" },
];

const CANVAS_HEIGHT = 1130;

/* Dashed connector, card 1 → 2 → 3 → 4 → 5, in the 1000-wide viewBox. */
const SEGMENTS = [
  "M 290 150 C 500 150, 550 270, 710 270",
  " C 850 270, 500 350, 290 450",
  " C 290 600, 550 720, 750 720",
  " C 950 720, 500 800, 290 850",
];

function Pin({ color }: { color: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="mx-auto mb-6 h-8 w-8"
      style={{ color }}
      aria-hidden
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M16 3a1 1 0 0 1 .117 1.993l-.117 .007v4.764l1.894 3.789a1 1 0 0 1 .1 .331l.006 .116v2a1 1 0 0 1 -.883 .993l-.117 .007h-4v4a1 1 0 0 1 -1.993 .117l-.007 -.117v-4h-4a1 1 0 0 1 -.993 -.883l-.007 -.117v-2a1 1 0 0 1 .06 -.34l.046 -.107l1.894 -3.791v-4.762a1 1 0 0 1 -.117 -1.993l.117 -.007h8z" />
    </svg>
  );
}

function StepCard({
  number,
  step,
  accent,
  position,
}: {
  number: string;
  step: HowStep;
  accent: Accent;
  position: Position;
}) {
  return (
    <div
      className={`relative w-full transition-transform duration-300 hover:z-30 hover:scale-105 md:w-[280px] ${position.rotate} ${position.className}`}
    >
      <div
        className="glass-surface glass-surface--raised rounded-[25px] p-2"
      >
        <Pin color={accent.fill} />
        <div
          className="relative flex h-full flex-col overflow-hidden rounded-[15px] border p-[15px]"
          style={{ background: accent.tint, borderColor: accent.border }}
        >
          <span
            className="mb-5 text-[34px] font-bold leading-none"
            style={{ color: accent.fill, fontFamily: "var(--f-mono)", letterSpacing: "-0.02em" }}
          >
            {number}
          </span>
          <h3
            className="mb-[10px] text-[21px] font-bold leading-tight"
            style={{ color: INK, letterSpacing: "-0.015em" }}
          >
            {step.title}
          </h3>
          <p className="text-[14px] leading-relaxed tracking-tight" style={{ color: MUTE }}>
            {step.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function HowItWorksSteps({ steps }: { steps: HowStep[] }) {
  const data = steps.slice(0, POSITIONS.length);
  const pathD = SEGMENTS.slice(0, Math.max(0, data.length - 1)).join("");

  return (
    <LazyMotion features={domAnimation}>
      <div
        className="relative mx-auto flex h-auto w-full max-w-[1000px] flex-col space-y-8 md:block md:h-[var(--md-height)] md:space-y-0"
        style={{ "--md-height": `${CANVAS_HEIGHT}px` } as CSSProperties}
      >
        {data.length > 1 && (
          <svg
            className="pointer-events-none absolute left-0 top-0 z-0 hidden h-full w-full md:block"
            viewBox={`0 0 1000 ${CANVAS_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <m.path
              d={pathD}
              stroke="#b9c7e2"
              strokeWidth="2"
              strokeDasharray="8 6"
              fill="none"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ strokeDashoffset: 0 }}
              animate={{ strokeDashoffset: -140 }}
              transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
            />
          </svg>
        )}

        {data.map((step, i) => (
          <StepCard
            key={step.title}
            number={String(i + 1).padStart(2, "0")}
            step={step}
            accent={ACCENTS[i % ACCENTS.length] ?? BLUE}
            position={POSITIONS[i] ?? FIRST}
          />
        ))}
      </div>
    </LazyMotion>
  );
}

export default HowItWorksSteps;
