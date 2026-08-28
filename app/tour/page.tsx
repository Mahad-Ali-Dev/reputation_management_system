import { MarketingShell } from "@/components/landing/marketing-shell";
import {
  ModuleSection,
  type ModuleSectionProps,
} from "@/components/landing/tour/module-section";
import { SectionHeading, TourCTA } from "@/components/landing/tour/tour-bits";
import { TourHero } from "@/components/landing/tour/tour-hero";
import { TOUR } from "@/components/landing/tour/tour-theme";
import { Compare } from "@/components/ui/aceternity/compare";
import { MacbookScroll } from "@/components/ui/aceternity/macbook-scroll";
import { TextHoverEffect } from "@/components/ui/aceternity/text-hover-effect";
import { ThreeDMarquee } from "@/components/ui/aceternity/three-d-marquee";
import { Timeline } from "@/components/ui/aceternity/timeline";
import { TracingBeam } from "@/components/ui/aceternity/tracing-beam";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product tour · Repulabs",
  description:
    "A guided scroll through the entire Repulabs platform reviews, AI phone receptionist, QR plaques, unified inbox, surveys, analytics and autopilot.",
};

const ILLO = "/assets/repulabs/illustrations";

/** The seven module beats of the tour, in narrative order. */
const MODULES: ModuleSectionProps[] = [
  {
    kicker: "01 Reviews",
    title: "Turn happy customers into five-star proof",
    body: "Collect, monitor and respond to reviews across Google, Facebook and beyond from one screen. AI drafts replies in your brand voice the moment a review lands.",
    points: [
      "Unified stream across every review platform",
      "AI-suggested replies that sound like you",
      "Sentiment trends and rating velocity at a glance",
    ],
    image: `${ILLO}/feat-reviews.png`,
    imageAlt: "Reviews dashboard",
    accent: TOUR.blue,
  },
  {
    kicker: "02 AI Phone",
    title: "An AI receptionist that never misses a call",
    body: "Every missed call is a lost customer. Our AI answers, books, qualifies and routes then turns the happy ones into review requests automatically.",
    points: [
      "24/7 natural-voice answering and booking",
      "Live transcripts and call summaries",
      "Post-call review requests sent on autopilot",
    ],
    image: `${ILLO}/feat-ai-phone.png`,
    imageAlt: "AI phone receptionist",
    accent: TOUR.teal,
    reverse: true,
  },
  {
    kicker: "03 QR & NFC",
    title: "One tap from the counter to a glowing review",
    body: "Branded QR plaques and NFC stands route customers straight to your review funnel. Smart routing sends the delighted to Google and the unhappy to private feedback.",
    points: [
      "Designer QR plaques with your logo baked in",
      "NFC tap-to-review hardware for the front desk",
      "Smart routing protects your public rating",
    ],
    image: `${ILLO}/feat-qr-nfc.png`,
    imageAlt: "QR and NFC review hardware",
    accent: TOUR.blue,
  },
  {
    kicker: "04 Inbox",
    title: "Every conversation in one calm inbox",
    body: "Reviews, comments, DMs, SMS and live chat land in a single unified inbox. Assign, moderate and reply with AI suggestions never juggle eight tabs again.",
    points: [
      "Reviews, social, SMS and live chat together",
      "Assignment, status and team moderation",
      "AI Suggest drafts on every thread",
    ],
    image: `${ILLO}/feat-inbox.png`,
    imageAlt: "Unified inbox",
    accent: TOUR.teal,
    reverse: true,
  },
  {
    kicker: "05 Surveys",
    title: "Hear the whole story, not just the stars",
    body: "Launch NPS and CSAT surveys that feed straight into your reputation engine. Spot churn risk early and convert promoters into public reviews.",
    points: [
      "NPS, CSAT and custom survey flows",
      "Promoters routed to public review prompts",
      "Detractors routed to private recovery",
    ],
    image: `${ILLO}/feat-surveys.png`,
    imageAlt: "Surveys",
    accent: TOUR.blue,
  },
  {
    kicker: "06 Analytics",
    title: "Reputation, measured in revenue",
    body: "See exactly how reviews, response time and sentiment move your bottom line. Location-level breakdowns and ROI attribution turn reputation into a number.",
    points: [
      "Rating, sentiment and velocity trends",
      "Per-location and per-channel breakdowns",
      "ROI attribution from review to revenue",
    ],
    image: `${ILLO}/feat-analytics.png`,
    imageAlt: "Analytics",
    accent: TOUR.teal,
    reverse: true,
  },
  {
    kicker: "07 Autopilot",
    title: "The whole system, running itself",
    body: "Set your guardrails once. Autopilot collects reviews, answers calls, replies in your voice, escalates the tricky ones and reports back every week.",
    points: [
      "Policy-driven automation with guardrails",
      "Auto-replies, requests and escalations",
      "A weekly digest of everything it handled",
    ],
    image: `${ILLO}/feat-autopilot.png`,
    imageAlt: "Autopilot",
    accent: TOUR.blue,
  },
];

/** Images for the 3D marquee — every product surface at once. */
const MARQUEE = [
  "feat-reviews.png",
  "feat-ai-phone.png",
  "feat-qr-nfc.png",
  "feat-inbox.png",
  "feat-surveys.png",
  "feat-analytics.png",
  "feat-autopilot.png",
  "kb-brain.png",
  "autopilot-hero.png",
  "seo-hero.png",
  "voice-review.png",
  "home-hero.png",
].map((f) => `${ILLO}/${f}`);

