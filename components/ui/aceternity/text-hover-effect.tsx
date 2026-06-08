"use client";

import { motion, useReducedMotion } from "motion/react";
import { type MouseEvent, useEffect, useRef, useState } from "react";

export interface TextHoverEffectProps {
  /** The text to render as large gradient-stroke SVG. */
  text: string;
  /** Auto-reveal a sweep without hover (defaults to false). */
  automatic?: boolean;
  duration?: number;
}

export function TextHoverEffect({
  text,
  automatic = false,
  duration = 0.3,
}: TextHoverEffectProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const [maskPosition, setMaskPosition] = useState({ cx: "50%", cy: "50%" });
  const reduced = useReducedMotion();
  const lastMoveRef = useRef(0);

  useEffect(() => {
    if (svgRef.current && cursor.x !== null && cursor.y !== null) {
      const rect = svgRef.current.getBoundingClientRect();
      const cxPercentage = ((cursor.x - rect.left) / rect.width) * 100;
      const cyPercentage = ((cursor.y - rect.top) / rect.height) * 100;
      setMaskPosition({ cx: `${cxPercentage}%`, cy: `${cyPercentage}%` });
    }
  }, [cursor]);

  function handleMove(e: MouseEvent<SVGSVGElement>) {
    // Throttle to ~60fps to avoid per-mousemove re-render churn.
    const now = performance.now();
    if (now - lastMoveRef.current < 16) return;
    lastMoveRef.current = now;
    setCursor({ x: e.clientX, y: e.clientY });
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox="0 0 300 100"
      xmlns="http://www.w3.org/2000/svg"
      onMouseEnter={reduced ? undefined : () => setHovered(true)}
      onMouseLeave={reduced ? undefined : () => setHovered(false)}
      onMouseMove={reduced ? undefined : handleMove}
      className="select-none"
      aria-label={text}
      role="img"
    >
      <defs>
        <linearGradient
          id="textGradient"
          gradientUnits="userSpaceOnUse"
          cx="50%"
          cy="50%"
          r="25%"
        >
          {(hovered || automatic || reduced) && (
            <>
              <stop offset="0%" stopColor="#2457ff" />
              <stop offset="50%" stopColor="#1b3fd1" />
              <stop offset="100%" stopColor="#12b998" />
            </>
          )}
        </linearGradient>

        <motion.radialGradient
          id="revealMask"
          gradientUnits="userSpaceOnUse"
          r="20%"
          initial={{ cx: "50%", cy: "50%" }}
          animate={reduced ? { cx: "50%", cy: "50%" } : maskPosition}
          transition={reduced ? { duration: 0 } : { duration, ease: "easeOut" }}
        >
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="black" />
        </motion.radialGradient>
        <mask id="textMask">
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#revealMask)"
          />
        </mask>
      </defs>

      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth="0.6"
        className="fill-transparent stroke-[#cbd5e1] font-[helvetica] text-7xl font-bold"
        style={{ opacity: hovered ? 0.7 : 0 }}
      >
        {text}
      </text>

      <motion.text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        strokeWidth="0.6"
        className="fill-transparent stroke-[#cbd5e1] font-[helvetica] text-7xl font-bold"
        initial={
          reduced
            ? { strokeDashoffset: 0, strokeDasharray: 1000 }
            : { strokeDashoffset: 1000, strokeDasharray: 1000 }
        }
        animate={{ strokeDashoffset: 0, strokeDasharray: 1000 }}
        transition={reduced ? { duration: 0 } : { duration: 4, ease: "easeInOut" }}
      >
        {text}
      </motion.text>

      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        stroke="url(#textGradient)"
        strokeWidth="0.6"
        mask={reduced ? undefined : "url(#textMask)"}
        className="fill-transparent font-[helvetica] text-7xl font-bold"
      >
        {text}
      </text>
    </svg>
  );
}
