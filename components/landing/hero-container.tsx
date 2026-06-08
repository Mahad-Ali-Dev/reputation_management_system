"use client";

import { ArrowRight, CircleCheck, Star } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { ContainerScroll } from "@/components/ui/aceternity/container-scroll-animation";
import { HeroHighlight, Highlight } from "@/components/ui/aceternity/hero-highlight";

const ART = "/assets/repulabs/illustrations";

/* Brand palette — mirrors app/globals.css :root tokens (with brand-hex fallbacks). */
const C = {
  ink: "var(--ink, #0f172a)",
  ink3: "var(--ink-3, #475569)",
  mute: "var(--rl-muted, #64748b)",
  mute2: "var(--rl-muted-2, #94a3b8)",
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbfd)",
  line: "var(--line, #e2e8f0)",
  line2: "var(--line-2, #cbd5e1)",
  pri: "var(--pri, #2563eb)",
  pri50: "var(--pri-50, #eff6ff)",
  pri100: "var(--pri-100, #dbeafe)",
  pri700: "var(--pri-700, #1d4ed8)",
  ok: "var(--ok, #16a34a)",
} as const;

/**
 * Hero — premium long-form opener.
 *
 * A HeroHighlight headline (one word swept blue→teal) sits above a
 * ContainerScroll device frame that tilts flat as the visitor scrolls,
 * revealing the home-hero illustration (with a rich JSX dashboard fallback so
 * the frame is never empty if the PNG 404s). Dual CTA + trust chips live in the
 * title block. One hero animation — deliberate, not five.
 */
