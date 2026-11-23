"use client";

/**
 * FeatureParallax — alternating feature rows that reveal on scroll: the copy
 * drifts up and fades in while the product screenshot wipes into its window.
 *
 * Adapted from a community "parallax scroll feature section", restyled for
 * repulabs:
 *   - landing palette (ink / muted / brand blue / success green) and the
 *     landing's --f-ui font, on a light background (the original was white text
 *     on black)
 *   - real product screenshots in the shared dark window chrome; a feature with
 *     no screenshot yet keeps an empty frame of the same size
 *   - motion/react instead of framer-motion (same API, already installed)
 *
 * Fixes over the original:
 *   - each row is its own component, so hooks aren't called inside .map()
 *   - rows stack on mobile (the original stayed side-by-side and overflowed)
 *   - normal row heights instead of one full screen per row
 *   - the wipe finishes as the row reaches mid-screen, not near the top
 *   - prefers-reduced-motion shows everything statically
 */

import { Check, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { SCREEN_ASPECT, SCREEN_BY_ID, type ScreenId, WindowFrame } from "./product-screens";

const INK = "#0b1220";
const INK2 = "#283449";
const MUTE = "#5b6473";
const PRI = "#2563eb";
const OK = "#0f9d63";

export type Feature = {
  id: string;
  Icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  /** A real screenshot to show; leave out to keep an empty frame for one later. */
  screen?: ScreenId;
  /** URL path shown in an empty frame's address bar. */
  path?: string;
};

export function FeatureParallax({ features }: { features: Feature[] }) {
  return (
    <div className="flex flex-col gap-20 md:gap-28">
      {features.map((feature, index) => (
        <FeatureRow key={feature.id} feature={feature} index={index} />
      ))}
    </div>
  );
}

function FeatureRow({ feature, index }: { feature: Feature; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const reverse = index % 2 === 1;

  // 0 when the row's top enters the viewport, 1 when its centre reaches mid-screen.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const textY = useTransform(scrollYProgress, [0, 0.7], [48, 0]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.5], [0, 1]);
  const frameOpacity = useTransform(scrollYProgress, [0.05, 0.4], [0, 1]);
  // Wipe the screenshot in from the side facing the copy.
  const clipPath = useTransform(scrollYProgress, (v) => {
    const p = Math.min(1, Math.max(0, (v - 0.1) / 0.6));
    if (p >= 1) return "none";
    const hidden = `${((1 - p) * 100).toFixed(2)}%`;
    return reverse ? `inset(0 0 0 ${hidden})` : `inset(0 ${hidden} 0 0)`;
  });

  const screen = feature.screen ? SCREEN_BY_ID[feature.screen] : null;
  const { Icon } = feature;

  return (
    <div
      ref={ref}
      className={`flex flex-col items-center gap-8 md:gap-14 ${reverse ? "md:flex-row-reverse" : "md:flex-row"}`}
    >
      {/* copy */}
      <motion.div
        style={reduce ? undefined : { y: textY, opacity: textOpacity }}
        className="w-full md:w-[380px] md:shrink-0"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: "#eef2ff", color: PRI }}>
            <Icon size={17} />
          </span>
          <span
            className="text-[11.5px] font-semibold uppercase"
            style={{ color: PRI, letterSpacing: ".12em", fontFamily: "var(--f-mono)" }}
          >
            {String(index + 1).padStart(2, "0")} · {feature.eyebrow}
          </span>
        </div>
        <h3
          className="mt-4"
          style={{ fontSize: "clamp(24px, 3vw, 32px)", lineHeight: 1.12, letterSpacing: "-0.025em", fontWeight: 700, color: INK }}
        >
          {feature.title}
        </h3>
        <p className="mt-3 text-[15.5px] leading-relaxed" style={{ color: MUTE }}>
          {feature.description}
        </p>
        <ul className="mt-5 space-y-2.5">
          {feature.points.map((point) => (
            <li key={point} className="flex items-start gap-2 text-[14.5px]" style={{ color: INK2 }}>
              <Check size={16} style={{ color: OK, marginTop: 2, flexShrink: 0 }} /> {point}
            </li>
          ))}
        </ul>
      </motion.div>

      {/* screenshot (or an empty frame waiting for one) */}
      <motion.div style={reduce ? undefined : { opacity: frameOpacity }} className="w-full min-w-0 flex-1">
        <WindowFrame path={screen?.path ?? feature.path ?? feature.id}>
          <motion.div style={reduce ? undefined : { clipPath }}>
            {screen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={screen.src}
                alt={`Repulabs ${screen.label} — dark mode`}
                width={screen.w}
                height={screen.h}
                loading="lazy"
                className="block h-auto w-full"
              />
            ) : (
              <div
                aria-hidden
                className="grid w-full place-items-center"
                style={{ aspectRatio: SCREEN_ASPECT, background: "#0b0f1a" }}
              >
                <Icon size={30} style={{ color: "rgba(255,255,255,.14)" }} />
              </div>
            )}
          </motion.div>
        </WindowFrame>
      </motion.div>
    </div>
  );
}

export default FeatureParallax;
