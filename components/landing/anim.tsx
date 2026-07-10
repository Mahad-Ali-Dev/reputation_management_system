"use client";

/**
 * Landing-page animation primitives — extracted + adapted from the founder's
 * `hero section.txt` component library, ported to this repo:
 *   - imports use `motion/react` (framer-motion v12 is installed as `motion`)
 *   - tuned for the repulabs LIGHT brand (blue/teal on near-white), not the
 *     dark "Nexus" theme the originals shipped in.
 *
 * Exports: RotatingText, ShinyText, DotGrid (interactive canvas bg), Reveal
 * (scroll-in fade-up), Float (idle bob for the floating dashboard cards).
 */

import {
  AnimatePresence,
  motion,
  useInView,
  type Target,
  type Transition,
  type VariantLabels,
} from "motion/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/* ─────────────────────────── RotatingText ─────────────────────────── */

export interface RotatingTextRef {
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  reset: () => void;
}

interface RotatingTextProps {
  texts: string[];
  transition?: Transition;
  initial?: boolean | Target | VariantLabels;
  animate?: boolean | Target | VariantLabels;
  exit?: Target | VariantLabels;
  rotationInterval?: number;
  staggerDuration?: number;
  staggerFrom?: "first" | "last" | "center" | number;
  loop?: boolean;
  auto?: boolean;
  mainClassName?: string;
  elementLevelClassName?: string;
}

