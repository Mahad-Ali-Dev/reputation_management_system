import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { Star } from "lucide-react";

export const dynamic = "force-static";

export const metadata = {
  title: "Customers · Repulabs",
  description:
    "Cafes, dentists, gyms, salons, contractors see how Repulabs customers are running their reputation as a system.",
};

const C = {
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbf8)",
  ink: "var(--ink, #0B0D0E)",
  ink2: "var(--ink-2, #1e2225)",
  mute: "var(--rl-muted, #61697a)",
  line: "var(--line, #eceeea)",
  pri: "var(--pri, #2563EB)",
  pri50: "var(--pri-50, #ECFDF7)",
};

const STORIES: Array<{
  vertical: string;
  business: string;
  location: string;
  metric: { label: string; value: string };
  quote: string;
  signer: string;
  stars: number;
}> = [
  {
    vertical: "Dental",
    business: "Bayside Dental Group",
    location: "Brighton, VIC · 4 chairs",
    metric: { label: "★ uplift in 90 days", value: "+0.7" },
    quote:
      "Repulabs turned post-visit SMS into an actual workflow. The AI reply drafts read like our practice manager wrote them we publish 90% as-is.",
    signer: "Dr. M. Klein, Owner",
    stars: 5,
  },
  {
    vertical: "Hospitality",
    business: "Café Lottie",
    location: "Fitzroy, VIC · 3 locations",
    metric: { label: "monthly Google reviews", value: "48 → 215" },
    quote:
      "The QR plaques on tables outperform our newsletter 9-to-1. We hit 4.9★ on all three sites within four months.",
    signer: "J. Tanaka, Co-founder",
    stars: 5,
  },
  {
    vertical: "Fitness",
    business: "Crux Climbing",
    location: "Cremorne, VIC · 1 location",
    metric: { label: "negative reviews intercepted", value: "12 / mo" },
    quote:
      "The dispute service is a quiet superpower. Repulabs flags ToS-violating Google reviews and gets them removed without us lifting a finger.",
    signer: "K. O&apos;Brien, GM",
    stars: 5,
  },
  {
    vertical: "Trades",
    business: "Cohen Plumbing",
    location: "Sydney, NSW · 8 vans",
    metric: { label: "review-request conversion", value: "27% → 41%" },
    quote:
      "The AI phone receptionist books after-hours service calls and asks for a Google review when the job&apos;s done. It feels unfair.",
    signer: "D. Cohen, Director",
    stars: 5,
  },
];

const LOGOS = [
  "Bayside Dental",
  "Café Lottie",
  "Crux Climbing",
  "Cohen Plumbing",
  "Hudson + Co",
  "Pace Studio",
];

export default function CustomersPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="Customers"
        title="2,400+ small businesses running reputation on autopilot."
        description="Every story below is real names changed only at customer request. Press the case study buttons to read the full breakdown."
      />

      <section className="border-y" style={{ borderColor: C.line, background: C.surface2 }}>
        <div className="mx-auto max-w-[1280px] px-6 py-12">
          <div
            className="text-center text-[10.5px]"
            style={{
              color: C.mute,
              fontFamily: "var(--f-mono)",
              letterSpacing: ".14em",
              fontWeight: 600,
            }}
          >
            TRUSTED BY MULTI-LOCATION OPERATORS, INDIE FAVORITES, AND BUSY ONE-CHAIR OWNERS
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-8 sm:gap-12 opacity-60">
            {LOGOS.map((l) => (
              <span
                key={l}
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: "-0.015em",
                  color: C.ink2,
                }}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-6 py-20">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {STORIES.map((s) => (
            <article
              key={s.business}
              className="rounded-2xl p-8"
              style={{ background: C.surface, border: `1px solid ${C.line}` }}
            >
              <div className="flex items-center justify-between">
                <span
                  style={{
                    fontSize: 11,
                    color: C.pri,
                    fontFamily: "var(--f-mono)",
                    letterSpacing: ".14em",
                    fontWeight: 600,
                  }}
                >
                  {s.vertical.toUpperCase()}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  {Array.from({ length: s.stars }).map((_, i) => (
                    <Star
                      key={`star-${s.business}-${i}`}
                      size={13}
                      fill="#f59e0b"
                      stroke="#f59e0b"
                    />
                  ))}
                </span>
              </div>
              <h3
                className="mt-3"
                style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}
              >
                {s.business}
              </h3>
              <div style={{ fontSize: 13, color: C.mute, marginTop: 2 }}>{s.location}</div>

              <div
                className="mt-6 rounded-xl p-4"
                style={{ background: C.pri50, border: `1px solid var(--pri-100, #cffaf0)` }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    color: C.mute,
                    fontFamily: "var(--f-mono)",
                    letterSpacing: ".12em",
                  }}
                >
                  {s.metric.label.toUpperCase()}
                </div>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 600,
                    letterSpacing: "-0.025em",
                    color: C.pri,
                    marginTop: 2,
                  }}
                >
                  {s.metric.value}
                </div>
              </div>

              <blockquote className="mt-6" style={{ fontSize: 15, color: C.ink2, lineHeight: 1.6 }}>
                &ldquo;{s.quote}&rdquo;
              </blockquote>
              <div className="mt-3" style={{ fontSize: 13, color: C.mute }}>
                {s.signer}
              </div>
            </article>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
