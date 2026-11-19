"use client";

import { cn } from "@/lib/utils";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createNoise3D } from "simplex-noise";

/**
 * Animated wavy canvas background (Aceternity-style "WavyBackground").
 *
 * Adapted from the original snippet with three fixes: the resize handler is a
 * scoped listener (the original overwrote the page's global window.onresize),
 * the noise function is created once instead of on every render, and the
 * animation loop is always cancelled on unmount. Honours prefers-reduced-motion
 * by drawing a single still frame.
 */
export function WavyBackground({
  children,
  className,
  containerClassName,
  colors,
  waveWidth,
  backgroundFill,
  blur = 10,
  speed = "fast",
  waveOpacity = 0.5,
  ...props
}: {
  children?: ReactNode;
  className?: string;
  containerClassName?: string;
  colors?: string[];
  waveWidth?: number;
  backgroundFill?: string;
  blur?: number;
  speed?: "slow" | "fast";
  waveOpacity?: number;
  [key: string]: unknown;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noise = useMemo(() => createNoise3D(), []);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    setIsSafari(navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome"));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const waveColors = colors ?? ["#38bdf8", "#818cf8", "#c084fc", "#e879f9", "#22d3ee"];
    const step = speed === "slow" ? 0.001 : 0.002;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let nt = 0;
    let raf = 0;

    const size = () => {
      w = ctx.canvas.width = window.innerWidth;
      h = ctx.canvas.height = window.innerHeight;
      ctx.filter = `blur(${blur}px)`;
    };

    const drawWave = (n: number) => {
      nt += step;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.lineWidth = waveWidth || 50;
        ctx.strokeStyle = waveColors[i % waveColors.length] ?? "#818cf8";
        for (let x = 0; x < w; x += 5) {
          const y = noise(x / 800, 0.3 * i, nt) * 100;
          ctx.lineTo(x, y + h * 0.5);
        }
        ctx.stroke();
        ctx.closePath();
      }
    };

    const render = () => {
      ctx.fillStyle = backgroundFill || "black";
      ctx.globalAlpha = waveOpacity || 0.5;
      ctx.fillRect(0, 0, w, h);
      drawWave(5);
      if (!still) raf = requestAnimationFrame(render);
    };

    size();
    render();
    window.addEventListener("resize", size);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, [noise, colors, waveWidth, backgroundFill, blur, speed, waveOpacity]);

  return (
    <div className={cn("flex h-screen flex-col items-center justify-center", containerClassName)}>
      <canvas
        className="absolute inset-0 z-0"
        ref={canvasRef}
        style={isSafari ? { filter: `blur(${blur}px)` } : undefined}
      />
      <div className={cn("relative z-10", className)} {...props}>
        {children}
      </div>
    </div>
  );
}
