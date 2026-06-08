"use client";

import createGlobe, { type COBEOptions } from "cobe";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type GlobeMarker = {
  /** [latitude, longitude] */
  location: [number, number];
  /** Marker size (0–1). */
  size?: number;
};

type GlobeProps = {
  /** Teal markers to plot on the royal-blue globe. */
  markers?: GlobeMarker[];
  /** Override any cobe option. */
  config?: Partial<COBEOptions>;
  className?: string;
};

const DEFAULT_MARKERS: GlobeMarker[] = [
  { location: [37.7595, -122.4367], size: 0.06 }, // San Francisco
  { location: [40.7128, -74.006], size: 0.07 }, // New York
  { location: [51.5074, -0.1278], size: 0.06 }, // London
  { location: [52.52, 13.405], size: 0.05 }, // Berlin
  { location: [28.6139, 77.209], size: 0.06 }, // Delhi
  { location: [-33.8688, 151.2093], size: 0.05 }, // Sydney
  { location: [35.6762, 139.6503], size: 0.06 }, // Tokyo
  { location: [-23.5505, -46.6333], size: 0.05 }, // São Paulo
];

export const Globe = ({ markers, config, className }: GlobeProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const pointerInteractionMovement = useRef(0);
  const phiRef = useRef(0);
  const widthRef = useRef(0);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let globe: ReturnType<typeof createGlobe> | null = null;

    const onResize = () => {
      if (canvas) widthRef.current = canvas.offsetWidth;
    };
    window.addEventListener("resize", onResize);
    onResize();

    const resolvedMarkers = (markers ?? DEFAULT_MARKERS).map((m) => ({
      location: m.location,
      size: m.size ?? 0.05,
    }));

    const options = {
      devicePixelRatio: 2,
      width: widthRef.current * 2,
      height: widthRef.current * 2,
      phi: 0,
      theta: 0.25,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      // warm canvas base
      baseColor: [0.94, 0.96, 1],
      // royal blue land glow
      markerColor: [18 / 255, 185 / 255, 152 / 255], // teal markers
      glowColor: [36 / 255 + 0.4, 87 / 255 + 0.4, 1],
      markers: resolvedMarkers,
      onRender: (state: Record<string, number>) => {
        // Auto-rotate only when not dragging and reduced-motion is off.
        if (pointerInteracting.current === null && !reducedRef.current) {
          phiRef.current += 0.003;
        }
        state.phi = phiRef.current + pointerInteractionMovement.current / 200;
        state.width = widthRef.current * 2;
        state.height = widthRef.current * 2;
      },
      ...config,
    };

    globe = createGlobe(canvas, options as unknown as COBEOptions);

    // fade in
    const raf = requestAnimationFrame(() => {
      if (canvas) canvas.style.opacity = "1";
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (globe) globe.destroy();
    };
  }, [markers, config]);

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current;
      pointerInteractionMovement.current = delta;
    }
  };

  return (
    <div
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[600px]",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{
          contain: "layout paint size",
          opacity: 0,
          transition: "opacity 0.6s ease",
          cursor: "grab",
        }}
        onPointerDown={(e) => {
          pointerInteracting.current =
            e.clientX - pointerInteractionMovement.current;
          if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
        }}
        onPointerUp={() => {
          pointerInteracting.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        }}
        onPointerOut={() => {
          pointerInteracting.current = null;
          if (canvasRef.current) canvasRef.current.style.cursor = "grab";
        }}
        onMouseMove={(e) => updateMovement(e.clientX)}
        onTouchMove={(e) => {
          if (e.touches[0]) updateMovement(e.touches[0].clientX);
        }}
      />
    </div>
  );
};
