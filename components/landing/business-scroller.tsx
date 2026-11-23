/**
 * BusinessScroller — two endlessly scrolling rows of the business types
 * repulabs is built for (top row left, bottom row right), fading out at both
 * edges.
 *
 * Adapted from a community "brand scroller", restyled for repulabs:
 *   - business types with lucide icons (already installed) instead of
 *     react-icons brand logos, so no new dependency
 *   - brand-blue icons and muted-ink labels in the landing's --f-ui font
 *   - auto-width items (the original fixed w-28 clipped longer labels)
 *   - self-contained keyframes (the original relied on `animate-marquee`
 *     utilities this project's Tailwind config doesn't define)
 *   - pauses on hover, stops for prefers-reduced-motion, and the duplicate
 *     loop copies are hidden from screen readers
 */

import type { CSSProperties } from "react";
import {
  Car,
  Coffee,
  Dumbbell,
  Hammer,
  House,
  type LucideIcon,
  PawPrint,
  Scale,
  Scissors,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  UtensilsCrossed,
} from "lucide-react";

const PRI = "#2563eb";
const MUTE = "#5b6473";
const FADE = "linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)";

type Business = { label: string; Icon: LucideIcon };

const ROW_A: Business[] = [
  { label: "Restaurants", Icon: UtensilsCrossed },
  { label: "Dental clinics", Icon: Stethoscope },
  { label: "Salons & spas", Icon: Scissors },
  { label: "Gyms & studios", Icon: Dumbbell },
  { label: "Cafés", Icon: Coffee },
  { label: "Law firms", Icon: Scale },
];

const ROW_B: Business[] = [
  { label: "Auto shops", Icon: Car },
  { label: "Real estate", Icon: House },
  { label: "Med spas", Icon: Sparkles },
  { label: "Home services", Icon: Hammer },
  { label: "Veterinary", Icon: PawPrint },
  { label: "Retail", Icon: ShoppingBag },
];

const CSS = `
@keyframes rl-brand-marquee { from { transform: translateX(0); } to { transform: translateX(calc(-100% - var(--gap))); } }
.rl-brand-track { animation: rl-brand-marquee var(--duration) linear infinite; }
.rl-brand-track[data-reverse] { animation-direction: reverse; }
.rl-brand-row:hover .rl-brand-track { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) { .rl-brand-track { animation: none; } }
`;

function Row({ items, reverse = false }: { items: Business[]; reverse?: boolean }) {
  return (
    <div
      className="rl-brand-row flex overflow-hidden py-2"
      style={
        {
          "--gap": "2.75rem",
          "--duration": "40s",
          gap: "var(--gap)",
          maskImage: FADE,
          WebkitMaskImage: FADE,
        } as CSSProperties
      }
    >
      {/* four identical copies; each slides by its own width + gap, so the loop is seamless */}
      {Array.from({ length: 4 }, (_, copy) => (
        <ul
          key={copy}
          aria-hidden={copy > 0 || undefined}
          data-reverse={reverse || undefined}
          className="rl-brand-track flex shrink-0 items-center justify-around"
          style={{ gap: "var(--gap)" }}
        >
          {items.map(({ label, Icon }) => (
            <li key={label} className="flex items-center gap-2.5 whitespace-nowrap">
              <Icon size={20} strokeWidth={1.9} style={{ color: PRI }} />
              <span className="text-[15.5px] font-semibold" style={{ color: MUTE }}>
                {label}
              </span>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

export function BusinessScroller() {
  return (
    <div className="flex flex-col gap-2">
      <style>{CSS}</style>
      <Row items={ROW_A} />
      <Row items={ROW_B} reverse />
    </div>
  );
}

export default BusinessScroller;