export const RotatingText = forwardRef<RotatingTextRef, RotatingTextProps>((props, ref) => {
  const {
    texts,
    transition = { type: "spring", damping: 25, stiffness: 300 },
    initial = { y: "100%", opacity: 0 },
    animate = { y: 0, opacity: 1 },
    exit = { y: "-120%", opacity: 0 },
    rotationInterval = 2200,
    staggerDuration = 0.01,
    staggerFrom = "last",
    loop = true,
    auto = true,
    mainClassName,
    elementLevelClassName,
  } = props;

  const [index, setIndex] = useState(0);

  const chars = useMemo(() => Array.from(texts[index] ?? ""), [texts, index]);

  const getDelay = useCallback(
    (i: number, total: number) => {
      if (total <= 1 || !staggerDuration) return 0;
      switch (staggerFrom) {
        case "first":
          return i * staggerDuration;
        case "last":
          return (total - 1 - i) * staggerDuration;
        case "center":
          return Math.abs((total - 1) / 2 - i) * staggerDuration;
        default:
          return Math.abs((typeof staggerFrom === "number" ? staggerFrom : 0) - i) * staggerDuration;
      }
    },
    [staggerFrom, staggerDuration],
  );

  const next = useCallback(() => {
    setIndex((i) => (i === texts.length - 1 ? (loop ? 0 : i) : i + 1));
  }, [texts.length, loop]);

  useImperativeHandle(ref, () => ({
    next,
    previous: () => setIndex((i) => (i === 0 ? (loop ? texts.length - 1 : i) : i - 1)),
    jumpTo: (i: number) => setIndex(Math.max(0, Math.min(i, texts.length - 1))),
    reset: () => setIndex(0),
  }));

  useEffect(() => {
    if (!auto || texts.length <= 1) return;
    const id = setInterval(next, rotationInterval);
    return () => clearInterval(id);
  }, [next, rotationInterval, auto, texts.length]);

  return (
    <motion.span className={cn("inline-flex flex-wrap whitespace-pre-wrap relative", mainClassName)} layout>
      <span className="sr-only">{texts[index]}</span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={index} className="inline-flex" aria-hidden layout>
          {chars.map((char, i) => (
            <motion.span
              // biome-ignore lint/suspicious/noArrayIndexKey: char-position animation
              key={i}
              initial={initial}
              animate={animate}
              exit={exit}
              transition={{ ...transition, delay: getDelay(i, chars.length) }}
              className={cn("inline-block leading-none tracking-tight", elementLevelClassName)}
            >
              {char === " " ? " " : char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
});
RotatingText.displayName = "RotatingText";

/* ─────────────────────────── ShinyText ─────────────────────────── */

export function ShinyText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("relative overflow-hidden inline-block", className)}>
      {text}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
          animation: "lp-shine 2.4s infinite linear",
          pointerEvents: "none",
        }}
      />
      <style>{`@keyframes lp-shine{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
    </span>
  );
}

/* ───────────────── DotGrid — interactive canvas background ───────────────── */

type Dot = {
  x: number;
  y: number;
  targetOpacity: number;
  currentOpacity: number;
  opacitySpeed: number;
  currentRadius: number;
};

/** Interactive dot-grid background (from InteractiveHero), tuned light: soft
 *  blue dots that brighten + swell near the cursor. Absolutely positioned;
 *  drop it inside a `relative` container. */
export function DotGrid({
  className,
  color = "37, 99, 235",
  spacing = 26,
}: {
  className?: string;
  /** dot colour as "r, g, b". */
  color?: string;
  spacing?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dotsRef = useRef<Dot[]>([]);
  const sizeRef = useRef({ w: 0, h: 0 });
  const mouseRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  const OPACITY_MIN = 0.12;
  const OPACITY_MAX = 0.32;
  const RADIUS = 1;
  const INTERACT = 150;
  const INTERACT_SQ = INTERACT * INTERACT;

  const build = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const dots: Dot[] = [];
    const cols = Math.ceil(w / spacing);
    const rows = Math.ceil(h / spacing);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const o = Math.random() * (OPACITY_MAX - OPACITY_MIN) + OPACITY_MIN;
        dots.push({
          x: i * spacing + spacing / 2,
          y: j * spacing + spacing / 2,
          targetOpacity: o,
          currentOpacity: o,
          opacitySpeed: Math.random() * 0.005 + 0.002,
          currentRadius: RADIUS,
        });
      }
    }
    dotsRef.current = dots;
  }, [spacing]);

  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      sizeRef.current = { w, h };
      build();
    }
  }, [build]);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    const { w, h } = sizeRef.current;
    const { x: mx, y: my } = mouseRef.current;
    if (!ctx || !w || !h) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    ctx.clearRect(0, 0, w, h);
    for (const dot of dotsRef.current) {
      dot.currentOpacity += dot.opacitySpeed;
      if (dot.currentOpacity >= dot.targetOpacity || dot.currentOpacity <= OPACITY_MIN) {
        dot.opacitySpeed = -dot.opacitySpeed;
        dot.currentOpacity = Math.max(OPACITY_MIN, Math.min(dot.currentOpacity, OPACITY_MAX));
        dot.targetOpacity = Math.random() * (OPACITY_MAX - OPACITY_MIN) + OPACITY_MIN;
      }
      let factor = 0;
      if (mx !== null && my !== null) {
        const dx = dot.x - mx;
        const dy = dot.y - my;
        const dsq = dx * dx + dy * dy;
        if (dsq < INTERACT_SQ) {
          const f = Math.max(0, 1 - Math.sqrt(dsq) / INTERACT);
          factor = f * f;
        }
      }
      const opacity = Math.min(0.9, dot.currentOpacity + factor * 0.6);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${color}, ${opacity.toFixed(3)})`;
      ctx.arc(dot.x, dot.y, RADIUS + factor * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [color]);

  useEffect(() => {
    resize();
    const onMove = (e: MouseEvent) => {
      const c = canvasRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      mouseRef.current = { x: null, y: null };
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("resize", resize);
    document.documentElement.addEventListener("mouseleave", onLeave);
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", resize);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [resize, draw]);

  return <canvas ref={canvasRef} aria-hidden className={cn("absolute inset-0 pointer-events-none", className)} />;
}

/* ─────────────────────────── Reveal (scroll-in) ─────────────────────────── */

/** Fade-up on scroll into view. `delay` staggers siblings. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 22,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: "0px 0px -12% 0px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────── Float (idle bob) ─────────────────────────── */

/** Gentle infinite bob for the floating hero dashboard cards / badges. */
export function Float({
  children,
  className,
  amount = 10,
  duration = 5,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
  duration?: number;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -amount, 0] }}
      transition={{ duration, delay, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}
