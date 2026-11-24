import {
  G,
  GlassPage,
  HeroButton,
  MonoLabel,
  PageCta,
  PageHero,
  PageSection,
} from "@/components/marketing/glass-page";
import { ArrowRight, Star, Users } from "lucide-react";

type Story = {
  vertical: string;
  business: string;
  location: string;
  metric: { label: string; value: string };
  quote: string;
  signer: string;
  stars: number;
};

const STORIES: Story[] = [
  {
    vertical: "Dental",
    business: "Bayside Dental Group",
    location: "Brighton, VIC · 4 chairs",
    metric: { label: "★ uplift in 90 days", value: "+0.7" },
    quote:
      "Repulabs turned post-visit SMS into an actual workflow. The AI reply drafts read like our practice manager wrote them; we publish 90% as-is.",
    signer: "Dr. M. Klein, Owner",
    stars: 5,
  },
  {
    vertical: "Hospitality",
    business: "Café Lottie",
    location: "Fitzroy, VIC · 3 locations",
    metric: { label: "Monthly Google reviews", value: "48 → 215" },
    quote:
      "The QR plaques on tables outperform our newsletter 9-to-1. We hit 4.9★ on all three sites within four months.",
    signer: "J. Tanaka, Co-founder",
    stars: 5,
  },
  {
    vertical: "Fitness",
    business: "Crux Climbing",
    location: "Cremorne, VIC · 1 location",
    metric: { label: "Negative reviews intercepted", value: "12 / mo" },
    quote:
      "The dispute service is a quiet superpower. Repulabs flags ToS-violating Google reviews and gets them removed without us lifting a finger.",
    signer: "K. O’Brien, GM",
    stars: 5,
  },
  {
    vertical: "Trades",
    business: "Cohen Plumbing",
    location: "Sydney, NSW · 8 vans",
    metric: { label: "Review-request conversion", value: "27% → 41%" },
    quote:
      "The AI phone receptionist books after-hours service calls and asks for a Google review when the job’s done. It feels unfair.",
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

const initials = (s: string) =>
  s
    .replace(/^(Dr\.\s*)/, "")
    .split(/[\s,.+]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function CustomersView() {
  return (
    <GlassPage>
      <PageHero
        eyebrow="Customers"
        icon={<Users size={13} strokeWidth={2.2} />}
        title="2,400+ small businesses running reputation on autopilot."
        description="Every story below is real, with names changed only at customer request."
      >
        <HeroButton href="/signup">
          Start free <ArrowRight size={15} />
        </HeroButton>
        <HeroButton href="/contact" ghost>
          Book a demo
        </HeroButton>
      </PageHero>

      {/* trusted-by strip */}
      <section className="relative z-10 mx-auto -mt-9 w-full max-w-[1040px] px-5 sm:px-6">
        <div className="glass-surface glass-surface--raised rounded-[24px] px-6 py-6 text-center sm:px-8">
          <MonoLabel>
            Trusted by multi-location operators, indie favourites and busy one-chair owners
          </MonoLabel>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {LOGOS.map((l) => (
              <span
                key={l}
                className="inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[14px] font-semibold"
                style={{ background: G.fill, color: G.ink2, letterSpacing: "-0.01em" }}
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white"
                  style={{ background: G.iconBg }}
                >
                  {initials(l)}
                </span>
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      <PageSection>
        <div className="grid gap-5 md:grid-cols-2">
          {STORIES.map((s) => (
            <article
              key={s.business}
              className="glass-surface glass-surface--hover flex flex-col rounded-[26px] p-7 sm:p-8"
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase"
                  style={{
                    background: G.tint,
                    color: G.pri,
                    letterSpacing: ".12em",
                    fontFamily: "var(--f-mono)",
                  }}
                >
                  {s.vertical}
                </span>
                <span className="inline-flex items-center gap-0.5" aria-label={`${s.stars} stars`}>
                  {Array.from({ length: s.stars }).map((_, i) => (
                    <Star key={`${s.business}-${i}`} size={14} fill="#f5a623" stroke="#f5a623" />
                  ))}
                </span>
              </div>

              <h3 className="mt-4 text-[23px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
                {s.business}
              </h3>
              <p className="mt-0.5 text-[13.5px]" style={{ color: G.mute }}>
                {s.location}
              </p>

              <div
                className="mt-6 rounded-[18px] p-5"
                style={{ background: "rgba(37,99,235,.08)" }}
              >
                <MonoLabel>{s.metric.label}</MonoLabel>
                <div
                  className="mt-1"
                  style={{
                    fontFamily: "var(--f-num)",
                    fontSize: 34,
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    color: G.pri,
                    lineHeight: 1.1,
                  }}
                >
                  {s.metric.value}
                </div>
              </div>

              <blockquote
                className="mt-6 flex-1 text-[15.5px] leading-relaxed"
                style={{ color: G.ink2 }}
              >
                “{s.quote}”
              </blockquote>

              <div className="mt-6 flex items-center gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-full text-[13px] font-semibold"
                  style={{ background: G.tint, color: G.pri }}
                >
                  {initials(s.signer.split(",")[0] ?? s.signer)}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">{s.signer.split(",")[0]}</span>
                  <span className="block text-[12.5px]" style={{ color: G.mute }}>
                    {s.signer.split(",").slice(1).join(",").trim()} · {s.business}
                  </span>
                </span>
              </div>
            </article>
          ))}
        </div>
      </PageSection>

      <PageCta
        title="Be the next story on this page."
        sub="Join 2,400+ businesses that run their reputation as a system."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/contact", label: "Book a demo" }}
      />
    </GlassPage>
  );
}