export function HeroContainer() {
  return (
    <section className="relative overflow-hidden">
      {/* soft brand spotlights for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-220px] h-[640px] w-[640px] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(37,99,235,.16) 0%, rgba(18,185,152,.08) 45%, transparent 70%)",
          filter: "blur(8px)",
        }}
      />
      <ContainerScroll
        className="!h-auto !p-0 pb-4 pt-6"
        titleComponent={<HeroTitle />}
      >
        <HeroFrame />
      </ContainerScroll>
    </section>
  );
}

function HeroTitle() {
  return (
    <HeroHighlight
      containerClassName="!h-auto !bg-transparent py-6"
      className="w-full"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 text-center">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold"
          style={{
            borderColor: "var(--pri-100, #dbeafe)",
            background: "var(--pri-50, #eff6ff)",
            color: C.pri700,
            fontFamily: "var(--f-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <span className="relative inline-flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ background: C.pri }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: C.pri }}
            />
          </span>
          Reputation command center
        </span>

        <h1
          className="mt-6"
          style={{
            fontSize: "clamp(36px, 5.6vw, 68px)",
            lineHeight: 1.04,
            letterSpacing: "-0.035em",
            fontWeight: 700,
            color: C.ink,
          }}
        >
          Turn every customer moment into{" "}
          <Highlight className="text-white">reputation growth</Highlight>.
        </h1>

        <p
          className="mx-auto mt-6 max-w-xl"
          style={{ fontSize: 17.5, lineHeight: 1.6, color: C.ink3 }}
        >
          Reviews, requests, a unified inbox, AI replies, surveys, QR stands and
          an AI phone receptionist — one premium workspace for local service
          teams, with every reply in your brand voice.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{
              height: 50,
              padding: "0 26px",
              borderRadius: 999,
              background: C.ink,
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              boxShadow: "0 12px 30px -10px rgba(15,23,42,.5)",
            }}
          >
            Start free
            <ArrowRight size={15} />
          </Link>
          <Link
            href="#features"
            className="inline-flex items-center gap-2 transition-colors hover:bg-white"
            style={{
              height: 50,
              padding: "0 22px",
              borderRadius: 999,
              background: C.surface,
              border: `1px solid ${C.line2}`,
              color: C.ink,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            View product
          </Link>
        </div>

        <div
          className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
          style={{ fontSize: 13, color: C.mute }}
        >
          {["No card required", "Live in 6 minutes", "Cancel anytime"].map(
            (t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CircleCheck size={14} style={{ color: C.pri }} />
                {t}
              </span>
            ),
          )}
        </div>
      </div>
    </HeroHighlight>
  );
}

/** The visual inside the tilted device frame: home-hero.png over a JSX fallback. */
function HeroFrame() {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative h-full w-full">
      <HeroDashboard />
      {!failed && (
        // biome-ignore lint/performance/noImgElement: needs onError fallback; not a static asset
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${ART}/home-hero.png`}
          alt="repulabs reputation command center dashboard"
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

      {/* floating accent stat chip */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 18 }}
        className="absolute bottom-4 left-4 hidden items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 md:flex"
        style={{
          background: C.surface,
          borderColor: C.line,
          boxShadow: "0 18px 40px -18px rgba(15,23,42,.28)",
        }}
        aria-hidden
      >
        <span
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{
            background: C.pri50,
            color: C.pri,
            border: `1px solid ${C.pri100}`,
          }}
        >
          <Star size={16} fill="currentColor" />
        </span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>
            +47
          </div>
          <div style={{ fontSize: 10.5, color: C.mute }}>reviews this month</div>
        </div>
      </motion.div>
    </div>
  );
}

/** JSX dashboard recreation — graceful fallback behind home-hero.png. */
function HeroDashboard() {
  const kpis = [
    { l: "Rating", v: "4.72", d: "+0.18", up: true },
    { l: "Requests", v: "286", d: "62% open" },
    { l: "AI replies", v: "38", d: "3 pending", pri: true },
  ];
  const bars = [34, 40, 38, 52, 48, 60, 57, 70, 66, 82, 88, 96];
  return (
    <div className="h-full w-full overflow-hidden" style={{ background: C.surface }}>
      <div
        className="flex items-center gap-1.5 border-b px-4 py-3"
        style={{ borderColor: C.line, background: C.surface2 }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f87171" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#fbbf24" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} />
        <span
          className="ml-3 text-[10.5px]"
          style={{
            color: C.mute2,
            fontFamily: "var(--f-mono)",
            letterSpacing: ".04em",
          }}
        >
          app.repulabs.com / dashboard
        </span>
      </div>

      <div style={{ padding: 18 }}>
        <div className="grid grid-cols-3 gap-2.5">
          {kpis.map((k) => (
            <div
              key={k.l}
              className="rounded-xl border p-3"
              style={{ borderColor: C.line, background: C.surface2 }}
            >
              <div className="text-[10.5px]" style={{ color: C.mute }}>
                {k.l}
              </div>
              <div
                className="mt-1 flex items-baseline gap-1"
                style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                {k.v}
                {k.pri && (
                  <span
                    className="ml-auto h-1.5 w-1.5 rounded-full"
                    style={{ background: C.pri }}
                  />
                )}
              </div>
              <div
                className="mt-0.5 text-[10.5px]"
                style={{ color: k.up ? C.ok : C.mute, fontWeight: 600 }}
              >
                {k.d}
              </div>
            </div>
          ))}
        </div>

        <div
          className="mt-3 rounded-xl border p-4"
          style={{ borderColor: C.line, background: C.surface }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2, #1e293b)" }}>
              Review growth
            </div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: C.pri50, color: C.pri700 }}
            >
              <span className="h-1 w-1 rounded-full" style={{ background: C.pri }} />
              Live
            </span>
          </div>
          <div className="flex h-[88px] items-end gap-1.5">
            {bars.map((h, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: static chart bars
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${h}%`,
                  background:
                    i >= bars.length - 3
                      ? "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)"
                      : "linear-gradient(180deg, #93c5fd 0%, #dbeafe 100%)",
                }}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {[
            { l: "AI replies", v: "184 sent", c: C.pri },
            { l: "Inbox hub", v: "12 open", c: "var(--info, #0ea5e9)" },
            { l: "QR stands", v: "8 active", c: C.ok },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-xl border p-2.5"
              style={{ borderColor: C.line, background: C.surface2 }}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.c }} />
                <span className="text-[10px]" style={{ color: C.mute }}>
                  {s.l}
                </span>
              </div>
              <div
                className="mt-1 text-[12.5px] font-semibold"
                style={{ color: "var(--ink-2, #1e293b)" }}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
