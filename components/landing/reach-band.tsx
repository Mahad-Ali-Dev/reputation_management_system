"use client";

import { MapPin } from "lucide-react";
import { motion } from "motion/react";
import { WorldMap } from "@/components/ui/aceternity/world-map";

const C = {
  ink: "var(--ink, #0f172a)",
  mute: "var(--rl-muted, #64748b)",
  surface: "var(--surface, #ffffff)",
  line: "var(--line, #e2e8f0)",
  pri: "var(--pri, #2563eb)",
  pri700: "var(--pri-700, #1d4ed8)",
} as const;

/**
 * ReachBand — "works everywhere local" map band. Animated arcs connect a
 * handful of metro pairs to convey multi-location, anywhere-local coverage
 * without claiming specific customer cities.
 */
export function ReachBand() {
  const dots = [
    { start: { lat: 40.71, lng: -74.0 }, end: { lat: 51.51, lng: -0.13 } }, // NYC -> London
    { start: { lat: 34.05, lng: -118.24 }, end: { lat: 40.71, lng: -74.0 } }, // LA -> NYC
    { start: { lat: 51.51, lng: -0.13 }, end: { lat: -33.87, lng: 151.21 } }, // London -> Sydney
    { start: { lat: 1.35, lng: 103.82 }, end: { lat: -33.87, lng: 151.21 } }, // Singapore -> Sydney
    { start: { lat: 19.43, lng: -99.13 }, end: { lat: 34.05, lng: -118.24 } }, // Mexico City -> LA
  ];

  return (
    <div className="mx-auto mt-12 max-w-[1080px]">
      <div
        className="overflow-hidden rounded-3xl border p-4 sm:p-8"
        style={{
          borderColor: C.line,
          background:
            "radial-gradient(120% 120% at 50% 0%, #f0f5ff 0%, #fbfaf6 60%, #ffffff 100%)",
          boxShadow: "0 28px 70px -36px rgba(15,23,42,.28)",
        }}
      >
        <WorldMap dots={dots} className="!bg-transparent" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-2 grid gap-3 sm:grid-cols-3"
        >
          {[
            { v: "30+", l: "countries served" },
            { v: "12", l: "languages, in your voice" },
            { v: "1 workspace", l: "for every location" },
          ].map((s) => (
            <div
              key={s.l}
              className="flex items-center gap-3 rounded-2xl border px-4 py-3.5"
              style={{ borderColor: C.line, background: C.surface }}
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-xl"
                style={{
                  background: "var(--pri-50, #eff6ff)",
                  color: C.pri,
                  border: "1px solid var(--pri-100, #dbeafe)",
                }}
              >
                <MapPin size={16} />
              </span>
              <div>
                <div
                  style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink }}
                >
                  {s.v}
                </div>
                <div style={{ fontSize: 12, color: C.mute }}>{s.l}</div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