export default function TourPage() {
  return (
    <MarketingShell>
      <TourHero />

      <div id="tour-start" style={{ background: TOUR.canvas }}>
        <TracingBeam className="px-6">
          <div className="mx-auto max-w-[1080px] pt-16 pb-8">
            <SectionHeading
              kicker="The full walkthrough"
              title="Seven modules. One reputation engine."
              subtitle="Scroll down to meet each part of the platform and see how they hand work off to each other automatically."
            />
          </div>

          <div className="mx-auto max-w-[1080px]">
            {MODULES.map((m) => (
              <ModuleSection key={m.kicker} {...m} />
            ))}
          </div>
        </TracingBeam>
      </div>

      {/* Before / after */}
      <section style={{ background: TOUR.canvas }} className="px-6 py-20">
        <SectionHeading
          kicker="Before & after"
          title="Reputation before vs. after Repulabs"
          subtitle="Drag the handle. Scattered tabs and missed calls on one side; one calm, automated command center on the other."
        />
        <div className="mx-auto mt-12 max-w-[920px]">
          <div
            className="overflow-hidden"
            style={{
              borderRadius: 24,
              border: `1px solid ${TOUR.line}`,
              background: TOUR.white,
              padding: 12,
              boxShadow: "0 30px 60px -30px rgba(15,23,42,.3)",
            }}
          >
            <Compare
              firstImage={`${ILLO}/reviews-empty.svg`}
              secondImage={`${ILLO}/feat-reviews.png`}
              className="h-[300px] w-full md:h-[480px]"
              firstImageClassName="object-cover"
              secondImageClassName="object-cover"
              slideMode="hover"
              autoplay
              autoplayDuration={6000}
            />
          </div>
        </div>
      </section>

      {/* 3D marquee of the whole product */}
      <section style={{ background: TOUR.canvas }} className="px-6 pb-8">
        <SectionHeading
          kicker="The whole surface"
          title="Everything, in one place"
          subtitle="A glance at every screen you get on day one."
        />
        <div className="mx-auto mt-12 max-w-[1180px]">
          <ThreeDMarquee images={MARQUEE} />
        </div>
      </section>

      {/* How it comes together — Timeline */}
      <section style={{ background: TOUR.canvas }} className="px-6 pt-8">
        <SectionHeading
          kicker="From signup to autopilot"
          title="Live in an afternoon"
        />
        <Timeline
          className="!bg-transparent"
          data={[
            {
              title: "Connect",
              content: (
                <p style={{ color: TOUR.ink2, fontSize: 15.5, lineHeight: 1.7, maxWidth: 520 }}>
                  Link Google, Facebook and your phone number in a few clicks. We
                  pull your existing reviews and history straight in.
                </p>
              ),
            },
            {
              title: "Train",
              content: (
                <p style={{ color: TOUR.ink2, fontSize: 15.5, lineHeight: 1.7, maxWidth: 520 }}>
                  Drop in your brand voice, FAQs and policies. The AI learns how
                  you talk so every reply and call sounds unmistakably you.
                </p>
              ),
            },
            {
              title: "Automate",
              content: (
                <p style={{ color: TOUR.ink2, fontSize: 15.5, lineHeight: 1.7, maxWidth: 520 }}>
                  Flip on autopilot with your guardrails. Requests go out, calls
                  get answered, replies get drafted all within your rules.
                </p>
              ),
            },
            {
              title: "Grow",
              content: (
                <p style={{ color: TOUR.ink2, fontSize: 15.5, lineHeight: 1.7, maxWidth: 520 }}>
                  Watch your rating climb and read the weekly digest of everything
                  Repulabs handled while you ran your business.
                </p>
              ),
            },
          ]}
        />
      </section>

      {/* Macbook product shot */}
      <section style={{ background: TOUR.canvas }} className="overflow-hidden">
        <div className="hidden md:block">
          <MacbookScroll
            src={`${ILLO}/home-hero.png`}
            showGradient
            title={
              <span
                style={{
                  fontSize: "clamp(24px, 3vw, 40px)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  color: TOUR.ink,
                }}
              >
                Your whole reputation,
                <br /> on one beautiful screen.
              </span>
            }
          />
        </div>
        {/* Mobile fallback — MacbookScroll needs scroll height that mobile lacks. */}
        <div className="px-6 py-16 md:hidden">
          <div
            style={{
              borderRadius: 20,
              border: `1px solid ${TOUR.line}`,
              padding: 12,
              background: TOUR.white,
              boxShadow: "0 20px 50px -24px rgba(15,23,42,.3)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ILLO}/home-hero.png`}
              alt="Repulabs on desktop"
              style={{ display: "block", width: "100%", borderRadius: 12 }}
            />
          </div>
        </div>
      </section>

      {/* Brand word */}
      <section
        style={{ background: TOUR.canvas }}
        className="flex h-[26rem] items-center justify-center"
      >
        <div className="h-[20rem] w-full">
          <TextHoverEffect text="REPULABS" automatic />
        </div>
      </section>

      <div style={{ background: TOUR.canvas }}>
        <TourCTA />
      </div>
    </MarketingShell>
  );
}
