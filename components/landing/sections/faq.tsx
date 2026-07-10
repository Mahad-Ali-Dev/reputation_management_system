"use client";

/**
 * LandingFaq — the "Common questions" FAQ section for the repulabs marketing home.
 *
 * A centered heading + subhead over an animated single-open accordion of five
 * question rows. Each row carries a colour-coded illustration tile (the provided
 * repulabs landing illustrations), a question and a chevron; the answer panel
 * expands / collapses with a smooth motion/react `AnimatePresence` height
 * animation while the chevron rotates. Entrance is a staggered `Reveal` on the
 * header + each row. A "still have questions?" contact affordance closes it out.
 *
 * Brand: repulabs LIGHT — white / very-light-blue surface, blue #2563eb primary,
 * blue→violet heading gradient (to match the mockup), Inter capped at 700. The
 * per-row rainbow accents (violet / blue / green / orange / pink) reproduce the
 * mockup's category colour-coding. Self-contained: renders nothing global and is
 * safe to drop anywhere on the page.
 */

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Reveal, ShinyText } from "@/components/landing/anim";
import { cn } from "@/lib/utils";

const ASSET = "/assets/repulabs/landing/faq";

/* Brand palette — mirrors app/globals.css :root tokens (with brand-hex fallbacks). */
const C = {
  ink: "var(--ink, #0f172a)",
  ink2: "var(--ink-2, #1e293b)",
  mute: "var(--rl-muted, #64748b)",
  answer: "#596783",
  surface: "var(--surface, #ffffff)",
  line: "var(--line, #e8edf5)",
  pri: "var(--pri, #2563eb)",
  pri50: "var(--pri-50, #eff6ff)",
  pri100: "var(--pri-100, #dbeafe)",
  pri700: "var(--pri-700, #1d4ed8)",
  violet: "#7046f7",
} as const;

type Tile =
  | { kind: "img"; src: string; sizePct: number }
  | { kind: "soft"; src: string; bg: string; glow: string; imgPct: number };

