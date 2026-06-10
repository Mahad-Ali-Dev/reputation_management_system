"use client";

import { CircleCheck } from "lucide-react";
import { Timeline } from "@/components/ui/aceternity/timeline";

const C = {
  ink: "var(--ink, #0f172a)",
  mute: "var(--rl-muted, #64748b)",
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbfd)",
  line: "var(--line, #e2e8f0)",
  pri: "var(--pri, #2563eb)",
  pri50: "var(--pri-50, #eff6ff)",
  pri700: "var(--pri-700, #1d4ed8)",
} as const;

/**
 * SetupTimeline — the "live in 10 minutes" three-step onboarding rendered as a
 * scroll-revealed Timeline. The brand beam draws down the spine as you scroll.
 */
export function SetupTimeline() {
  const data = [
    {
      title: "Describe",
      content: (
        <StepCard
          minutes="~30 sec"
          title="Tell us who you are"
          desc="Type your business name and website — that's the whole form. The onboarding agent crawls your site to understand what you do, your tone and your policies."
          points={[
            "Business name + website",
            "Agent reads your site",
            "No 40-field setup form",
          ]}
        />
      ),
    },
    {
      title: "Auto-connect",
      content: (
        <StepCard
          minutes="~2 min"
          title="The agent finds & links everything"
          desc="repulabs locates your Google Business and social listings, imports your historical reviews and builds a voice model from your own content — all on its own."
          points={[
            "Finds your listings for you",
            "Imports historical reviews",
            "Learns your brand voice",
          ]}
        />
      ),
    },
    {
      title: "Autopilot",
      content: (
        <StepCard
          minutes="~1 min"
          title="Confirm, then it runs itself"
          desc="Review what the agent set up, flip on review requests, AI replies and the phone receptionist. Approve what matters; let the rest run itself."
          points={[
            "Automated review requests",
            "AI replies in your voice",
            "24/7 phone receptionist",
          ]}
        />
      ),
    },
  ];

  return (
    <Timeline
      data={data}
      className="!bg-transparent [&_h3]:text-[var(--ink-2,#1e293b)]"
    />
  );
}

function StepCard({
  minutes,
  title,
  desc,
  points,
}: {
  minutes: string;
  title: string;
  desc: string;
  points: string[];
}) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{
        borderColor: C.line,
        background: C.surface,
        boxShadow: "0 18px 40px -28px rgba(15,23,42,.22)",
      }}
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold"
        style={{
          background: C.pri50,
          color: C.pri700,
          fontFamily: "var(--f-mono)",
          letterSpacing: ".08em",
        }}
      >
        {minutes}
      </span>
      <h4
        className="mt-4"
        style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink }}
      >
        {title}
      </h4>
      <p className="mt-2" style={{ fontSize: 14.5, color: C.mute, lineHeight: 1.6 }}>
        {desc}
      </p>
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-3">
        {points.map((p) => (
          <li
            key={p}
            className="flex items-start gap-2 rounded-xl border px-3 py-2.5"
            style={{
              borderColor: C.line,
              background: C.surface2,
              fontSize: 12.5,
              color: "var(--ink-2, #1e293b)",
            }}
          >
            <CircleCheck size={14} style={{ color: C.pri, flexShrink: 0, marginTop: 1 }} />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
