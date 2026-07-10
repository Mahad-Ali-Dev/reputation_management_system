"use client";

/**
 * LandingMetricsCards — "Numbers that move the moment you do."
 *
 * Faithful port of the founder's AnimatedCard + CardVisual(Visual3) + CardBody
 * kit: three stat cards whose visuals are a layered composition —
 *   GridLayer (masked 20px grid) → EllipseGradient (radial tint) →
 *   Layer1 (stat pills, fade OUT on hover) → Layer2 (info chip, slides UP on
 *   hover) → Layer3 (bottom linear wash, slides up + fades in) → Layer4 (the
 *   bar chart, scales to 150% while every bar re-tweens height/y/fill).
 * All hover choreography preserved: same cubic-bezier(0.6,0.6,0,1) 500ms
 * transitions driven by group-hover/animated-card + a hovered state flag.
 *
 * Adaptations for repulabs:
 *   - dark-mode classes stripped → light brand (white cards, #e7ecf6 borders)
 *   - per-card mainColor/secondaryColor + per-card metric copy
 *   - SVG gradient ids de-duplicated per color (three instances on one page)
 *
 * Animation primitives (from `@/components/landing/anim`):
 *   - Reveal    → staggered scroll-in for header and each card
 *   - ShinyText → sheen sweep on the LIVE NUMBERS eyebrow
 *
 * Brand: light premium — white surfaces, blue #2563eb primary, Inter ≤700.
 */

import * as React from "react";
import { useState } from "react";
import { Reveal, ShinyText } from "@/components/landing/anim";
import { cn } from "@/lib/utils";

/* ── Card shell components (light-brand port of the kit) ── */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function AnimatedCard({ className, ...props }: CardProps) {
  return (
    <div
      role="region"
      className={cn(
        "group/animated-card relative w-[356px] overflow-hidden rounded-xl border border-[#e7ecf6] bg-white",
        className,
      )}
      style={{ boxShadow: "0 12px 30px -14px rgba(26,43,95,0.16)" }}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: CardProps) {
  return (
    <div
      role="group"
      className={cn("flex flex-col space-y-1.5 border-t border-[#eef2fa] p-4", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-none tracking-tight text-[#0b1220]",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[#5b6473]", className)} {...props} />;
}

export function CardVisual({ className, ...props }: CardProps) {
  return <div className={cn("h-[180px] w-[356px] overflow-hidden", className)} {...props} />;
}

/* ── Visual3 and its layer stack ── */

interface Visual3Props {
  mainColor?: string;
  secondaryColor?: string;
  gridColor?: string;
  /** Layer1 stat pills (fade out on hover) */
  pillPrimary?: string;
  pillSecondary?: string;
  /** Layer2 info chip (slides up on hover) */
  hoverTitle?: string;
  hoverSub?: string;
}

export function Visual3({
  mainColor = "#2563eb",
  secondaryColor = "#22d3ee",
  gridColor = "#80808015",
  pillPrimary = "+15,2%",
  pillSecondary = "+18,7%",
  hoverTitle = "Live metric",
  hoverSub = "Updating as it happens.",
}: Visual3Props) {
  const [hovered, setHovered] = useState(false);

  return (
    <>
      <div
        className="absolute inset-0 z-20"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={
          {
            "--color": mainColor,
            "--secondary-color": secondaryColor,
          } as React.CSSProperties
        }
      />

      <div className="relative h-[180px] w-[356px] overflow-hidden rounded-t-lg">
        <Layer4 color={mainColor} secondaryColor={secondaryColor} hovered={hovered} />
        <Layer3 color={mainColor} />
        <Layer2 color={mainColor} title={hoverTitle} sub={hoverSub} />
        <Layer1
          color={mainColor}
          secondaryColor={secondaryColor}
          pillPrimary={pillPrimary}
          pillSecondary={pillSecondary}
        />
        <EllipseGradient color={mainColor} />
        <GridLayer color={gridColor} />
      </div>
    </>
  );
}

interface LayerProps {
  color: string;
  secondaryColor?: string;
  hovered?: boolean;
}

const GridLayer: React.FC<{ color: string }> = ({ color }) => {
  return (
    <div
      style={{ "--grid-color": color } as React.CSSProperties}
      className="pointer-events-none absolute inset-0 z-[4] h-full w-full bg-transparent bg-[linear-gradient(to_right,var(--grid-color)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-color)_1px,transparent_1px)] bg-[size:20px_20px] bg-center opacity-70 [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_60%,transparent_100%)]"
    />
  );
};

const EllipseGradient: React.FC<{ color: string }> = ({ color }) => {
  /* unique gradient id per color — three cards share one DOM */
  const gid = `lp-mc-radial-${color.replace("#", "")}`;
  return (
    <div className="absolute inset-0 z-[5] flex h-full w-full items-center justify-center">
      <svg
        width="356"
        height="196"
        viewBox="0 0 356 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="356" height="180" fill={`url(#${gid})`} />
        <defs>
          <radialGradient
            id={gid}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(178 98) rotate(90) scale(98 178)"
          >
            <stop stopColor={color} stopOpacity="0.25" />
            <stop offset="0.34" stopColor={color} stopOpacity="0.15" />
            <stop offset="1" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
};

const Layer1: React.FC<LayerProps & { pillPrimary: string; pillSecondary: string }> = ({
  color,
  secondaryColor,
  pillPrimary,
  pillSecondary,
}) => {
  return (
    <div
      className="absolute left-4 top-4 z-[8] flex items-center gap-1"
      style={
        {
          "--color": color,
          "--secondary-color": secondaryColor,
        } as React.CSSProperties
      }
    >
      <div className="flex shrink-0 items-center rounded-full border border-[#e7ecf6] bg-white/60 px-1.5 py-0.5 backdrop-blur-sm transition-opacity duration-300 ease-in-out group-hover/animated-card:opacity-0">
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--color)]" />
        <span className="ml-1 text-[10px] font-semibold text-[#0b1220]">{pillPrimary}</span>
      </div>
      <div className="flex shrink-0 items-center rounded-full border border-[#e7ecf6] bg-white/60 px-1.5 py-0.5 backdrop-blur-sm transition-opacity duration-300 ease-in-out group-hover/animated-card:opacity-0">
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--secondary-color)]" />
        <span className="ml-1 text-[10px] font-semibold text-[#0b1220]">{pillSecondary}</span>
      </div>
    </div>
  );
};

const Layer2: React.FC<{ color: string; title: string; sub: string }> = ({
  color,
  title,
  sub,
}) => {
  return (
    <div
      className="group relative h-full w-[356px]"
      style={{ "--color": color } as React.CSSProperties}
    >
      <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[7] flex w-[356px] translate-y-full items-start justify-center bg-transparent p-4 transition-transform duration-500 group-hover/animated-card:translate-y-0">
        <div className="ease-[cubic-bezier(0.6,0.6,0,1)] rounded-md border border-[#e7ecf6] bg-white/60 p-1.5 opacity-0 backdrop-blur-sm transition-opacity duration-500 group-hover/animated-card:opacity-100">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--color)]" />
            <p className="text-xs font-semibold text-[#0b1220]">{title}</p>
          </div>
          <p className="text-xs text-[#5b6473]">{sub}</p>
        </div>
      </div>
    </div>
  );
};

