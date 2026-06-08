"use client";

import { useState } from "react";

/**
 * PremiumIllustration — renders a marketing illustration PNG with a GRACEFUL
 * FALLBACK so the page looks finished even before the founder's generated
 * art lands.
 *
 * The fallback is a tasteful blue-tint gradient block + an inline SVG glyph
 * styled to match the existing illustration kit (#eff6ff fills, #0f172a ink
 * strokes, #2563eb accents). The actual PNG fades in over the fallback once it
 * successfully loads; if it 404s, the `onError` handler keeps the fallback
 * visible and never shows a broken-image icon.
 *
 * Why a client island: app/page.tsx must stay a server component, but a truly
 * graceful image fallback needs an `onError` handler (client-only). Isolating
 * that here keeps the page server-rendered while the image degrades cleanly.
 *
 * No layout shift: the container reserves the aspect box; the PNG is absolutely
 * positioned over the fallback.
 */

type Glyph =
  | "hero"
  | "reviews"
  | "phone"
  | "qr"
  | "inbox"
  | "surveys"
  | "analytics"
  | "autopilot";

const INK = "#0f172a";
const BLUE = "#2563eb";
const INDIGO = "#4f46e5";
const AMBER = "#f59e0b";
const GREEN = "#16a34a";

/** Inline glyphs — flat, 2px ink stroke, blue-tint fills (match the SVG kit). */
function FallbackGlyph({ glyph }: { glyph: Glyph }) {
  const common: React.SVGProps<SVGSVGElement> = {
    width: "46%",
    height: "46%",
    viewBox: "0 0 120 120",
    fill: "none",
    "aria-hidden": true,
    style: { maxWidth: 220, maxHeight: 220 },
  };

  switch (glyph) {
    case "hero":
      return (
        <svg {...common} viewBox="0 0 140 120">
          <rect x="14" y="20" width="86" height="62" rx="10" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <rect x="24" y="30" width="40" height="7" rx="3.5" fill="#dbeafe" />
          <rect x="24" y="44" width="66" height="4" rx="2" fill="#eef1f6" />
          <rect x="24" y="53" width="54" height="4" rx="2" fill="#eef1f6" />
          <path d="M26 74l13-13 11 8 17-22" stroke={BLUE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="80" y="58" width="46" height="46" rx="12" fill="#eff6ff" stroke={INK} strokeWidth="2.5" />
          <path d="M103 70l3.4 6.9 7.6 1.1-5.5 5.4 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.4 7.6-1.1L103 70Z" fill={AMBER} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="20" cy="100" r="3.5" fill={GREEN} />
          <circle cx="120" cy="30" r="3.5" fill={INDIGO} />
        </svg>
      );
    case "reviews":
      return (
        <svg {...common}>
          <rect x="20" y="26" width="80" height="56" rx="12" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <path d="M36 96l-2-12 14-2" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M60 40l4 8.5 9.4 1.3-6.8 6.6 1.6 9.3L60 70.9 51.8 75.7l1.6-9.3-6.8-6.6 9.4-1.3L60 40Z" fill={AMBER} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="100" cy="30" r="4" fill={BLUE} />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <rect x="40" y="20" width="40" height="74" rx="10" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <rect x="48" y="30" width="24" height="40" rx="4" fill="#eff6ff" />
          <path d="M52 48l5 5 11-13" stroke={BLUE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="60" cy="82" r="4" fill="#dbeafe" stroke={INK} strokeWidth="2" />
          <path d="M86 40c8 0 8 12 0 12" stroke={INDIGO} strokeWidth="3" strokeLinecap="round" />
          <path d="M92 32c14 0 14 28 0 28" stroke={BLUE} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "qr":
      return (
        <svg {...common}>
          <rect x="26" y="26" width="68" height="68" rx="12" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <rect x="38" y="38" width="16" height="16" rx="3" fill={INK} />
          <rect x="66" y="38" width="16" height="16" rx="3" fill={INK} />
          <rect x="38" y="66" width="16" height="16" rx="3" fill={INK} />
          <rect x="68" y="68" width="12" height="12" rx="3" fill={BLUE} />
          <circle cx="60" cy="60" r="6" fill="#fff" stroke={INK} strokeWidth="2" />
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <rect x="20" y="30" width="80" height="56" rx="12" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <path d="M20 42l40 24 40-24" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="92" cy="34" r="9" fill={BLUE} stroke={INK} strokeWidth="2" />
          <path d="M88 34h8M92 30v8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "surveys":
      return (
        <svg {...common}>
          <rect x="30" y="22" width="60" height="76" rx="10" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <rect x="40" y="34" width="8" height="8" rx="2" fill="#dbeafe" stroke={INK} strokeWidth="2" />
          <rect x="54" y="36" width="26" height="4" rx="2" fill="#eef1f6" />
          <rect x="40" y="50" width="8" height="8" rx="2" fill={BLUE} />
          <path d="M41 54l1.6 1.6 3-3.4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="54" y="52" width="26" height="4" rx="2" fill="#eef1f6" />
          <rect x="40" y="66" width="8" height="8" rx="2" fill="#dbeafe" stroke={INK} strokeWidth="2" />
          <rect x="54" y="68" width="20" height="4" rx="2" fill="#eef1f6" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...common}>
          <rect x="20" y="24" width="80" height="62" rx="12" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <rect x="32" y="58" width="9" height="16" rx="2" fill="#dbeafe" />
          <rect x="48" y="48" width="9" height="26" rx="2" fill="#93c5fd" />
          <rect x="64" y="40" width="9" height="34" rx="2" fill={BLUE} />
          <rect x="80" y="52" width="9" height="22" rx="2" fill="#dbeafe" />
          <path d="M32 44l16-8 16 6 16-12" stroke={INDIGO} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "autopilot":
      return (
        <svg {...common}>
          <circle cx="60" cy="58" r="34" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <circle cx="60" cy="58" r="20" fill="#eff6ff" stroke={INK} strokeWidth="2" />
          <path d="M60 44v14l10 6" stroke={BLUE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M60 24v-6M60 98v-6M26 58h-6M100 58h-6" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M98 30l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L90 37l6-1 2-6Z" fill={AMBER} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export function PremiumIllustration({
  src,
  alt,
  glyph,
  className,
  ratio = "4 / 3",
  rounded = 16,
  /** Soft inner padding around the image so it never bleeds to the edge. */
  pad = 0,
  /** Use the brighter blue-tint fallback (feature cards) vs subtle (hero). */
  tone = "tint",
}: {
  src: string;
  alt: string;
  glyph: Glyph;
  className?: string;
  ratio?: string;
  rounded?: number;
  pad?: number;
  tone?: "tint" | "subtle";
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fallbackBg =
    tone === "tint"
      ? "radial-gradient(120% 120% at 20% 0%, #eff6ff 0%, #f7f8fb 55%, #ffffff 100%)"
      : "radial-gradient(120% 120% at 50% 0%, #f0f5ff 0%, #f7f8fb 60%, #ffffff 100%)";

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: ratio,
        borderRadius: rounded,
        overflow: "hidden",
        background: fallbackBg,
        // Decorative dotted blueprint behind the glyph for depth.
        backgroundImage:
          tone === "tint"
            ? "radial-gradient(rgba(37,99,235,.10) 1px, transparent 1px), radial-gradient(120% 120% at 20% 0%, #eff6ff 0%, #f7f8fb 55%, #ffffff 100%)"
            : "radial-gradient(rgba(37,99,235,.08) 1px, transparent 1px), radial-gradient(120% 120% at 50% 0%, #f0f5ff 0%, #f7f8fb 60%, #ffffff 100%)",
        backgroundSize: "18px 18px, cover",
      }}
    >
      {/* Fallback glyph layer (always rendered; hidden once PNG loads). */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          opacity: loaded && !failed ? 0 : 1,
          transition: "opacity .4s ease",
        }}
      >
        <FallbackGlyph glyph={glyph} />
      </div>

      {/* The real PNG. If it 404s, onError keeps the fallback visible. */}
      {!failed && (
        // biome-ignore lint/performance/noImgElement: needs onError fallback; not a static asset
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          ref={(n) => {
            if (n && n.complete && n.naturalWidth > 0) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{
            position: "absolute",
            inset: pad,
            width: pad ? `calc(100% - ${pad * 2}px)` : "100%",
            height: pad ? `calc(100% - ${pad * 2}px)` : "100%",
            objectFit: "contain",
            opacity: loaded ? 1 : 0,
            transition: "opacity .5s ease",
          }}
        />
      )}
    </div>
  );
}

/**
 * PremiumImageOverlay — renders a marketing PNG on top of an arbitrary
 * `fallback` node (e.g. the hero's JSX dashboard recreation). If the PNG loads
 * it fades in over the fallback; if it 404s the fallback stays put. Used for
 * the hero where the graceful fallback is a rich component, not a glyph.
 */
export function PremiumImageOverlay({
  src,
  alt,
  fallback,
}: {
  src: string;
  alt: string;
  fallback: React.ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      {fallback}
      {!failed && (
        // biome-ignore lint/performance/noImgElement: needs onError fallback; not a static asset
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          decoding="async"
          ref={(n) => {
            if (n && n.complete && n.naturalWidth > 0) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "top center",
            opacity: loaded ? 1 : 0,
            transition: "opacity .5s ease",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
}
