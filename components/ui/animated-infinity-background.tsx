"use client";

import { motion } from "motion/react";

/**
 * Animated infinity-path background (adapted from the "BackgroundPaths"
 * snippet). Uses the `motion` package already in the app (framer-motion's
 * successor, same API) instead of adding framer-motion.
 *
 * `InfinityBackground` is the decorative layer only (orb + drawing paths), for
 * use behind content; `BackgroundPaths` keeps the original full hero with a
 * letter-by-letter title.
 */

export function FloatingPaths({ lineColor = "#0f172a" }: { lineColor?: string }) {
  const paths = Array.from({ length: 36 }, (_, i) => {
    const scale = 200 + i * 10;
    const ox = 348;
    const oy = 158;
    const d = [
      `M ${ox - scale} ${oy}`,
      `C ${ox - scale} ${oy - scale * 0.5}, ${ox - scale * 0.5} ${oy - scale * 0.5}, ${ox} ${oy}`,
      `C ${ox + scale * 0.5} ${oy + scale * 0.5}, ${ox + scale} ${oy + scale * 0.5}, ${ox + scale} ${oy}`,
      `C ${ox + scale} ${oy - scale * 0.5}, ${ox + scale * 0.5} ${oy - scale * 0.5}, ${ox} ${oy}`,
      `C ${ox - scale * 0.5} ${oy + scale * 0.5}, ${ox - scale} ${oy + scale * 0.5}, ${ox - scale} ${oy}`,
    ].join(" ");
    return { id: i, d, width: 0.5 + i * 0.03 };
  });

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        focusable="false"
        style={{ color: lineColor }}
      >
        {paths.map((path, index) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke="currentColor"
            strokeWidth={path.width}
            strokeOpacity={0.1 + path.id * 0.03}
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.6, 0.6, 0] }}
            transition={{
              duration: 15 + index * 0.5,
              repeat: Number.POSITIVE_INFINITY,
              ease: "easeInOut",
              delay: index * 0.2,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

/** Decorative layer: soft rotating colour orb + the infinity paths. */
export function InfinityBackground({
  background = "#f8fafc",
  lineColor = "#0f172a",
  orb = "linear-gradient(90deg, rgba(59,130,246,0.22), rgba(56,189,248,0.2), rgba(45,212,191,0.2))",
  showOrb = true,
}: {
  background?: string;
  lineColor?: string;
  orb?: string;
  showOrb?: boolean;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background }}>
      {showOrb && (
        <motion.div
          className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
          transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
        >
          <div className="absolute inset-0 rounded-full blur-3xl" style={{ background: orb }} />
        </motion.div>
      )}
      <FloatingPaths lineColor={lineColor} />
    </div>
  );
}

type BackgroundStyle = "glass" | "gradient" | "solid" | "glow";

const STYLE_CLASSES: Record<BackgroundStyle, string> = {
  glass: "bg-white/10 dark:bg-black/20 border border-white/20 dark:border-white/10 shadow-2xl",
  gradient:
    "bg-gradient-to-br from-white/20 via-white/10 to-transparent dark:from-black/40 dark:via-black/20 dark:to-transparent backdrop-blur-md border border-white/30 dark:border-white/10 shadow-2xl",
  solid: "bg-white/90 dark:bg-black/90 backdrop-blur-sm shadow-2xl",
  glow: "bg-white/5 dark:bg-black/10 backdrop-blur-2xl border border-white/30 dark:border-white/20 shadow-2xl shadow-white/20 dark:shadow-white/10",
};

/** Full hero from the original snippet: infinity background + animated title. */
export function BackgroundPaths({
  title = "Infinity Background",
  titleBackground = false,
  backgroundStyle = "glass",
  subtitle = "",
  showGradientOrb = true,
}: {
  title?: string;
  titleBackground?: boolean;
  backgroundStyle?: BackgroundStyle;
  subtitle?: string;
  showGradientOrb?: boolean;
}) {
  const words = title.split(" ");
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden">
      <InfinityBackground showOrb={showGradientOrb} />
      <div className="container relative z-10 mx-auto px-4 text-center md:px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="mx-auto max-w-5xl"
        >
          <motion.div
            className={`relative inline-block ${titleBackground ? `rounded-3xl p-8 sm:p-12 md:p-16 ${STYLE_CLASSES[backgroundStyle]}` : ""}`}
            whileHover={titleBackground ? { scale: 1.02 } : {}}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <h1 className="text-5xl font-bold tracking-tighter sm:text-7xl md:text-8xl lg:text-9xl">
              {words.map((word, wi) => (
                <span key={`${word}-${wi}`} className="mr-4 inline-block last:mr-0">
                  {word.split("").map((letter, li) => (
                    <motion.span
                      key={`${wi}-${li}`}
                      initial={{ y: 100, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{
                        delay: wi * 0.1 + li * 0.03,
                        type: "spring",
                        stiffness: 150,
                        damping: 25,
                      }}
                      className="inline-block bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 bg-clip-text text-transparent drop-shadow-2xl dark:from-white dark:via-neutral-200 dark:to-neutral-400"
                    >
                      {letter}
                    </motion.span>
                  ))}
                </span>
              ))}
            </h1>
            {subtitle && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.8 }}
                className="mt-6 text-lg font-light text-neutral-600 sm:text-xl md:text-2xl dark:text-neutral-400"
              >
                {subtitle}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