const Layer3: React.FC<{ color: string }> = ({ color }) => {
  const gid = `lp-mc-linear-${color.replace("#", "")}`;
  return (
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[6] flex translate-y-full items-center justify-center opacity-0 transition-all duration-500 group-hover/animated-card:translate-y-0 group-hover/animated-card:opacity-100">
      <svg
        width="356"
        height="180"
        viewBox="0 0 356 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="356" height="180" fill={`url(#${gid})`} />
        <defs>
          <linearGradient
            id={gid}
            x1="178"
            y1="0"
            x2="178"
            y2="180"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0.35" stopColor={color} stopOpacity="0" />
            <stop offset="1" stopColor={color} stopOpacity="0.3" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

const Layer4: React.FC<LayerProps> = ({ color, secondaryColor, hovered }) => {
  const rectsData = [
    { width: 15, height: 20, y: 110, hoverHeight: 20, hoverY: 130, x: 40, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 20, y: 90, hoverHeight: 20, hoverY: 130, x: 60, fill: color, hoverFill: color },
    { width: 15, height: 40, y: 70, hoverHeight: 30, hoverY: 120, x: 80, fill: color, hoverFill: color },
    { width: 15, height: 30, y: 80, hoverHeight: 50, hoverY: 100, x: 100, fill: color, hoverFill: color },
    { width: 15, height: 30, y: 110, hoverHeight: 40, hoverY: 110, x: 120, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 50, y: 110, hoverHeight: 20, hoverY: 130, x: 140, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 50, y: 60, hoverHeight: 30, hoverY: 120, x: 160, fill: color, hoverFill: color },
    { width: 15, height: 30, y: 80, hoverHeight: 20, hoverY: 130, x: 180, fill: color, hoverFill: color },
    { width: 15, height: 20, y: 110, hoverHeight: 40, hoverY: 110, x: 200, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 40, y: 70, hoverHeight: 60, hoverY: 90, x: 220, fill: color, hoverFill: color },
    { width: 15, height: 30, y: 110, hoverHeight: 70, hoverY: 80, x: 240, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 50, y: 110, hoverHeight: 50, hoverY: 100, x: 260, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 20, y: 110, hoverHeight: 80, hoverY: 70, x: 280, fill: "currentColor", hoverFill: secondaryColor },
    { width: 15, height: 30, y: 80, hoverHeight: 90, hoverY: 60, x: 300, fill: color, hoverFill: color },
  ];

  return (
    <div className="ease-[cubic-bezier(0.6,0.6,0,1)] absolute inset-0 z-[8] flex h-[180px] w-[356px] items-center justify-center text-neutral-800/10 transition-transform duration-500 group-hover/animated-card:scale-150">
      <svg width="356" height="180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        {rectsData.map((rect, index) => (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: static bar chart
            key={index}
            width={rect.width}
            height={hovered ? rect.hoverHeight : rect.height}
            x={rect.x}
            y={hovered ? rect.hoverY : rect.y}
            fill={hovered ? rect.hoverFill : rect.fill}
            rx="2"
            ry="2"
            className="ease-[cubic-bezier(0.6,0.6,0,1)] transition-all duration-500"
          />
        ))}
      </svg>
    </div>
  );
};

