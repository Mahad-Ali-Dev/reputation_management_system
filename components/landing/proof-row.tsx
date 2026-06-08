"use client";

import { Star } from "lucide-react";
import { AnimatedTooltip } from "@/components/ui/aceternity/animated-tooltip";

const C = {
  ink: "var(--ink, #0f172a)",
  mute: "var(--rl-muted, #64748b)",
} as const;

/**
 * Inline SVG avatar as a data URI so the AnimatedTooltip never shows a broken
 * image and we add no external dependency. Brand-tinted gradient + initials.
 */
function avatar(initials: string, from: string, to: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/>
    </linearGradient></defs>
    <rect width='100' height='100' fill='url(#g)'/>
    <text x='50' y='50' dy='.36em' text-anchor='middle'
      font-family='ui-sans-serif,system-ui,sans-serif' font-size='38' font-weight='700' fill='#ffffff'>${initials}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * ProofRow — a row of overlapping operator/customer avatars with animated
 * tooltips, paired with an aggregate rating. Realistic role descriptions, no
 * fabricated named individuals.
 */
export function ProofRow() {
  const items = [
    {
      id: 1,
      name: "Dental group",
      designation: "Multi-location · 6 clinics",
      image: avatar("DG", "#2563eb", "#1d4ed8"),
    },
    {
      id: 2,
      name: "Family clinic",
      designation: "Front-desk team",
      image: avatar("FC", "#12b998", "#0e9b80"),
    },
    {
      id: 3,
      name: "Restaurant group",
      designation: "Regional · 14 sites",
      image: avatar("RG", "#4f46e5", "#2563eb"),
    },
    {
      id: 4,
      name: "Auto detailing",
      designation: "Owner-operator",
      image: avatar("AD", "#f59e0b", "#ef7c00"),
    },
    {
      id: 5,
      name: "Med spa",
      designation: "Marketing lead",
      image: avatar("MS", "#0ea5e9", "#2563eb"),
    },
    {
      id: 6,
      name: "Home services",
      designation: "Trades · franchise",
      image: avatar("HS", "#16a34a", "#12b998"),
    },
  ];

  return (
    <div className="mt-12 flex flex-col items-center gap-5">
      <AnimatedTooltip items={items} className="justify-center pl-4" />
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-0.5" style={{ color: "#f59e0b" }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} size={16} fill="currentColor" />
          ))}
        </span>
        <span style={{ fontSize: 14, color: C.mute }}>
          <span style={{ fontWeight: 700, color: C.ink }}>4.8/5</span> average
          across 1,200+ local operators
        </span>
      </div>
    </div>
  );
}
