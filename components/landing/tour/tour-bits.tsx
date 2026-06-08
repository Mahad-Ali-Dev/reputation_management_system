"use client";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { TOUR } from "./tour-theme";

/** Centered section heading with mono kicker + animated reveal. */
export function SectionHeading({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: ReactNode;
  subtitle?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6 }}
      className="mx-auto max-w-[640px] text-center"
    >
      <span
        style={{
          fontFamily: "var(--f-mono, ui-monospace, monospace)",
          fontSize: 11.5,
          letterSpacing: "0.16em",
          fontWeight: 600,
          color: TOUR.blue,
          textTransform: "uppercase",
        }}
      >
        {kicker}
      </span>
      <h2
        className="mt-3"
        style={{
          fontSize: "clamp(28px, 4vw, 46px)",
          lineHeight: 1.06,
          letterSpacing: "-0.03em",
          fontWeight: 600,
          color: TOUR.ink,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p
          className="mx-auto mt-4"
          style={{ fontSize: 16.5, lineHeight: 1.6, color: TOUR.ink2, maxWidth: 540 }}
        >
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

/** Final call-to-action band. */
export function TourCTA() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7 }}
      className="mx-auto max-w-[1080px] px-6 py-20"
    >
      <div
        className="relative overflow-hidden px-8 py-16 text-center md:px-16 md:py-20"
        style={{
          borderRadius: 32,
          background: `linear-gradient(135deg, ${TOUR.blueDeep}, ${TOUR.blue})`,
          boxShadow: `0 40px 90px -40px ${TOUR.blue}aa`,
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(80% 120% at 100% 0%, ${TOUR.teal}55 0%, transparent 50%)`,
            pointerEvents: "none",
          }}
        />
        <h2
          className="relative"
          style={{
            fontSize: "clamp(30px, 4.5vw, 52px)",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            fontWeight: 600,
            color: "#fff",
          }}
        >
          Ready to run your reputation
          <br className="hidden sm:block" /> on autopilot?
        </h2>
        <p
          className="relative mx-auto mt-5"
          style={{ fontSize: 17, lineHeight: 1.6, color: "rgba(255,255,255,.88)", maxWidth: 520 }}
        >
          Set it up in an afternoon. Free for 14 days, no card required.
        </p>
        <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 transition-transform active:translate-y-px"
            style={{
              height: 50,
              padding: "0 26px",
              borderRadius: 999,
              background: "#fff",
              color: TOUR.blueDeep,
              fontSize: 15.5,
              fontWeight: 700,
              boxShadow: "0 18px 40px -16px rgba(0,0,0,.5)",
            }}
          >
            Start free trial
            <ArrowRight size={17} />
          </Link>
          <Link
            href="/#pricing"
            className="inline-flex items-center gap-2 transition-colors"
            style={{
              height: 50,
              padding: "0 24px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,.4)",
              color: "#fff",
              fontSize: 15.5,
              fontWeight: 600,
            }}
          >
            See pricing
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