/* ── Section ── */

type MetricCard = {
  mainColor: string;
  secondaryColor: string;
  title: string;
  description: string;
  pillPrimary: string;
  pillSecondary: string;
  hoverTitle: string;
  hoverSub: string;
};

const METRIC_CARDS: MetricCard[] = [
  {
    mainColor: "#2563eb",
    secondaryColor: "#22d3ee",
    title: "Average rating",
    description: "4.8 and climbing across locations",
    pillPrimary: "4.8 avg",
    pillSecondary: "+0.3 QoQ",
    hoverTitle: "Rating trend",
    hoverSub: "Climbing across every location.",
  },
  {
    mainColor: "#7c3aed",
    secondaryColor: "#f59e0b",
    title: "Reviews this month",
    description: "+47 new, 96% response rate",
    pillPrimary: "+47 new",
    pillSecondary: "96% replied",
    hoverTitle: "Review velocity",
    hoverSub: "New reviews vs. responses.",
  },
  {
    mainColor: "#16a34a",
    secondaryColor: "#22d3ee",
    title: "Bookings from calls",
    description: "AI phone turns callers into visits",
    pillPrimary: "+31 booked",
    pillSecondary: "0 missed",
    hoverTitle: "Call conversions",
    hoverSub: "AI answers, callers become visits.",
  },
];

export function LandingMetricsCards() {
  return (
    <section
      id="metrics-cards"
      aria-labelledby="metrics-cards-heading"
      className="relative py-16 sm:py-20"
      style={{
        background:
          "radial-gradient(120% 90% at 50% -10%, #ffffff 0%, #f6f8ff 50%, #f8faff 100%)",
      }}
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        {/* ── slim header ── */}
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <ShinyText
              text="✦ LIVE NUMBERS"
              className="text-[13px] font-bold tracking-[0.16em] text-[#2563eb]"
            />
          </Reveal>
          <Reveal delay={0.06}>
            <h2
              id="metrics-cards-heading"
              className="mx-auto mt-4 text-balance text-[30px] font-bold leading-[1.08] tracking-[-0.02em] text-[#0b1220] sm:text-[38px]"
            >
              Numbers that move the moment you do.
            </h2>
          </Reveal>
        </div>

        {/* ── three animated cards ── */}
        <div className="mt-12 flex flex-wrap items-stretch justify-center gap-6">
          {METRIC_CARDS.map((card, i) => (
            <Reveal key={card.title} delay={0.08 + i * 0.07} y={22}>
              <AnimatedCard>
                <CardVisual>
                  <Visual3
                    mainColor={card.mainColor}
                    secondaryColor={card.secondaryColor}
                    pillPrimary={card.pillPrimary}
                    pillSecondary={card.pillSecondary}
                    hoverTitle={card.hoverTitle}
                    hoverSub={card.hoverSub}
                  />
                </CardVisual>
                <CardBody>
                  <CardTitle>{card.title}</CardTitle>
                  <CardDescription>{card.description}</CardDescription>
                </CardBody>
              </AnimatedCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default LandingMetricsCards;
