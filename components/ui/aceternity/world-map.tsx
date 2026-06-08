"use client";

import { motion } from "motion/react";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Coord = { lat: number; lng: number };

type MapDot = {
  start: Coord;
  end: Coord;
};

type WorldMapProps = {
  /** Arc connections drawn between coordinate points. */
  dots?: MapDot[];
  /** Color of the dotted map grid. */
  dotColor?: string;
  /** Gradient start color of the arcs. */
  arcColorFrom?: string;
  /** Gradient end color of the arcs. */
  arcColorTo?: string;
  className?: string;
};

// Equirectangular projection onto an 800x400 viewBox.
const VIEW_W = 800;
const VIEW_H = 400;

function project(lat: number, lng: number) {
  const x = (lng + 180) * (VIEW_W / 360);
  const y = (90 - lat) * (VIEW_H / 180);
  return { x, y };
}

// Land-mass sample points (lat/lng) to render a dotted continental silhouette.
const LAND_REGIONS: Array<{ latMin: number; latMax: number; lngMin: number; lngMax: number }> = [
  { latMin: 25, latMax: 70, lngMin: -125, lngMax: -65 }, // North America
  { latMin: -55, latMax: 12, lngMin: -82, lngMax: -35 }, // South America
  { latMin: 35, latMax: 70, lngMin: -10, lngMax: 40 }, // Europe
  { latMin: -35, latMax: 35, lngMin: -18, lngMax: 50 }, // Africa
  { latMin: 5, latMax: 70, lngMin: 40, lngMax: 145 }, // Asia
  { latMin: -45, latMax: -10, lngMin: 112, lngMax: 154 }, // Australia
];

function buildDots() {
  const dots: Array<{ x: number; y: number }> = [];
  const stepLat = 4;
  const stepLng = 4;
  for (const r of LAND_REGIONS) {
    for (let lat = r.latMin; lat <= r.latMax; lat += stepLat) {
      for (let lng = r.lngMin; lng <= r.lngMax; lng += stepLng) {
        // jitter so the grid reads as organic rather than rectangular
        const jLat = lat + (Math.sin(lng * lat) * stepLat) / 3;
        const jLng = lng + (Math.cos(lng + lat) * stepLng) / 3;
        const { x, y } = project(jLat, jLng);
        dots.push({ x, y });
      }
    }
  }
  return dots;
}

function curvedPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const midX = (start.x + end.x) / 2;
  const midY = Math.min(start.y, end.y) - Math.abs(end.x - start.x) * 0.35;
  return `M ${start.x} ${start.y} Q ${midX} ${midY} ${end.x} ${end.y}`;
}

export const WorldMap = ({
  dots = [],
  dotColor = "rgba(15, 23, 42, 0.18)",
  arcColorFrom = "#2457ff",
  arcColorTo = "#12b998",
  className,
}: WorldMapProps) => {
  const [mounted, setMounted] = useState(false);
  const gradientId = useRef(
    `world-map-arc-${Math.random().toString(36).slice(2, 9)}`,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const landDots = mounted ? buildDots() : [];

  return (
    <div
      className={cn(
        "relative aspect-[2/1] w-full rounded-2xl",
        className,
      )}
      style={{ backgroundColor: "#fbfaf6" }}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="pointer-events-none h-full w-full select-none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId.current} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={arcColorFrom} stopOpacity="0" />
            <stop offset="20%" stopColor={arcColorFrom} stopOpacity="1" />
            <stop offset="80%" stopColor={arcColorTo} stopOpacity="1" />
            <stop offset="100%" stopColor={arcColorTo} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* dotted continents */}
        {landDots.map((d, i) => (
          <circle
            key={`land-${i}`}
            cx={d.x}
            cy={d.y}
            r={1.1}
            fill={dotColor}
          />
        ))}

        {/* arcs */}
        {dots.map((dot, i) => {
          const start = project(dot.start.lat, dot.start.lng);
          const end = project(dot.end.lat, dot.end.lng);
          return (
            <g key={`arc-${i}`}>
              <motion.path
                d={curvedPath(start, end)}
                fill="none"
                stroke={`url(#${gradientId.current})`}
                strokeWidth={1.4}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{
                  duration: 1.4,
                  delay: 0.3 * i,
                  ease: "easeOut",
                  repeat: Infinity,
                  repeatType: "loop",
                  repeatDelay: 1.2,
                }}
              />
              {[start, end].map((p, j) => (
                <g key={`endpoint-${i}-${j}`}>
                  <circle cx={p.x} cy={p.y} r={2.2} fill={arcColorFrom} />
                  <circle cx={p.x} cy={p.y} r={2.2} fill={arcColorFrom} opacity={0.5}>
                    <animate
                      attributeName="r"
                      from="2.2"
                      to="9"
                      dur="1.5s"
                      begin={`${0.3 * i}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.5"
                      to="0"
                      dur="1.5s"
                      begin={`${0.3 * i}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
