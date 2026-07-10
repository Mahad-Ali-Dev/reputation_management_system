"use client";

/**
 * LandingFaq — the "Common questions" FAQ section for the repulabs marketing home.
 *
 * A centered heading + subhead over an animated single-open accordion of five
 * question rows, restyled for the ONE dark cinematic canvas (#070b16). Each row
 * is a dark glass card carrying a colour-coded illustration tile (the provided
 * repulabs landing illustrations), a white question and an accent chevron; the
 * answer panel expands / collapses with a smooth motion/react `AnimatePresence`
 * height animation while the chevron rotates. Entrance is a staggered `Reveal`
 * on the header + each row. A dark "still have questions?" contact affordance
 * closes it out.
 *
 * Brand: dark canvas — glass rows rgba(255,255,255,0.04) with white/9 borders
 * (open row border cyan/25), white questions, #9db0d6 answers, Inter ≤700. The
 * per-row rainbow accents (violet / blue / green / orange / pink) colour the
 * chevrons, tiles and answer tint. Self-contained: renders nothing global and
 * is safe to drop anywhere on the page.
 */

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Reveal, ShinyText } from "@/components/landing/anim";

const ASSET = "/assets/repulabs/landing/faq";

/* Dark-canvas palette — mirrors the landing dark design system. */
const C = {
  body: "#9db0d6",
  muted: "#6b7ba3",
  chip: "#cdd8f2",
  glass: "rgba(255,255,255,0.04)",
  line: "rgba(255,255,255,0.09)",
  lineOpen: "rgba(34, 211, 238, 0.25)",
} as const;

type Tile =
  | { kind: "img"; src: string; sizePct: number }
  | { kind: "soft"; src: string; bg: string; glow: string; imgPct: number };

type Faq = {
  id: string;
  question: string;
  answer: string;
  /** category accent hex (chevron + answer border tint). */
  accent: string;
  /** accent as "r, g, b" for translucent tints. */
  rgb: string;
  tile: Tile;
};

const FAQS: Faq[] = [
  {
    id: "faq-setup",
    question: "How quickly can I set up repulabs?",
    answer:
      "Most teams are sending automated requests within 6 minutes. Connect Google Business, plug in one POS or CRM, and the wizard does the rest.",
    accent: "#9f7bff",
    rgb: "137, 100, 255",
    tile: { kind: "img", src: `${ASSET}/quickly.svg`, sizePct: 133 },
  },
  {
    id: "faq-voice",
    question: "Does the AI actually sound like me?",
    answer:
      "It learns from your past reviews, replies and website, then drafts every response in your brand's tone and vocabulary. You stay in control — approve, tweak or auto-send, and it sharpens with each edit you make.",
    accent: "#5b9dff",
    rgb: "75, 137, 255",
    tile: { kind: "img", src: `${ASSET}/ai.svg`, sizePct: 133 },
  },
  {
    id: "faq-phone",
    question: "Can I use the AI receptionist with my existing number?",
    answer:
      "Yes. Keep your current number and forward missed or after-hours calls to your AI receptionist, or port it across entirely. It answers 24/7, books jobs and texts callers back — with recording and consent handled to stay compliant.",
    accent: "#34d8a0",
    rgb: "34, 200, 140",
    tile: {
      kind: "soft",
      src: `${ASSET}/phone-icon.svg`,
      bg: "linear-gradient(160deg, #e9fbf1 0%, #d3f5e2 100%)",
      glow: "0 12px 24px -10px rgba(22, 184, 117, 0.45)",
      imgPct: 82,
    },
  },
  {
    id: "faq-security",
    question: "Is my customer data secure?",
    answer:
      "Every record is encrypted in transit and at rest, isolated per workspace with role-based access, and hosted on SOC 2-aligned infrastructure. We never sell your data or train shared models on it, and you can export or delete it anytime.",
    accent: "#ffa552",
    rgb: "255, 150, 60",
    tile: { kind: "img", src: `${ASSET}/secure.svg`, sizePct: 120 },
  },
  {
    id: "faq-cancel",
    question: "Can I cancel anytime?",
    answer:
      "Always. There are no lock-in contracts — cancel in one click and keep access until the end of your billing period. Start on a 14-day free trial with no card required, and take your data with you whenever you like.",
    accent: "#ff6aa5",
    rgb: "255, 92, 150",
    tile: { kind: "img", src: `${ASSET}/cancel.svg`, sizePct: 135 },
  },
];

