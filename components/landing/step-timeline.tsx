/**
 * StepTimeline — a heading column beside a numbered vertical timeline.
 *
 * Adapted from a community "orbital timeline" component, restyled for
 * repulabs:
 *   - brand-blue rail and gradient number dots (was cyan), success-green check
 *     icons (was fuchsia), landing ink / muted text, line border + soft panel
 *   - the heading column is passed in, so the page's own SectionHead (blue
 *     mono eyebrow pill) keeps every section consistent
 *   - fonts inherit the landing's --f-ui
 *   - the rail is drawn as one segment per step, dot centre to next dot
 *     centre, so it runs through every dot and stops at the last one
 */

import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

const INK = "#0b1220";
const MUTE = "#5b6473";
const LINE = "#e7ecf6";
const OK = "#0f9d63";

export type TimelineStep = { title: string; description: string };

export function StepTimeline({
  header,
  steps,
  ringColor = "#ffffff",
}: {
  header: ReactNode;
  steps: TimelineStep[];
  /** Section background, used to "cut" the rail around each number dot. */
  ringColor?: string;
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
      <div>{header}</div>

      {/* pl-12 = 48px; dots are 32px wide at -48px, so their centre (and the
          rail's) sits 16px in from the list's left edge */}
      <ol className="relative space-y-5 pl-12">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="relative rounded-2xl border p-5 transition-shadow duration-300 hover:shadow-[0_22px_46px_-30px_rgba(49,92,170,.45)] sm:p-6"
            style={{ borderColor: LINE, background: "#fbfcff" }}
          >
            {/* rail segment: this dot's centre (top 40px) down to the next
                dot's centre (this li's height + the 20px space-y-5 gap) */}
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute -left-[33px] top-10 w-[2px] rounded-full"
                style={{ height: "calc(100% + 20px)", background: "rgba(37,99,235,.35)" }}
              />
            )}
            <span
              className="absolute -left-12 top-6 grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold text-white"
              style={{
                background: "linear-gradient(180deg, #2f6bff, #1e40af)",
                boxShadow: `0 0 0 4px ${ringColor}, 0 8px 18px -8px rgba(37,99,235,.6)`,
              }}
            >
              {index + 1}
            </span>
            <div className="flex items-start gap-3">
              <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0" style={{ color: OK }} />
              <div>
                <h3 className="text-[18px] font-bold" style={{ color: INK, letterSpacing: "-0.01em" }}>
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: MUTE }}>
                  {step.description}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default StepTimeline;
