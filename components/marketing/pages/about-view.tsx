import {
  G,
  GlassPage,
  HeroButton,
  IconTile,
  MonoLabel,
  PageCta,
  PageHero,
  PageSection,
  SectionTitle,
} from "@/components/marketing/glass-page";
import { ArrowRight, Check, Globe, Heart, Info, Mail, MapPin, Target, X } from "lucide-react";

const PILLARS = [
  {
    Icon: Target,
    title: "Our mission",
    body: "Make a 4.9★ rating the default outcome for small businesses, not the exception. We do it by automating the parts owners forget and amplifying the parts that matter.",
  },
  {
    Icon: Heart,
    title: "Our customers",
    body: "Cafes, dentists, gyms, contractors, salons. Anywhere a 4.6 vs a 4.9 star rating shifts a phone-book conversion by 30%. We obsess over that gap.",
  },
  {
    Icon: Globe,
    title: "Our reach",
    body: "Headquartered in Melbourne. Customers across AU, US, UK, and Pakistan. Every feature ships in 11 timezones because reputation is local everywhere.",
  },
];

const STATS = [
  {
    value: "2,400+",
    label: "Active locations",
    hint: "Across 14 countries on day one of our pricing release",
  },
  {
    value: "380K",
    label: "Review requests sent",
    hint: "In the last 30 days, and 41K reviews collected from them",
  },
  {
    value: "+0.6★",
    label: "Star delta",
    hint: "Average rating uplift for customers on Repulabs 90+ days",
  },
];

const BEFORE = [
  "Manual SMS blasts",
  "Awkward signs at checkout",
  "Dashboards across five tools",
  "An AI reply tab open in a sixth",
];
const AFTER = [
  "Review requests that send themselves",
  "Replies drafted in your brand voice",
  "Surveys, QR plaques and an AI receptionist",
  "One workspace, auditable down to the row",
];

export function AboutView() {
  return (
    <GlassPage>
      <PageHero
        eyebrow="About"
        icon={<Info size={13} strokeWidth={2.2} />}
        title="A platform built by people who hate begging for reviews."
        description="Repulabs is the operating system that takes the boring-but-critical work of being well-spoken-of and turns it into one calm, automated workflow."
      >
        <HeroButton href="/signup">
          Start free <ArrowRight size={15} />
        </HeroButton>
        <HeroButton href="mailto:info@repulabs.com" ghost>
          Say hello
        </HeroButton>
      </PageHero>

      {/* stats band, lifted onto the hero's bottom edge */}
      <section className="relative z-10 mx-auto -mt-10 w-full max-w-[1040px] px-5 sm:px-6">
        <div className="glass-surface glass-surface--raised grid gap-6 rounded-[26px] p-7 sm:grid-cols-3 sm:p-8">
          {STATS.map((s) => (
            <div key={s.label}>
              <MonoLabel>{s.label}</MonoLabel>
              <div
                className="mt-1.5"
                style={{
                  fontFamily: "var(--f-num)",
                  fontSize: 40,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.05,
                }}
              >
                {s.value}
              </div>
              <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: G.mute }}>
                {s.hint}
              </p>
            </div>
          ))}
        </div>
      </section>

      <PageSection>
        <SectionTitle
          eyebrow="What drives us"
          title="Three things we never compromise on."
          center
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PILLARS.map(({ Icon, title, body }) => (
            <div key={title} className="glass-surface glass-surface--hover rounded-[24px] p-7">
              <IconTile>
                <Icon size={20} />
              </IconTile>
              <h3 className="mt-5 text-[19px] font-semibold" style={{ letterSpacing: "-0.015em" }}>
                {title}
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: G.mute }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </PageSection>

      <PageSection className="!pt-0">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
          <div>
            <SectionTitle
              eyebrow="Our story"
              title="We started from a frustration. We’re shipping it as a craft."
            />
            <p className="mt-6 text-[16px] leading-relaxed" style={{ color: G.ink2 }}>
              The founder spent six years running an ecommerce brand chasing reviews like every
              other owner: manual SMS blasts, awkward signs at checkout, dashboards across five
              tools, and an AI reply tab open in a sixth.
            </p>
            <p className="mt-4 text-[16px] leading-relaxed" style={{ color: G.ink2 }}>
              Repulabs is what we wished existed: one workspace that handles the request, the reply,
              the survey, the QR plaque, and the AI receptionist taking calls when you’re behind the
              counter. Trained on your brand voice. Auditable down to the row.
            </p>
          </div>

          <div className="glass-surface glass-surface--raised rounded-[26px] p-6 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[18px] p-5" style={{ background: G.fill }}>
                <MonoLabel>Before</MonoLabel>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {BEFORE.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-2.5 text-[14px] leading-snug"
                      style={{ color: G.mute }}
                    >
                      <span
                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                        style={{ background: "#fef3f2", color: "#dc2626" }}
                      >
                        <X size={12} strokeWidth={2.6} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-[18px] p-5" style={{ background: "rgba(37,99,235,.08)" }}>
                <MonoLabel color={G.pri}>With Repulabs</MonoLabel>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {AFTER.map((a) => (
                    <li
                      key={a}
                      className="flex items-start gap-2.5 text-[14px] font-medium leading-snug"
                      style={{ color: G.ink }}
                    >
                      <span
                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-white"
                        style={{ background: G.pri }}
                      >
                        <Check size={12} strokeWidth={2.8} />
                      </span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection className="!pt-0">
        <div className="glass-surface glass-surface--raised flex flex-wrap items-center justify-between gap-6 rounded-[26px] p-7 sm:p-10">
          <div className="flex items-start gap-4">
            <IconTile size={52}>
              <MapPin size={22} />
            </IconTile>
            <div>
              <MonoLabel color={G.pri}>HQ</MonoLabel>
              <h3 className="mt-1 text-[24px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
                Melbourne, Australia
              </h3>
              <p className="mt-1 text-[14.5px]" style={{ color: G.mute }}>
                Level 3, 530 Collins St · St Kilda Rd satellite
              </p>
            </div>
          </div>
          <a
            href="mailto:info@repulabs.com"
            className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
            style={{ background: G.pri, boxShadow: "0 12px 24px -12px rgba(37,99,235,.9)" }}
          >
            <Mail size={16} /> info@repulabs.com
          </a>
        </div>
      </PageSection>

      <PageCta
        title="Make a 4.9★ rating your default."
        sub="Start a 14-day free trial. Setup takes minutes, and Autopilot does the rest."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/contact", label: "Talk to us" }}
      />
    </GlassPage>
  );
}