type Faq = {
  id: string;
  question: string;
  answer: string;
  /** category accent hex (chevron, open question, open-card tint). */
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
    accent: "#7046f7",
    rgb: "112, 70, 247",
    tile: { kind: "img", src: `${ASSET}/quickly.svg`, sizePct: 133 },
  },
  {
    id: "faq-voice",
    question: "Does the AI actually sound like me?",
    answer:
      "It learns from your past reviews, replies and website, then drafts every response in your brand's tone and vocabulary. You stay in control — approve, tweak or auto-send, and it sharpens with each edit you make.",
    accent: "#176bff",
    rgb: "23, 107, 255",
    tile: { kind: "img", src: `${ASSET}/ai.svg`, sizePct: 133 },
  },
  {
    id: "faq-phone",
    question: "Can I use the AI receptionist with my existing number?",
    answer:
      "Yes. Keep your current number and forward missed or after-hours calls to your AI receptionist, or port it across entirely. It answers 24/7, books jobs and texts callers back — with recording and consent handled to stay compliant.",
    accent: "#16b875",
    rgb: "22, 184, 117",
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
    accent: "#ff8a00",
    rgb: "255, 138, 0",
    tile: { kind: "img", src: `${ASSET}/secure.svg`, sizePct: 120 },
  },
  {
    id: "faq-cancel",
    question: "Can I cancel anytime?",
    answer:
      "Always. There are no lock-in contracts — cancel in one click and keep access until the end of your billing period. Start on a 14-day free trial with no card required, and take your data with you whenever you like.",
    accent: "#f23a86",
    rgb: "242, 58, 134",
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
      style={{ background: "linear-gradient(180deg, #ffffff 0%, #f8faff 60%, #f6f8ff 100%)" }}
    >
      <Decor />

      <div className="relative mx-auto max-w-[1140px] px-5 sm:px-6">
        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4"
              style={{ background: "#eee7ff" }}
            >
              {/* biome-ignore lint/performance/noImgElement: decorative inline SVG asset */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${ASSET}/faq.svg`}
                alt=""
                aria-hidden
                className="max-w-none"
                style={{ width: 44, height: 44, margin: -6 }}
              />
              <ShinyText
                text="FAQ"
                className="text-[15px] font-bold tracking-wide"
              />
            </span>
          </Reveal>

          <Reveal delay={0.05}>
            <h2
              id="faq-heading"
              className="mt-6"
              style={{
                fontSize: "clamp(38px, 6.4vw, 72px)",
                lineHeight: 1.03,
                letterSpacing: "-0.035em",
                fontWeight: 700,
                color: C.ink,
              }}
            >
              Common{" "}
              <span
                style={{
                  backgroundImage: "linear-gradient(96deg, #2563eb 0%, #6d28d9 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                questions.
              </span>
            </h2>
          </Reveal>

          <Reveal delay={0.1}>
            <p
              className="mt-4"
              style={{ fontSize: "clamp(16px, 2.2vw, 22px)", color: "#66708a", lineHeight: 1.5 }}
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
            className="mx-auto mt-10 flex max-w-[1082px] flex-col items-center justify-between gap-4 rounded-2xl border px-6 py-5 sm:flex-row"
            style={{
              borderColor: C.line,
              background: C.surface,
              boxShadow: "0 12px 28px rgba(22, 33, 72, 0.06)",
            }}
          >
            <div className="text-center sm:text-left">
              <div style={{ fontSize: 16.5, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>
                Still have questions?
              </div>
              <div className="mt-0.5" style={{ fontSize: 14, color: C.mute }}>
                Talk to a specialist — no pressure, no sales script.
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2.5">
              <a
                href="/contact"
                className="inline-flex items-center gap-2 rounded-full transition-transform hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  height: 46,
                  padding: "0 22px",
                  background: C.pri,
                  color: "#fff",
                  fontSize: 14.5,
                  fontWeight: 600,
                  boxShadow: "0 12px 26px -10px rgba(37, 99, 235, 0.6)",
                }}
              >
                <ShinyText text="Book a 15-min call" />
                <ArrowRight />
              </a>
              <a
                href="mailto:hello@repulabs.com"
                className="inline-flex items-center rounded-full transition-colors"
                style={{
                  height: 46,
                  padding: "0 20px",
                  background: C.surface,
                  border: `1px solid ${C.line}`,
                  color: C.ink2,
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
        background: open ? `rgba(${faq.rgb}, 0.045)` : C.surface,
        border: `1.5px solid ${open ? `rgba(${faq.rgb}, 0.28)` : "rgba(232, 237, 245, 0.9)"}`,
        boxShadow: open
          ? `0 20px 44px -22px rgba(${faq.rgb}, 0.4)`
          : "0 12px 28px rgba(22, 33, 72, 0.06)",
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
            className="min-w-0 flex-1"
            style={{
              fontSize: "clamp(17px, 2.4vw, 23px)",
              fontWeight: 700,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
              color: open ? faq.accent : "#020a2b",
              transition: "color .3s ease",
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
                  background: `rgba(${faq.rgb}, 0.08)`,
                  border: `1px solid rgba(${faq.rgb}, 0.16)`,
                }}
              >
                <p
                  style={{
                    fontSize: "clamp(15px, 1.9vw, 20px)",
                    lineHeight: 1.55,
                    color: C.answer,
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
            "radial-gradient(closest-side, rgba(112, 70, 247, 0.08), rgba(37, 99, 235, 0.05) 55%, transparent 78%)",
          filter: "blur(6px)",
        }}
      />
      {/* right-side dotted matrix, fading outward */}
      <svg
        className="absolute right-[2%] top-1/2 -translate-y-1/2 opacity-[0.5]"
        width="180"
        height="240"
        viewBox="0 0 180 240"
        fill="none"
      >
        <defs>
          <radialGradient id="faq-dot-fade" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#8b93ff" stopOpacity="0.55" />
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
        className="absolute -left-10 top-1/2 -translate-y-1/2 opacity-[0.35]"
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
            stroke="#c7d2fe"
            strokeWidth="1.5"
            fill="none"
          />
        ))}
      </svg>
    </div>
  );
}
