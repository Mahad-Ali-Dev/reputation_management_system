import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { Globe, Heart, MapPin, Target } from "lucide-react";

export const dynamic = "force-static";

export const metadata = {
  title: "About · Repulabs",
  description:
    "Repulabs is the reputation operating system for ambitious small businesses. Built in Melbourne, used worldwide.",
};

const C = {
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbfd)",
  ink: "var(--ink, #0f172a)",
  ink2: "var(--ink-2, #1e293b)",
  mute: "var(--rl-muted, #64748b)",
  line: "var(--line, #eef1f6)",
  pri: "var(--pri, #2457ff)",
  pri50: "var(--pri-50, #eff6ff)",
  shadowCard:
    "0 1px 2px rgba(15, 23, 42, 0.05), 0 12px 28px -14px rgba(15, 23, 42, 0.1)",
};

export default function AboutPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="About"
        title="A platform built by people who hate begging for reviews."
        description="Repulabs is the operating system that takes the boring-but-critical work of being well-spoken-of and turns it into one calm, automated workflow."
      />

      <section className="mx-auto max-w-[1080px] px-6 py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <Pillar
            icon={<Target size={20} />}
            title="Our mission"
            body="Make a 4.9★ rating the default outcome for small businesses, not the exception. We do it by automating the parts owners forget and amplifying the parts that matter."
          />
          <Pillar
            icon={<Heart size={20} />}
            title="Our customers"
            body="Cafes, dentists, gyms, contractors, salons. Anywhere a 4.6 vs a 4.9 star rating shifts a phone-book conversion by 30%. We obsess over that gap."
          />
          <Pillar
            icon={<Globe size={20} />}
            title="Our reach"
            body="Headquartered in Melbourne. Customers across AU, US, UK, and Pakistan. Every feature ships in 11 timezones because reputation is local everywhere."
          />
        </div>
      </section>

      <section
        style={{ background: C.surface2, borderTop: `1px solid ${C.line}` }}
        className="border-b"
      >
        <div className="mx-auto max-w-[1080px] px-6 py-20">
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              maxWidth: 580,
            }}
          >
            We started from a frustration. We&rsquo;re shipping it as a craft.
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-10 md:grid-cols-2">
            <div>
              <p style={{ fontSize: 15, lineHeight: 1.65, color: C.ink2 }}>
                The founder spent six years running an ecommerce brand chasing reviews like every
                other owner manual SMS blasts, awkward signs at checkout, dashboards across five
                tools, and an AI reply tab open in a sixth.
              </p>
              <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.65, color: C.ink2 }}>
                Repulabs is what we wished existed: one workspace that handles the request, the
                reply, the survey, the QR plaque, and the AI receptionist taking calls when
                you&rsquo;re behind the counter. Trained on your brand voice. Auditable down to the
                row.
              </p>
            </div>
            <div>
              <Stat
                label="Active locations"
                value="2,400+"
                hint="Across 14 countries on day-one of our pricing release"
              />
              <Stat
                label="Review requests sent"
                value="380K"
                hint="In the last 30 days and the corresponding 41K reviews collected"
              />
              <Stat
                label="Star delta"
                value="+0.6"
                hint="Average rating uplift across customers using Repulabs for 90+ days"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1080px] px-6 py-20">
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-8 sm:p-12"
          style={{
            background: C.surface,
            border: `1px solid ${C.line}`,
            boxShadow: C.shadowCard,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                color: C.pri,
                fontFamily: "var(--f-mono)",
                letterSpacing: ".14em",
                fontWeight: 600,
              }}
            >
              HQ
            </div>
            <h3
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                marginTop: 4,
              }}
            >
              Melbourne, Australia
            </h3>
            <p
              style={{
                fontSize: 14,
                color: C.mute,
                marginTop: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <MapPin size={13} /> Level 3, 530 Collins St · St Kilda Rd satellite
            </p>
          </div>
          <a
            href="mailto:info@repulabs.com"
            className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[13px] font-semibold transition-transform hover:-translate-y-px"
            style={{
              background: "linear-gradient(135deg, var(--pri, #2457ff) 0%, #1b3fd1 100%)",
              color: "#fff",
              boxShadow: "0 10px 26px -10px rgba(36, 87, 255, 0.55)",
            }}
          >
            Say hello → info@repulabs.com
          </a>
        </div>
      </section>
    </MarketingShell>
  );
}

function Pillar({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-2xl p-7"
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        boxShadow: C.shadowCard,
      }}
    >
      <div
        className="grid h-10 w-10 place-items-center rounded-xl"
        style={{ background: C.pri50, color: C.pri }}
      >
        {icon}
      </div>
      <h3 className="mt-4" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>
        {title}
      </h3>
      <p className="mt-2" style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
        {body}
      </p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="mb-6">
      <div
        style={{
          fontSize: 11,
          color: C.mute,
          fontFamily: "var(--f-mono)",
          letterSpacing: ".12em",
        }}
      >
        {label.toUpperCase()}
      </div>
      <div className="mt-1" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.025em" }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: C.mute, marginTop: 3 }}>{hint}</div>
    </div>
  );
}