const EASE = [0.16, 1, 0.3, 1] as const;

export function LandingFaq() {
  // Single-open accordion; the fast-setup answer is open by default (matches mockup).
  const [openId, setOpenId] = useState<string>("faq-setup");

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="relative overflow-hidden py-20 sm:py-24"
      style={{ background: "#070b16" }}
    >
      <Decor />

      <div className="relative mx-auto max-w-[1140px] px-5 sm:px-6">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Reveal>
            <ShinyText
              text="✦ FAQ"
              className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#22d3ee]"
            />
          </Reveal>

          <Reveal delay={0.05}>
            <h2
              id="faq-heading"
              className="mt-5 text-white"
              style={{
                fontSize: "clamp(38px, 6.4vw, 68px)",
                lineHeight: 1.03,
                letterSpacing: "-0.02em",
                fontWeight: 700,
              }}
            >
              Common{" "}
              <span className="bg-gradient-to-r from-[#6d8bff] to-[#a855f7] bg-clip-text text-transparent">
                questions.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.1}>
            <p
              className="mt-4"
              style={{ fontSize: "clamp(16px, 2.2vw, 21px)", color: C.body, lineHeight: 1.5 }}
            >
              Everything you need to know about repulabs.
            </p>
          </Reveal>
        </div>

        {/* ── Accordion ─────────────────────────────────────────── */}
        <div className="mx-auto mt-12 flex max-w-[1082px] flex-col gap-3.5 sm:mt-14">
          {FAQS.map((faq, i) => (
            <Reveal key={faq.id} delay={0.14 + i * 0.07}>
              <FaqItem
                faq={faq}
                open={openId === faq.id}
                onToggle={() => setOpenId((cur) => (cur === faq.id ? "" : faq.id))}
              />
            </Reveal>
          ))}
        </div>

        {/* ── Still-have-questions affordance ───────────────────── */}
        <Reveal delay={0.2}>
          <div
            className="mx-auto mt-10 flex max-w-[1082px] flex-col items-center justify-between gap-4 rounded-2xl px-6 py-5 sm:flex-row"
            style={{
              background: C.glass,
              border: `1px solid ${C.line}`,
            }}
          >
            <div className="text-center sm:text-left">
              <div
                className="text-white"
                style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.01em" }}
              >
                Still have questions?
              </div>
              <div className="mt-0.5" style={{ fontSize: 14, color: C.body }}>
                Talk to a specialist — no pressure, no sales script.
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2.5">
              <a
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  height: 46,
                  padding: "0 22px",
                  background: "linear-gradient(90deg, #4f46e5, #7c3aed)",
                  fontSize: 14.5,
                  fontWeight: 600,
                  boxShadow: "0 14px 40px -8px rgba(99,102,241,0.65)",
                }}
              >
                <ShinyText text="Book a 15-min call" />
                <ArrowRight />
              </a>
              <a
                href="mailto:hello@repulabs.com"
                className="inline-flex items-center rounded-full text-white transition-colors hover:bg-white/10"
                style={{
                  height: 46,
                  padding: "0 20px",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.28)",
                  fontSize: 14.5,
                  fontWeight: 600,
                }}
              >
                Message the team
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────────────────────── Accordion item ─────────────────────────── */

