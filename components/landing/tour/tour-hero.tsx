"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { ILLO, TOUR } from "./tour-theme";

/**
 * Opening beat of the product tour — animated kicker, headline, dual CTA and a
 * floating hero illustration. Self-contained client island.
 */
export function TourHero() {
  return (
    <section
      style={{
        position: "relative",
        background: `radial-gradient(120% 80% at 50% -10%, ${TOUR.blue}14 0%, transparent 55%), ${TOUR.canvas}`,
        overflow: "hidden",
      }}
    >
      <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-6 pb-16 pt-20 md:grid-cols-[1.05fr_1fr] md:pb-24 md:pt-28">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              border: `1px solid ${TOUR.blue}33`,
              background: `${TOUR.blue}0d`,
              color: TOUR.blueDeep,
              fontSize: 11.5,
              fontFamily: "var(--f-mono, ui-monospace, monospace)",
              letterSpacing: "0.14em",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            <Sparkles size={13} />
            The guided product tour
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-5"
            style={{
              fontSize: "clamp(36px, 6vw, 68px)",
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              fontWeight: 600,
              color: TOUR.ink,
            }}
          >
            Every star, review and
            <br />
            conversation{" "}
            <span
              style={{
                background: `linear-gradient(100deg, ${TOUR.blue}, ${TOUR.teal})`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              on autopilot.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-6"
            style={{ fontSize: 18, lineHeight: 1.6, color: TOUR.ink2, maxWidth: 520 }}
          >
            Scroll through the whole platform in two minutes. Reviews, an AI phone
            receptionist, QR plaques, a unified inbox, surveys, analytics and
            autopilot, one calm operating system for your reputation.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link
              href="/login"
              className="inline-flex items-center gap-2 transition-transform active:translate-y-px"
              style={{
                height: 48,
                padding: "0 22px",
                borderRadius: 999,
                background: TOUR.blue,
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                boxShadow: `0 14px 30px -12px ${TOUR.blue}99`,
              }}
            >
              Start free trial
              <ArrowRight size={16} />
            </Link>
            <a
              href="#tour-start"
              className="inline-flex items-center gap-2 transition-colors"
              style={{
                height: 48,
                padding: "0 20px",
                borderRadius: 999,
                border: `1px solid ${TOUR.line}`,
                background: TOUR.white,
                color: TOUR.ink,
                fontSize: 15,
                fontWeight: 600,
              }}
            >
              Begin the tour
            </a>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 6, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
            style={{
              borderRadius: 28,
              padding: 16,
              background: `linear-gradient(150deg, ${TOUR.white}, ${TOUR.blue}0a)`,
              border: `1px solid ${TOUR.line}`,
              boxShadow: "0 40px 80px -40px rgba(15,23,42,.4)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ILLO}/home-hero.png`}
              alt="Repulabs reputation dashboard"
              style={{ display: "block", width: "100%", borderRadius: 16 }}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
