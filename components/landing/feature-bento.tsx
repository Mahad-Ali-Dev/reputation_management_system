"use client";

import {
  BarChart3,
  Inbox,
  MessageSquareText,
  Phone,
  QrCode,
  Star,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  BentoGrid,
  BentoGridItem,
} from "@/components/ui/aceternity/bento-grid";

const ART = "/assets/repulabs/illustrations";

type Glyph =
  | "reviews"
  | "phone"
  | "qr"
  | "inbox"
  | "surveys"
  | "analytics"
  | "autopilot";

type Feature = {
  glyph: Glyph;
  file: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  desc: string;
  /** Span two columns on large screens for the hero feature. */
  wide?: boolean;
};

const FEATURES: Feature[] = [
  {
    glyph: "reviews",
    file: "feat-reviews.png",
    icon: <Star size={18} />,
    eyebrow: "REVIEWS",
    title: "Reviews, answered in your voice",
    desc: "Every Google, Facebook and listing review in one feed. The AI drafts a reply trained on your brand guide, service catalog and policies approve and publish in a single click.",
    wide: true,
  },
  {
    glyph: "phone",
    file: "feat-ai-phone.png",
    icon: <Phone size={18} />,
    eyebrow: "AI PHONE",
    title: "AI phone receptionist",
    desc: "Answers every call in a cloned voice and books appointments around the clock.",
  },
  {
    glyph: "qr",
    file: "feat-qr-nfc.png",
    icon: <QrCode size={18} />,
    eyebrow: "QR + NFC",
    title: "QR & NFC review stands",
    desc: "Counter cards and brass plaques that turn one tap into a 5-star review.",
  },
  {
    glyph: "inbox",
    file: "feat-inbox.png",
    icon: <Inbox size={18} />,
    eyebrow: "UNIFIED INBOX",
    title: "One inbox, every channel",
    desc: "Comments, DMs, SMS and live chat from every connected page in a single view.",
  },
  {
    glyph: "surveys",
    file: "feat-surveys.png",
    icon: <MessageSquareText size={18} />,
    eyebrow: "SURVEYS",
    title: "Surveys with smart routing",
    desc: "Happy customers get nudged to public reviews; unhappy ones route privately to you.",
  },
  {
    glyph: "analytics",
    file: "feat-analytics.png",
    icon: <BarChart3 size={18} />,
    eyebrow: "ANALYTICS",
    title: "Reputation analytics",
    desc: "Rating trends, sentiment and channel mix with revenue attribution per location.",
  },
  {
    glyph: "autopilot",
    file: "feat-autopilot.png",
    icon: <Workflow size={18} />,
    eyebrow: "AUTOPILOT",
    title: "Reputation on autopilot",
    desc: "Drag-and-drop rules trigger from your POS or CRM, wait, then send the perfect follow-up.",
  },
];

/**
 * FeatureBento — the 7 product surfaces as a BentoGrid. The hero feature
 * (Reviews) spans two columns; each card uses its feat-*.png as the header
 * image with a graceful blue-tint fallback glyph.
 */
export function FeatureBento() {
  return (
    <BentoGrid className="mt-14 md:auto-rows-[20rem]">
      {FEATURES.map((f) => (
        <BentoGridItem
          key={f.title}
          className={f.wide ? "md:col-span-2" : ""}
          header={
            <FeatureHeader glyph={f.glyph} file={f.file} title={f.title} />
          }
          icon={f.icon}
          title={
            <span className="flex flex-col gap-1">
              <span
                className="text-[10.5px] font-semibold"
                style={{
                  color: "var(--pri-700, #1d4ed8)",
                  fontFamily: "var(--f-mono)",
                  letterSpacing: ".1em",
                }}
              >
                {f.eyebrow}
              </span>
              <span style={{ fontSize: 17, letterSpacing: "-0.02em" }}>
                {f.title}
              </span>
            </span>
          }
          description={f.desc}
        />
      ))}
    </BentoGrid>
  );
}

/** Image header with blue-tint blueprint fallback (matches the illustration kit). */
function FeatureHeader({
  glyph,
  file,
  title,
}: {
  glyph: Glyph;
  file: string;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className="relative w-full flex-1 overflow-hidden rounded-xl"
      style={{
        minHeight: 120,
        backgroundColor: "#f7f8fb",
        backgroundImage:
          "radial-gradient(rgba(37,99,235,.10) 1px, transparent 1px), radial-gradient(120% 120% at 20% 0%, #eff6ff 0%, #f7f8fb 55%, #ffffff 100%)",
        backgroundSize: "18px 18px, cover",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 grid place-items-center transition-opacity duration-300"
        style={{ opacity: loaded && !failed ? 0 : 1 }}
      >
        <FallbackGlyph glyph={glyph} />
      </div>
      {!failed && (
        // biome-ignore lint/performance/noImgElement: needs onError fallback; not a static asset
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${ART}/${file}`}
          alt={`${title} illustration`}
          loading="lazy"
          decoding="async"
          ref={(n) => {
            if (n && n.complete && n.naturalWidth > 0) setLoaded(true);
          }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-contain transition-opacity duration-500"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
    </div>
  );
}

const INK = "#0f172a";
const BLUE = "#2563eb";
const INDIGO = "#4f46e5";
const AMBER = "#f59e0b";

function FallbackGlyph({ glyph }: { glyph: Glyph }) {
  const common: React.SVGProps<SVGSVGElement> = {
    width: "38%",
    height: "38%",
    viewBox: "0 0 120 120",
    fill: "none",
    "aria-hidden": true,
    style: { maxWidth: 160, maxHeight: 160 },
  };
  switch (glyph) {
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
        </svg>
      );
    case "inbox":
      return (
        <svg {...common}>
          <rect x="20" y="30" width="80" height="56" rx="12" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <path d="M20 42l40 24 40-24" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="92" cy="34" r="9" fill={BLUE} stroke={INK} strokeWidth="2" />
        </svg>
      );
    case "surveys":
      return (
        <svg {...common}>
          <rect x="30" y="22" width="60" height="76" rx="10" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <rect x="40" y="34" width="8" height="8" rx="2" fill="#dbeafe" stroke={INK} strokeWidth="2" />
          <rect x="54" y="36" width="26" height="4" rx="2" fill="#eef1f6" />
          <rect x="40" y="50" width="8" height="8" rx="2" fill={BLUE} />
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
        </svg>
      );
    case "autopilot":
      return (
        <svg {...common}>
          <circle cx="60" cy="58" r="34" fill="#fff" stroke={INK} strokeWidth="2.5" />
          <circle cx="60" cy="58" r="20" fill="#eff6ff" stroke={INK} strokeWidth="2" />
          <path d="M60 44v14l10 6" stroke={BLUE} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M60 24v-6M60 98v-6M26 58h-6M100 58h-6" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
