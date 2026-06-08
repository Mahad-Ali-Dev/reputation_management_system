"use client";

import { ArrowRight, ArrowUpRight, CircleCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { BackgroundBeamsWithCollision } from "@/components/ui/aceternity/background-beams-with-collision";

const C = {
  ink: "var(--ink, #0f172a)",
  mute: "var(--rl-muted, #64748b)",
  surface: "var(--surface, #ffffff)",
  line2: "var(--line-2, #cbd5e1)",
  pri700: "var(--pri-700, #1d4ed8)",
} as const;

/**
 * FinalCtaBeams — closing CTA on top of the collision beams background. Brand
 * beams fall and burst against the baseline behind a clean, high-contrast
 * conversion block.
 */
export function FinalCtaBeams() {
  return (
    <BackgroundBeamsWithCollision className="!h-auto !rounded-3xl px-6 py-20 sm:py-24">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold"
          style={{
            borderColor: "var(--pri-100, #dbeafe)",
            background: "var(--pri-50, #eff6ff)",
            color: C.pri700,
            fontFamily: "var(--f-mono)",
            letterSpacing: ".1em",
          }}
        >
          <Sparkles size={11} /> GET STARTED
        </span>

        <h2
          className="mt-6"
          style={{
            fontSize: "clamp(32px, 5.2vw, 56px)",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            color: C.ink,
          }}
        >
          The reputation command center{" "}
          <span
            style={{
              background: "linear-gradient(90deg, #2457ff, #12b998)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            your business deserves.
          </span>
        </h2>

        <p
          className="mx-auto mt-5 max-w-lg"
          style={{ fontSize: 16.5, color: C.mute, lineHeight: 1.6 }}
        >
          Start free, connect your first channel in minutes, and let the AI
          handle the busywork — in your voice.
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
              fontWeight: 700,
              boxShadow: "0 14px 30px -10px rgba(15,23,42,.45)",
            }}
          >
            Start free
            <ArrowRight size={15} />
          </Link>
          <Link
            href="mailto:sales@repulabs.com"
            className="inline-flex items-center gap-2 transition-colors hover:bg-white"
            style={{
              height: 50,
              padding: "0 22px",
              borderRadius: 999,
              background: C.surface,
              color: C.ink,
              border: `1px solid ${C.line2}`,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Book a demo
            <ArrowUpRight size={15} />
          </Link>
        </div>

        <div
          className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
          style={{ fontSize: 12.5, color: C.mute }}
        >
          {["No card required", "Live in 6 minutes", "Cancel anytime"].map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <CircleCheck size={13} style={{ color: "var(--pri, #2563eb)" }} />
              {t}
            </span>
          ))}
        </div>
      </div>
    </BackgroundBeamsWithCollision>
  );
}