function FaqItem({
  faq,
  open,
  onToggle,
}: {
  faq: Faq;
  open: boolean;
  onToggle: () => void;
}) {
  const panelId = `${faq.id}-panel`;
  const btnId = `${faq.id}-btn`;

  return (
    <div
      className="overflow-hidden rounded-[18px]"
      style={{
        background: open ? `rgba(${faq.rgb}, 0.06)` : C.glass,
        border: `1px solid ${open ? C.lineOpen : C.line}`,
        boxShadow: open ? `0 24px 60px -32px rgba(${faq.rgb}, 0.35)` : "none",
        transition: "background .35s ease, border-color .35s ease, box-shadow .35s ease",
      }}
    >
      <h3 style={{ margin: 0 }}>
        <button
          id={btnId}
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="group flex w-full items-center gap-4 px-4 py-3.5 text-left sm:gap-5 sm:px-5 sm:py-4"
          style={{ background: "transparent", cursor: "pointer" }}
        >
          <TileIcon tile={faq.tile} />

          <span
            className="min-w-0 flex-1 text-white"
            style={{
              fontSize: "clamp(17px, 2.4vw, 22px)",
              fontWeight: 700,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
            }}
          >
            {faq.question}
          </span>

          <motion.span
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="grid h-8 w-8 flex-shrink-0 place-items-center"
            style={{ color: faq.accent }}
          >
            <Chevron />
          </motion.span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            id={panelId}
            role="region"
            aria-labelledby={btnId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.34, ease: EASE },
              opacity: { duration: open ? 0.28 : 0.16, ease: "easeOut" },
            }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-4 pb-4 sm:px-5 sm:pb-5">
              <div
                className="rounded-[15px] px-5 py-4 sm:px-6 sm:py-[18px]"
                style={{
                  background: `rgba(${faq.rgb}, 0.09)`,
                  border: `1px solid rgba(${faq.rgb}, 0.2)`,
                }}
              >
                <p
                  style={{
                    fontSize: "clamp(15px, 1.9vw, 19px)",
                    lineHeight: 1.55,
                    color: C.body,
                    margin: 0,
                  }}
                >
                  {faq.answer}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── Icon tile ─────────────────────────── */

function TileIcon({ tile }: { tile: Tile }) {
  if (tile.kind === "soft") {
    return (
      <span
        className="grid h-[52px] w-[52px] flex-shrink-0 place-items-center rounded-[15px] sm:h-[60px] sm:w-[60px]"
        style={{ background: tile.bg, boxShadow: tile.glow }}
      >
        {/* biome-ignore lint/performance/noImgElement: decorative inline SVG asset */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tile.src}
          alt=""
          aria-hidden
          className="max-w-none"
          style={{ width: `${tile.imgPct}%`, height: `${tile.imgPct}%` }}
        />
      </span>
    );
  }
  return (
    <span className="relative grid h-[52px] w-[52px] flex-shrink-0 place-items-center sm:h-[60px] sm:w-[60px]">
      {/* biome-ignore lint/performance/noImgElement: decorative inline SVG asset */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tile.src}
        alt=""
        aria-hidden
        className="max-w-none"
        style={{ width: `${tile.sizePct}%`, height: `${tile.sizePct}%` }}
      />
    </span>
  );
}

/* ─────────────────────────── Glyphs ─────────────────────────── */

function Chevron() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/* ─────────────────────────── Decorative background ─────────────────────────── */

function Decor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* soft violet haze behind the accordion */}
      <div
        className="absolute left-1/2 top-[6%] h-[420px] w-[820px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(112, 70, 247, 0.12), rgba(59, 90, 255, 0.07) 55%, transparent 78%)",
          filter: "blur(6px)",
        }}
      />
      {/* right-side dotted matrix, fading outward */}
      <svg
        className="absolute right-[2%] top-1/2 -translate-y-1/2 opacity-[0.4]"
        width="180"
        height="240"
        viewBox="0 0 180 240"
        fill="none"
      >
        <defs>
          <radialGradient id="faq-dot-fade" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#8b93ff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8b93ff" stopOpacity="0" />
          </radialGradient>
          <pattern id="faq-dots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2.5" cy="2.5" r="2.5" fill="url(#faq-dot-fade)" />
          </pattern>
        </defs>
        <rect width="180" height="240" fill="url(#faq-dots)" />
      </svg>
      {/* left-side faint contour sweep */}
      <svg
        className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-[0.16]"
        width="260"
        height="420"
        viewBox="0 0 260 420"
        fill="none"
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative contour lines
            key={i}
            d={`M-20 ${360 - i * 34} C 60 ${300 - i * 34}, 120 ${240 - i * 30}, 260 ${170 - i * 26}`}
            stroke="#7c8bff"
            strokeWidth="1.5"
            fill="none"
          />
        ))}
      </svg>
    </div>
  );
}
