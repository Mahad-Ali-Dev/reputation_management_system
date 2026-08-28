import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { PremiumIllustration } from "@/components/landing/premium-illustration";

/* ============================================================
   FeatureShowcase — the marquee product section.

   Google/Stripe-marketing quality: each surface gets a FULL ROW
   with a LARGE illustration on one side and confident copy on the
   other, alternating left/right down the page. No cramped bento —
   big, beautiful, spacious. Server-rendered; the only client island
   is <PremiumIllustration> (needs onError for graceful PNG fallback).
============================================================ */

const ART = "/assets/repulabs/illustrations";

const C = {
  ink: "var(--ink, #0f172a)",
  ink2: "var(--ink-2, #1e293b)",
  mute: "var(--rl-muted, #64748b)",
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbfd)",
  line: "var(--line, #e2e8f0)",
  pri: "var(--pri, #2563eb)",
  pri50: "var(--pri-50, #eff6ff)",
  pri100: "var(--pri-100, #dbeafe)",
  pri700: "var(--pri-700, #1d4ed8)",
} as const;

type Glyph =
  | "reviews"
  | "phone"
  | "qr"
  | "inbox"
  | "surveys"
  | "analytics"
  | "autopilot";

type Row = {
  glyph: Glyph;
  file: string;
  eyebrow: string;
  title: string;
  lead: string;
  points: string[];
  href: string;
  cta: string;
  /** illustration on the right (default) or left */
  flip?: boolean;
};

const ROWS: Row[] = [
  {
    glyph: "reviews",
    file: "feat-reviews.png",
    eyebrow: "REVIEWS · AI REPLIES",
    title: "Every review, answered in your voice",
    lead: "Google, Facebook and listing reviews land in one feed. The AI drafts a reply trained on your brand guide, service catalog and refund policy you approve and publish in a single click.",
    points: [
      "Unified feed across every review host",
      "Drafts that match your exact tone",
      "Approve-to-learn loop sharpens the voice",
    ],
    href: "/reviews",
    cta: "See the review inbox",
  },
  {
    glyph: "autopilot",
    file: "feat-autopilot.png",
    eyebrow: "AUTOPILOT",
    title: "Your reputation, running itself",
    lead: "Drag-and-drop rules trigger from your POS or CRM, wait the right amount of time, then send the perfect follow-up so a great visit becomes a 5-star review without anyone lifting a finger.",
    points: [
      "Triggers from POS, CRM and bookings",
      "Smart timing windows, not spam",
      "Branching flows for every outcome",
    ],
    href: "/autopilot",
    cta: "Explore autopilot",
    flip: true,
  },
  {
    glyph: "phone",
    file: "feat-ai-phone.png",
    eyebrow: "AI PHONE RECEPTIONIST",
    title: "A receptionist that never sleeps",
    lead: "Answer every call in a voice cloned from yours. The AI books appointments, answers FAQs and writes the booking straight to your calendar 24/7, even when the front desk is slammed.",
    points: [
      "Cloned-voice answering, around the clock",
      "Books appointments into your calendar",
      "Every call recorded, transcribed and synced",
    ],
    href: "/phone",
    cta: "Hear the AI phone",
  },
  {
    glyph: "inbox",
    file: "feat-inbox.png",
    eyebrow: "UNIFIED INBOX",
    title: "One inbox for every conversation",
    lead: "Comments, DMs, SMS and live chat from every connected page flow into a single view. Reply once, in your brand voice, and nothing slips through the cracks again.",
    points: [
      "Comments, DMs, SMS and live chat",
      "Every connected channel in one place",
      "Brand-voice replies, assignable to your team",
    ],
    href: "/reviews",
    cta: "Open the unified inbox",
    flip: true,
  },
  {
    glyph: "surveys",
    file: "feat-surveys.png",
    eyebrow: "SURVEYS · SMART ROUTING",
    title: "Send happy customers public, route the rest privately",
    lead: "Smart surveys read the sentiment and act on it: delighted customers get nudged toward a public review, while anyone unhappy is routed straight to you before it ever hits Google.",
    points: [
      "Sentiment-based routing, automatically",
      "Public reviews from your happiest guests",
      "Private recovery path for the unhappy ones",
    ],
    href: "/surveys",
    cta: "Build a survey",
  },
];

export function FeatureShowcase() {
  return (
    <div className="mt-20 flex flex-col gap-24 sm:gap-28 lg:gap-32">
      {ROWS.map((row) => (
        <ShowcaseRow key={row.title} {...row} />
      ))}
    </div>
  );
}

function ShowcaseRow({
  glyph,
  file,
  eyebrow,
  title,
  lead,
  points,
  href,
  cta,
  flip,
}: Row) {
  return (
    <article
      className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16"
      data-lp-anim="rise"
    >
      {/* Copy column */}
      <div className={flip ? "lg:order-2" : "lg:order-1"}>
        <span
          className="inline-block text-[11px] font-semibold"
          style={{
            color: C.pri,
            fontFamily: "var(--f-mono)",
            letterSpacing: ".14em",
          }}
        >
          {eyebrow}
        </span>
        <h3
          className="mt-3"
          style={{
            fontSize: "clamp(26px, 3.2vw, 38px)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            color: C.ink,
          }}
        >
          {title}
        </h3>
        <p
          className="mt-4 max-w-xl"
          style={{ fontSize: 16.5, color: C.mute, lineHeight: 1.65 }}
        >
          {lead}
        </p>
        <ul className="mt-7 space-y-3">
          {points.map((p) => (
            <li
              key={p}
              className="flex items-start gap-3"
              style={{ fontSize: 15, color: C.ink2 }}
            >
              <span
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                style={{
                  background: C.pri50,
                  color: C.pri,
                  border: `1px solid ${C.pri100}`,
                }}
              >
                <Check size={12} strokeWidth={3} />
              </span>
              {p}
            </li>
          ))}
        </ul>
        <Link
          href={href}
          className="mt-8 inline-flex items-center gap-1.5 text-[14.5px] font-semibold transition-all hover:gap-2.5"
          style={{ color: C.pri700 }}
        >
          {cta}
          <ArrowRight size={15} />
        </Link>
      </div>

      {/* Illustration column — large, framed, soft-tinted. */}
      <div className={flip ? "lg:order-1" : "lg:order-2"}>
        <ShowcaseFrame glyph={glyph} file={file} title={title} />
      </div>
    </article>
  );
}

function ShowcaseFrame({
  glyph,
  file,
  title,
}: {
  glyph: Glyph;
  file: string;
  title: string;
}) {
  return (
    <div
      className="relative"
      style={{
        borderRadius: 24,
        background:
          "linear-gradient(140deg, var(--pri-50, #eff6ff) 0%, var(--surface-2, #fafbfd) 55%, var(--surface, #ffffff) 100%)",
        border: `1px solid ${C.line}`,
        padding: "clamp(18px, 3vw, 34px)",
        boxShadow: "0 34px 80px -40px rgba(15,23,42,.30)",
      }}
    >
      {/* soft brand glow behind the art */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-8 right-6 h-40 w-40 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(37,99,235,.16) 0%, transparent 70%)",
          filter: "blur(6px)",
        }}
      />
      <PremiumIllustration
        src={`${ART}/${file}`}
        alt={`${title} repulabs product illustration`}
        glyph={glyph}
        ratio="4 / 3"
        rounded={16}
        tone="tint"
      />
    </div>
  );
}
