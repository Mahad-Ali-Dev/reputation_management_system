"use client";

import { motion } from "motion/react";
import { TOUR } from "./tour-theme";

export interface ModuleSectionProps {
  /** Small mono kicker, e.g. "01 — REVIEWS". */
  kicker: string;
  title: string;
  body: string;
  /** Bulleted capability list. */
  points: string[];
  /** Illustration src (absolute public path). */
  image: string;
  imageAlt: string;
  /** Place the artwork on the left instead of the right. */
  reverse?: boolean;
  /** Accent for this module — defaults to brand blue. */
  accent?: string;
}

/**
 * A single module beat in the tour narrative: copy paired with its feat-*.png.
 * Self-contained client island — animates in on scroll with motion/react and
 * inline styles only.
 */
export function ModuleSection({
  kicker,
  title,
  body,
  points,
  image,
  imageAlt,
  reverse = false,
  accent = TOUR.blue,
}: ModuleSectionProps) {
  return (
    <div
      className="grid items-center gap-10 py-10 md:grid-cols-2 md:gap-16 md:py-16"
      style={{ direction: "ltr" }}
    >
      {/* Copy column */}
      <motion.div
        initial={{ opacity: 0, x: reverse ? 40 : -40 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ order: reverse ? 2 : 1 }}
      >
        <span
          style={{
            display: "inline-block",
            fontFamily: "var(--f-mono, ui-monospace, monospace)",
            fontSize: 11,
            letterSpacing: "0.16em",
            fontWeight: 600,
            color: accent,
            textTransform: "uppercase",
          }}
        >
          {kicker}
        </span>
        <h3
          className="mt-3"
          style={{
            fontSize: "clamp(26px, 3.4vw, 40px)",
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
            fontWeight: 600,
            color: TOUR.ink,
          }}
        >
          {title}
        </h3>
        <p
          className="mt-4"
          style={{
            fontSize: 16.5,
            lineHeight: 1.65,
            color: TOUR.ink2,
            maxWidth: 480,
          }}
        >
          {body}
        </p>
        <ul className="mt-6 space-y-3">
          {points.map((p) => (
            <li
              key={p}
              className="flex items-start gap-3"
              style={{ fontSize: 14.5, color: TOUR.ink2, lineHeight: 1.5 }}
            >
              <span
                aria-hidden
                style={{
                  marginTop: 3,
                  flexShrink: 0,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  background: `${accent}1a`,
                  color: accent,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path
                    d="M2.5 6.2 4.8 8.5 9.5 3.5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* Artwork column */}
      <motion.div
        initial={{ opacity: 0, y: 36, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{ order: reverse ? 1 : 2 }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 24,
            background: `linear-gradient(150deg, ${accent}14, ${TOUR.teal}10)`,
            border: `1px solid ${TOUR.line}`,
            padding: 18,
            boxShadow:
              "0 1px 2px rgba(15,23,42,.04), 0 24px 48px -24px rgba(15,23,42,.25)",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: `radial-gradient(120% 100% at 100% 0%, ${accent}22 0%, transparent 55%)`,
              pointerEvents: "none",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={imageAlt}
            loading="lazy"
            className="relative w-full"
            style={{
              display: "block",
              borderRadius: 14,
              background: TOUR.white,
              boxShadow: "0 8px 24px -12px rgba(15,23,42,.2)",
            }}
          />
        </div>
      </motion.div>
    </div>
  );
}
