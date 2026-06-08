import { BRAND_LOGOS } from "@/components/landing/brand-logos";
import { LandingAnimations } from "@/components/landing/landing-animations";
import {
  PremiumIllustration,
  PremiumImageOverlay,
} from "@/components/landing/premium-illustration";
import { Logo } from "@/components/shell/logo";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleCheck,
  Inbox,
  MessageSquareText,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
  Star,
  Workflow,
} from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "repulabs — Turn every customer moment into reputation growth.",
  description:
    "The reputation command center for local businesses. Reviews, AI replies, a unified inbox, surveys, QR stands and an AI phone receptionist — one premium workspace, all in your brand voice.",
};

/* ============================================================
   Brand palette — STRICT. Mirrors app/globals.css :root tokens.
   Fallbacks are the real brand hexes (no stray teal).
============================================================ */
const C = {
  bg: "var(--bg, #f7f8fb)",
  bg2: "var(--bg-2, #eef1f6)",
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbfd)",
  surface3: "var(--surface-3, #f3f5f9)",
  ink: "var(--ink, #0f172a)",
  ink2: "var(--ink-2, #1e293b)",
  ink3: "var(--ink-3, #475569)",
  mute: "var(--rl-muted, #64748b)",
  mute2: "var(--rl-muted-2, #94a3b8)",
  line: "var(--line, #e2e8f0)",
  line2: "var(--line-2, #cbd5e1)",
  pri: "var(--pri, #2563eb)",
  pri50: "var(--pri-50, #eff6ff)",
  pri100: "var(--pri-100, #dbeafe)",
  pri300: "var(--pri-300, #93c5fd)",
  pri700: "var(--pri-700, #1d4ed8)",
  pri900: "var(--pri-900, #1e3a8a)",
  ok: "var(--ok, #16a34a)",
  warn: "var(--warn, #f59e0b)",
  bad: "var(--bad, #ef4444)",
  info: "var(--info, #0ea5e9)",
} as const;

/** Asset base for the founder-generated marketing illustrations. */
const ART = "/assets/repulabs/illustrations";

export default function Landing() {
  return (
    <main
      style={{
        background: C.bg,
        color: C.ink,
        fontFamily: "var(--f-ui)",
        letterSpacing: "-0.005em",
      }}
    >
      <TopNav />
      <Hero />
      <TrustStrip />
      <Features />
      <HowItWorks />
      <MetricsBand />
      <Integrations />
      <Pricing />
      <SocialProof />
      <Security />
      <Faq />
      <FinalCta />
      <Footer />
      {/* Client-only scroll/entrance animations. No-op without JS or with
          prefers-reduced-motion. Dynamically imports GSAP after LCP. */}
      <LandingAnimations />
    </main>
  );
}

/* ============================================================
   1. Top navigation — sticky, glass blur.
============================================================ */
function TopNav() {
  const links = [
    { href: "#features", label: "Product" },
    { href: "#how", label: "How it works" },
    { href: "#integrations", label: "Integrations" },
    { href: "#pricing", label: "Pricing" },
    { href: "#faq", label: "FAQ" },
  ];
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(247, 248, 251, .78)",
        backdropFilter: "saturate(180%) blur(14px)",
        WebkitBackdropFilter: "saturate(180%) blur(14px)",
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div className="mx-auto flex h-[66px] w-full max-w-[1200px] items-center gap-3 px-6">
        <Link
          href="/"
          aria-label="repulabs home"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <Logo size={30} />
        </Link>

        <nav className="ml-9 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1.5 text-[13.5px] font-medium transition-colors hover:bg-white"
              style={{ color: C.ink3 }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Link
            href="/login"
            className="hidden rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors hover:bg-white sm:inline-flex"
            style={{ color: C.ink2 }}
          >
            Log in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 transition-all hover:-translate-y-px active:translate-y-0"
            style={{
              height: 40,
              padding: "0 18px",
              borderRadius: 999,
              background: C.ink,
              color: "#fff",
              fontSize: 13.5,
              fontWeight: 600,
              boxShadow: "0 6px 18px -6px rgba(15,23,42,.45)",
            }}
          >
            Book a demo
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   2. Hero — left copy + dual CTA, right dashboard preview.
============================================================ */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="lp-grid absolute inset-0" aria-hidden />
      <div
        className="lp-spot lp-spot--teal"
        style={{ width: 760, height: 760, top: -320, left: "8%" }}
        aria-hidden
        data-lp-parallax="0.15"
      />
      <div
        className="lp-spot lp-spot--mint lp-float"
        style={{ width: 460, height: 460, top: 60, right: -120, opacity: 0.4 }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1200px] px-6 pb-20 pt-16 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.04fr_1fr]">
          {/* Left — copy */}
          <div className="lp-fade-up">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold"
              style={{
                borderColor: C.pri100,
                background: C.pri50,
                color: C.pri700,
                fontFamily: "var(--f-mono)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              <span className="relative inline-flex h-1.5 w-1.5">
                <span className="lp-ping" style={{ background: C.pri }} />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: C.pri }}
                />
              </span>
              Reputation command center
            </span>

            <h1
              className="mt-6"
              style={{
                fontSize: "clamp(38px, 5.4vw, 66px)",
                lineHeight: 1.04,
                letterSpacing: "-0.035em",
                fontWeight: 700,
                color: C.ink,
              }}
            >
              Turn every customer
              <br />
              moment into{" "}
              <span style={{ color: C.pri }}>reputation growth.</span>
            </h1>

            <p
              className="mt-6"
              style={{
                fontSize: 17.5,
                lineHeight: 1.6,
                color: C.ink3,
                maxWidth: 540,
              }}
            >
              repulabs brings reviews, requests, inboxes, AI replies, surveys, QR stands and phone
              calls into one premium workspace for local service teams — every reply in your brand
              voice.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0"
                style={{
                  height: 50,
                  padding: "0 26px",
                  borderRadius: 999,
                  background: C.ink,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 600,
                  boxShadow: "0 12px 30px -10px rgba(15,23,42,.5)",
                }}
              >
                Start free
                <ArrowRight size={15} />
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center gap-2 transition-colors hover:bg-white"
                style={{
                  height: 50,
                  padding: "0 22px",
                  borderRadius: 999,
                  background: C.surface,
                  border: `1px solid ${C.line2}`,
                  color: C.ink,
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                View product
              </Link>
            </div>

            <div
              className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2"
              style={{ fontSize: 13, color: C.mute }}
            >
              {["No card required", "Live in 6 minutes", "Cancel anytime"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <CircleCheck size={14} style={{ color: C.pri }} />
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — hero illustration + dashboard preview */}
          <div
            className="lp-fade-up relative"
            style={{ animationDelay: ".12s" }}
          >
            <div
              className="lp-gradient-border overflow-hidden"
              style={{
                borderRadius: 22,
                boxShadow:
                  "0 40px 80px -34px rgba(15,23,42,.34), 0 8px 24px -12px rgba(15,23,42,.12)",
              }}
            >
              {/* home-hero.png is the intended hero visual; the JSX dashboard
                  recreation below is the graceful fallback until it lands. */}
              <PremiumImageOverlay
                src={`${ART}/home-hero.png`}
                alt="repulabs reputation command center dashboard"
                fallback={<HeroPreview />}
              />
            </div>

            {/* Floating stat chip accent for depth. */}
            <div
              className="lp-float-2 absolute hidden items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 lg:flex"
              style={{
                bottom: -22,
                left: -28,
                background: C.surface,
                borderColor: C.line,
                boxShadow: "0 18px 40px -18px rgba(15,23,42,.28)",
              }}
              aria-hidden
            >
              <span
                className="grid h-9 w-9 place-items-center rounded-xl"
                style={{ background: C.pri50, color: C.pri, border: `1px solid ${C.pri100}` }}
              >
                <Star size={16} fill="currentColor" />
              </span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>+47</div>
                <div style={{ fontSize: 10.5, color: C.mute }}>reviews this month</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * HeroPreview — JSX recreation of the in-app dashboard so the hero shows what
 * the product actually looks like. Mirrors 01_public-home.png: KPI tiles +
 * "Review growth" chart + a row of mini-stat cards.
 */
function HeroPreview() {
  const kpis = [
    { l: "Rating", v: "4.72", d: "+0.18", up: true },
    { l: "Requests", v: "286", d: "62% open" },
    { l: "AI replies", v: "38", d: "3 pending", pri: true },
  ];
  // 12 weekly bars, rising — matches the artboard "Review growth" chart.
  const bars = [34, 40, 38, 52, 48, 60, 57, 70, 66, 82, 88, 96];
  return (
    <div style={{ background: C.surface }}>
      {/* faux window chrome */}
      <div
        className="flex items-center gap-1.5 border-b px-4 py-3"
        style={{ borderColor: C.line, background: C.surface2 }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f87171" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#fbbf24" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#34d399" }} />
        <span
          className="ml-3 text-[10.5px]"
          style={{ color: C.mute2, fontFamily: "var(--f-mono)", letterSpacing: ".04em" }}
        >
          app.repulabs.com / dashboard
        </span>
      </div>

      <div style={{ padding: 18 }}>
        <div className="grid grid-cols-3 gap-2.5">
          {kpis.map((k) => (
            <div
              key={k.l}
              className="rounded-xl border p-3"
              style={{ borderColor: C.line, background: C.surface2 }}
            >
              <div className="text-[10.5px]" style={{ color: C.mute }}>
                {k.l}
              </div>
              <div
                className="mt-1 flex items-baseline gap-1"
                style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                {k.v}
                {k.pri && (
                  <span
                    className="ml-auto h-1.5 w-1.5 rounded-full"
                    style={{ background: C.pri }}
                  />
                )}
              </div>
              <div
                className="mt-0.5 text-[10.5px]"
                style={{ color: k.up ? C.ok : C.mute, fontWeight: 600 }}
              >
                {k.d}
              </div>
            </div>
          ))}
        </div>

        {/* Review growth chart */}
        <div
          className="mt-3 rounded-xl border p-4"
          style={{ borderColor: C.line, background: C.surface }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink2 }}>Review growth</div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: C.pri50, color: C.pri700 }}
            >
              <span className="h-1 w-1 rounded-full" style={{ background: C.pri }} />
              Live
            </span>
          </div>
          <div className="flex h-[88px] items-end gap-1.5">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${h}%`,
                  background:
                    i >= bars.length - 3
                      ? "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)"
                      : "linear-gradient(180deg, #93c5fd 0%, #dbeafe 100%)",
                }}
              />
            ))}
          </div>
        </div>

        {/* Mini stat row */}
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {[
            { l: "AI replies", v: "184 sent", c: C.pri },
            { l: "Inbox hub", v: "12 open", c: C.info },
            { l: "QR stands", v: "8 active", c: C.ok },
          ].map((s) => (
            <div
              key={s.l}
              className="rounded-xl border p-2.5"
              style={{ borderColor: C.line, background: C.surface2 }}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.c }} />
                <span className="text-[10px]" style={{ color: C.mute }}>
                  {s.l}
                </span>
              </div>
              <div className="mt-1 text-[12.5px] font-semibold" style={{ color: C.ink2 }}>
                {s.v}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   3. Trust / logo strip.
============================================================ */
function TrustStrip() {
  const logos = [
    "Northwind",
    "Greenboard",
    "Stellaris",
    "Helios Co.",
    "Bricklane",
    "Sunrise",
    "Brightway",
    "Pinecroft",
    "Quill & Co.",
    "Atlas POS",
  ];
  const row = [...logos, ...logos];
  return (
    <section
      className="lp-marquee--pause border-y"
      style={{ borderColor: C.line, background: C.surface2, padding: "26px 0" }}
      aria-label="Trusted by local businesses"
    >
      <div className="mx-auto max-w-[1200px] px-6">
        <div
          className="mb-5 text-center text-[11px] font-semibold"
          style={{ color: C.mute, fontFamily: "var(--f-mono)", letterSpacing: ".14em" }}
        >
          TRUSTED BY 1,200+ LOCAL OPERATORS
        </div>
      </div>
      <div
        className="overflow-hidden"
        style={{
          maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        <div className="lp-marquee">
          {row.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="shrink-0 px-10 text-[18px] font-semibold"
              style={{ color: C.mute2, letterSpacing: "-0.015em" }}
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   4. Feature grid — 7 surfaces, each with feat-*.png + fallback.
============================================================ */
type Feature = {
  glyph:
    | "reviews"
    | "phone"
    | "qr"
    | "inbox"
    | "surveys"
    | "analytics"
    | "autopilot";
  file: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  desc: string;
};

function Features() {
  const hero: Feature = {
    glyph: "reviews",
    file: "feat-reviews.png",
    icon: <Star size={14} />,
    eyebrow: "REVIEWS",
    title: "Reviews, answered in your voice",
    desc: "Pull every Google, Facebook and listing review into one feed. The AI drafts a reply trained on your brand guide, service catalog and refund policy — you approve and publish in a single click. Every response sounds like your best manager wrote it.",
  };
  const grid: Feature[] = [
    {
      glyph: "phone",
      file: "feat-ai-phone.png",
      icon: <Phone size={14} />,
      eyebrow: "AI PHONE",
      title: "AI phone receptionist",
      desc: "Answers every call in a cloned voice and books appointments around the clock.",
    },
    {
      glyph: "qr",
      file: "feat-qr-nfc.png",
      icon: <QrCode size={14} />,
      eyebrow: "QR + NFC",
      title: "QR & NFC review stands",
      desc: "Counter cards and brass plaques that turn one tap into a 5-star review.",
    },
    {
      glyph: "inbox",
      file: "feat-inbox.png",
      icon: <Inbox size={14} />,
      eyebrow: "UNIFIED INBOX",
      title: "One inbox, every channel",
      desc: "Comments, DMs, SMS and live chat from every connected page in one view.",
    },
    {
      glyph: "surveys",
      file: "feat-surveys.png",
      icon: <MessageSquareText size={14} />,
      eyebrow: "SURVEYS",
      title: "Surveys with smart routing",
      desc: "Happy customers get nudged to public reviews; unhappy ones route privately to you.",
    },
    {
      glyph: "analytics",
      file: "feat-analytics.png",
      icon: <BarChart3 size={14} />,
      eyebrow: "ANALYTICS",
      title: "Reputation analytics",
      desc: "Rating trends, sentiment and channel mix — with revenue attribution per location.",
    },
    {
      glyph: "autopilot",
      file: "feat-autopilot.png",
      icon: <Workflow size={14} />,
      eyebrow: "AUTOPILOT",
      title: "Reputation on autopilot",
      desc: "Drag-and-drop rules trigger from your POS or CRM, wait, then send the perfect follow-up.",
    },
  ];

  return (
    <section id="features" className="mx-auto max-w-[1200px] px-6 py-24">
      <SectionLabel>THE PLATFORM</SectionLabel>
      <SectionHeading>
        Seven surfaces. <span style={{ color: C.ink }}>One workspace.</span>
      </SectionHeading>
      <SectionDescription>
        Stop duct-taping point tools together. repulabs runs the entire reputation stack in one
        place, with the same brand voice flowing through every reply.
      </SectionDescription>

      {/* Hero feature — full-width split card. */}
      <div className="mt-14" data-lp-anim="rise">
        <HeroFeatureCard {...hero} />
      </div>

      {/* Even 3 × 2 grid for the remaining six. */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {grid.map((f) => (
          <FeatureCard key={f.title} {...f} />
        ))}
      </div>
    </section>
  );
}

function FeatureEyebrow({ icon, eyebrow }: { icon: React.ReactNode; eyebrow: string }) {
  return (
    <div
      className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold"
      style={{
        borderColor: C.pri100,
        background: C.pri50,
        color: C.pri700,
        fontFamily: "var(--f-mono)",
        letterSpacing: ".08em",
      }}
    >
      {icon}
      {eyebrow}
    </div>
  );
}

function HeroFeatureCard({ glyph, file, icon, eyebrow, title, desc }: Feature) {
  return (
    <article className="lp-bento grid items-center gap-8 p-7 sm:p-9 lg:grid-cols-[1fr_1.05fr]">
      <div>
        <FeatureEyebrow icon={icon} eyebrow={eyebrow} />
        <h3
          className="mt-4"
          style={{ fontSize: "clamp(22px, 2.4vw, 30px)", fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          {title}
        </h3>
        <p className="mt-3" style={{ fontSize: 15, color: C.mute, lineHeight: 1.65, maxWidth: 460 }}>
          {desc}
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold transition-colors"
          style={{ color: C.pri }}
        >
          See it in action
          <ArrowRight size={14} />
        </Link>
      </div>
      <div>
        <PremiumIllustration
          src={`${ART}/${file}`}
          alt={`${title} illustration`}
          glyph={glyph}
          ratio="16 / 10"
          rounded={16}
          tone="tint"
        />
      </div>
    </article>
  );
}

function FeatureCard({ glyph, file, icon, eyebrow, title, desc }: Feature) {
  return (
    <article className="lp-bento flex flex-col p-6" data-lp-anim="rise" style={{ minHeight: 240 }}>
      <FeatureEyebrow icon={icon} eyebrow={eyebrow} />
      <h3 className="mt-4" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
        {title}
      </h3>
      <p className="mt-2" style={{ fontSize: 13, color: C.mute, lineHeight: 1.6 }}>
        {desc}
      </p>
      <div className="mt-5 flex-1">
        <PremiumIllustration
          src={`${ART}/${file}`}
          alt={`${title} illustration`}
          glyph={glyph}
          ratio="16 / 9"
          rounded={14}
          tone="tint"
        />
      </div>
    </article>
  );
}

/* ============================================================
   5. How it works — 3 steps.
============================================================ */
function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Connect your business",
      desc: "One-click OAuth to Google Business, Meta and your POS. We import historical reviews so the AI has context from day one.",
    },
    {
      n: "02",
      title: "Train the AI on your voice",
      desc: "Upload your service catalog, brand guide and refund policy. repulabs builds a voice model that matches your tone exactly.",
    },
    {
      n: "03",
      title: "Turn on autopilot",
      desc: "Switch on review requests, AI replies and the phone receptionist. Approve what matters; let the rest run itself.",
    },
  ];
  return (
    <section id="how" className="border-y" style={{ borderColor: C.line, background: C.surface2 }}>
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <SectionLabel>HOW IT WORKS</SectionLabel>
        <SectionHeading>
          Live in <span style={{ color: C.ink }}>under 10 minutes.</span>
        </SectionHeading>
        <SectionDescription>
          No engineer, no consultant. The setup wizard connects your first integration, learns your
          brand voice, and turns on automation.
        </SectionDescription>

        <div className="relative mt-16 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* connector line on desktop */}
          <div
            className="absolute left-0 right-0 top-[31px] hidden lg:block"
            aria-hidden
            style={{
              height: 2,
              background: `repeating-linear-gradient(90deg, ${C.line2} 0 8px, transparent 8px 16px)`,
            }}
          />
          {steps.map((s) => (
            <div key={s.n} className="relative" data-lp-anim="rise">
              <div
                className="grid place-items-center text-[15px] font-bold"
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 18,
                  background: C.surface,
                  border: `1px solid ${C.line2}`,
                  color: C.pri,
                  fontFamily: "var(--f-mono)",
                  boxShadow: "0 8px 20px -10px rgba(15,23,42,.18)",
                }}
              >
                {s.n}
              </div>
              <h3
                className="mt-5"
                style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                {s.title}
              </h3>
              <p className="mt-2" style={{ fontSize: 14.5, color: C.mute, lineHeight: 1.6 }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   6. Metrics / social-proof band — dark, matches artboard footer band.
============================================================ */
function MetricsBand() {
  const stats = [
    { v: "4.8★", l: "Average review score", s: "Across 200+ SMB pilots" },
    { v: "71%", l: "AI reply acceptance", s: "Published without edits" },
    { v: "1.6s", l: "Avg AI draft time", s: "Reply ready to approve" },
    { v: "$48k", l: "Annual revenue lift", s: "Median per location, 12mo" },
  ];
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #0f172a 0%, #111c33 100%)",
        color: "#fff",
      }}
    >
      <div className="lp-grid absolute inset-0 opacity-25" aria-hidden />
      <div
        className="lp-spot"
        style={{
          width: 620,
          height: 620,
          top: -240,
          left: "50%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(37,99,235,.5) 0%, transparent 70%)",
          opacity: 0.55,
        }}
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-[1200px] grid-cols-2 gap-px md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.l}
            className="px-8 py-14"
            style={{
              borderLeft: i > 0 ? "1px solid rgba(255,255,255,.08)" : undefined,
            }}
            data-lp-anim="rise"
          >
            <div
              style={{
                fontSize: 46,
                fontWeight: 700,
                letterSpacing: "-0.035em",
                lineHeight: 1,
                background: "linear-gradient(135deg, #ffffff 0%, #93c5fd 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {s.v}
            </div>
            <div className="mt-4" style={{ fontSize: 15, fontWeight: 600 }}>
              {s.l}
            </div>
            <div className="mt-1" style={{ fontSize: 12.5, color: "#94a3b8" }}>
              {s.s}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   7. Integrations.
============================================================ */
function Integrations() {
  return (
    <section id="integrations" className="mx-auto max-w-[1200px] px-6 py-24">
      <SectionLabel>INTEGRATIONS</SectionLabel>
      <SectionHeading>
        Lives where your <span style={{ color: C.ink }}>business already lives.</span>
      </SectionHeading>
      <SectionDescription>
        Two-click native connections to the review hosts, social channels, payment systems and CRMs
        your reputation depends on.
      </SectionDescription>

      <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {BRAND_LOGOS.map(({ name, Icon, color }) => (
          <div
            key={name}
            className="lp-bento group flex flex-col items-center justify-center gap-3 py-6"
            data-lp-stagger="integration"
          >
            <div
              className="grid h-12 w-12 place-items-center rounded-xl transition-colors"
              style={{
                background: `linear-gradient(140deg, ${C.surface} 0%, ${C.surface2} 100%)`,
                border: `1px solid ${C.line}`,
                color,
              }}
            >
              <Icon size={22} />
            </div>
            <span className="text-[11.5px] font-medium" style={{ color: C.ink2 }}>
              {name}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-[12.5px]" style={{ color: C.mute }}>
        And 30+ more via{" "}
        <Link
          href="/connections"
          className="underline"
          style={{ color: C.pri, textUnderlineOffset: 3 }}
        >
          our connections marketplace
        </Link>{" "}
        — Zapier-bridged for anything not yet native.
      </p>
    </section>
  );
}

/* ============================================================
   8. Pricing teaser.
============================================================ */
function Pricing() {
  const STANDARD = [
    "QR review cards & plaques",
    "Up to 50 review requests / mo",
    "Live Google review feed",
    "Basic spam filter",
  ];
  const PRO = [
    "Everything in Standard",
    "Unlimited review requests",
    "AI replies in your brand voice",
    "Unified cross-channel inbox",
    "Surveys with smart routing",
    "AI phone receptionist · 200 min",
  ];
  const SCALE = [
    "Everything in Pro",
    "SSO + SAML + audit logs",
    "Multi-brand workspaces",
    "Dedicated success manager",
    "Custom voice clone",
  ];
  return (
    <section
      id="pricing"
      className="border-y"
      style={{ borderColor: C.line, background: C.surface2 }}
    >
      <div className="mx-auto max-w-[1200px] px-6 py-24">
        <SectionLabel>PRICING</SectionLabel>
        <SectionHeading>
          Honest pricing. <span style={{ color: C.ink }}>No per-seat surprises.</span>
        </SectionHeading>

        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
          <PriceCard
            name="Standard"
            price="Free"
            period="forever · 1 location"
            features={STANDARD}
            cta="Start free"
          />
          <PriceCard
            name="Pro"
            badge="MOST POPULAR"
            price="$59.99"
            priceSuffix="/mo"
            period="per location · billed annually"
            features={PRO}
            cta="Start 30-day trial"
            accent
          />
          <PriceCard
            name="Scale"
            price="Custom"
            period="10+ locations · multi-brand"
            features={SCALE}
            cta="Talk to sales"
            ctaHref="mailto:sales@repulabs.com"
          />
        </div>
        <p className="mt-6 text-center text-[12.5px]" style={{ color: C.mute }}>
          All plans include a 30-day free trial. No card required to start.
        </p>
      </div>
    </section>
  );
}

function PriceCard({
  name,
  badge,
  price,
  priceSuffix,
  period,
  features,
  cta,
  ctaHref,
  accent,
}: {
  name: string;
  badge?: string;
  price: string;
  priceSuffix?: string;
  period: string;
  features: string[];
  cta: string;
  ctaHref?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={accent ? "lp-gradient-border" : ""}
      style={{
        borderRadius: 18,
        background: C.surface,
        border: accent ? undefined : `1px solid ${C.line}`,
        padding: 26,
        position: "relative",
        boxShadow: accent ? "0 26px 60px -28px rgba(37,99,235,.4)" : undefined,
      }}
    >
      {badge && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider text-white"
          style={{
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            fontFamily: "var(--f-mono)",
            boxShadow: "0 8px 20px -8px rgba(37,99,235,.6)",
          }}
        >
          {badge}
        </span>
      )}
      <div
        className="text-[11px] font-semibold"
        style={{
          color: accent ? C.pri : C.mute,
          fontFamily: "var(--f-mono)",
          letterSpacing: ".12em",
        }}
      >
        {name.toUpperCase()}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.03em" }}>{price}</span>
        {priceSuffix && (
          <span style={{ fontSize: 15, color: C.mute, fontWeight: 600 }}>{priceSuffix}</span>
        )}
      </div>
      <div className="mt-1" style={{ fontSize: 12.5, color: C.mute }}>
        {period}
      </div>
      <Link
        href={ctaHref ?? "/login"}
        className="mt-5 inline-flex w-full items-center justify-center gap-1.5 transition-all hover:-translate-y-px active:translate-y-0"
        style={{
          height: 44,
          borderRadius: 12,
          background: accent ? C.ink : C.surface2,
          color: accent ? "#fff" : C.ink,
          border: accent ? "none" : `1px solid ${C.line2}`,
          fontSize: 14,
          fontWeight: 600,
          boxShadow: accent ? "0 10px 26px -10px rgba(15,23,42,.5)" : undefined,
        }}
      >
        {cta}
        {accent && <ArrowRight size={14} />}
      </Link>
      <div className="my-5 h-px" style={{ background: C.line }} />
      <ul className="space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2" style={{ fontSize: 13.5, color: C.ink2 }}>
            <Check size={14} style={{ color: C.pri, flexShrink: 0, marginTop: 3 }} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   9. Social proof — generic, no fake named testimonials.
============================================================ */
function SocialProof() {
  const items = [
    {
      q: "We went from a handful of reviews a month to dozens — and our rating climbed past 4.8. The AI sounds like our best manager on a good day.",
      r: "Multi-location dental group",
    },
    {
      q: "Our front desk used to spend over an hour a day chasing review follow-ups. Now it's automated and they're free for actual patients.",
      r: "Family medical clinic",
    },
    {
      q: "The unified inbox and AI phone line mean nothing slips. Every call answered, every comment replied to — in our voice.",
      r: "Regional restaurant group",
    },
  ];
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-24">
      <SectionLabel>LOVED BY OPERATORS</SectionLabel>
      <SectionHeading>
        From hi-vis trades <span style={{ color: C.ink }}>to D2C founders.</span>
      </SectionHeading>
      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((t) => (
          <article key={t.r} className="lp-bento p-7" data-lp-anim="rise">
            <div className="mb-4 flex items-center gap-0.5" style={{ color: C.warn }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} size={15} fill="currentColor" />
              ))}
            </div>
            <p style={{ fontSize: 15, color: C.ink2, lineHeight: 1.65 }}>&ldquo;{t.q}&rdquo;</p>
            <div className="mt-6 flex items-center gap-3">
              <span
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{ background: C.pri50, color: C.pri, border: `1px solid ${C.pri100}` }}
              >
                <ShieldCheck size={16} />
              </span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Verified customer</div>
                <div style={{ fontSize: 11.5, color: C.mute }}>{t.r}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   10. Security.
============================================================ */
function Security() {
  const items = [
    {
      t: "AES-256 at rest, TLS 1.3 in transit",
      d: "Every byte of customer data encrypted by default — including the OAuth tokens we hold for your integrations.",
    },
    {
      t: "SOC 2 Type II",
      d: "Independently audited security controls. DPA available on request, with GDPR + CCPA addenda.",
    },
    {
      t: "No model training on your data",
      d: "Your customer data never leaves your tenant. Every AI call uses a no-training data agreement.",
    },
  ];
  const badges = ["SOC 2", "GDPR", "HIPAA·add-on", "ISO 27001", "PCI DSS", "APP·AU"];
  return (
    <section className="mx-auto max-w-[1200px] px-6 py-24">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <SectionLabel align="left">SECURITY &amp; COMPLIANCE</SectionLabel>
          <h2
            className="mt-3"
            style={{
              fontSize: "clamp(30px, 4vw, 44px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1.08,
            }}
          >
            Enterprise-grade security{" "}
            <span style={{ color: C.ink }}>at small-business prices.</span>
          </h2>
          <div className="mt-8 space-y-6">
            {items.map((it) => (
              <div key={it.t} className="flex items-start gap-3">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                  style={{ background: C.pri50, color: C.pri, border: `1px solid ${C.pri100}` }}
                >
                  <ShieldCheck size={16} />
                </span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{it.t}</div>
                  <p className="mt-1" style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.6 }}>
                    {it.d}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border p-6" style={{ borderColor: C.line, background: C.surface }}>
          <div
            className="text-[11px] font-semibold"
            style={{ color: C.mute, fontFamily: "var(--f-mono)", letterSpacing: ".12em" }}
          >
            COMPLIANCE BADGES
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {badges.map((b) => (
              <div
                key={b}
                className="rounded-xl border px-3 py-4 text-center"
                style={{ borderColor: C.line, background: C.surface2 }}
              >
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: C.ink2, letterSpacing: "0.03em" }}
                >
                  {b.split("·")[0]}
                </div>
                {b.includes("·") && (
                  <div className="text-[9px]" style={{ color: C.mute, marginTop: 2 }}>
                    {b.split("·")[1]}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div
            className="mt-6 flex items-center gap-2 rounded-xl border p-3.5 text-[12px] font-medium"
            style={{ borderColor: C.pri100, background: C.pri50, color: C.pri700 }}
          >
            <span className="relative grid h-2 w-2 place-items-center" aria-hidden>
              <span className="lp-ping" style={{ background: C.ok }} />
              <span className="relative h-2 w-2 rounded-full" style={{ background: C.ok }} />
            </span>
            All systems operational ·{" "}
            <span style={{ fontFamily: "var(--f-mono)" }}>status.repulabs.com</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   11. FAQ.
============================================================ */
function Faq() {
  const items = [
    {
      q: "How quickly can I set up repulabs?",
      a: "Most teams are sending automated requests within 6 minutes. Connect Google Business, plug in one POS or CRM, and the wizard does the rest.",
    },
    {
      q: "Does the AI actually sound like me?",
      a: "It learns from your service catalog, brand guide and refund policy. After a handful of approvals it matches your voice closely enough that most operators stop editing drafts.",
    },
    {
      q: "Can I use the AI receptionist with my existing number?",
      a: "Yes. We provide a new number you can advertise directly or forward your existing line to. Calls are recorded, transcribed and synced to your CRM.",
    },
    {
      q: "Is my customer data secure?",
      a: "AES-256 at rest, TLS 1.3 in transit, SOC 2 Type II audited. Your data never trains a shared model. A full DPA is available on request.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes — one click from Settings → Subscription. No annual-only lock-in, and prorated refunds are handled within one business day.",
    },
  ];
  return (
    <section id="faq" className="mx-auto max-w-[820px] px-6 py-24">
      <SectionLabel>FAQ</SectionLabel>
      <SectionHeading>Common questions.</SectionHeading>

      <div className="mt-12 space-y-2.5">
        {items.map((it, i) => (
          <details
            key={it.q}
            className="group rounded-xl border"
            style={{ borderColor: C.line, background: C.surface }}
            open={i === 0}
          >
            <summary
              className="flex cursor-pointer list-none items-center gap-4 px-5 py-4"
              style={{ fontSize: 15, fontWeight: 600 }}
            >
              <span style={{ flex: 1 }}>{it.q}</span>
              <ChevronDown
                size={16}
                className="transition-transform group-open:rotate-180"
                style={{ color: C.mute }}
              />
            </summary>
            <div className="px-5 pb-5" style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
              {it.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   12. Final CTA.
============================================================ */
function FinalCta() {
  return (
    <section className="relative mx-auto max-w-[1200px] px-6 pb-24">
      <div
        className="relative overflow-hidden rounded-3xl px-8 py-20 text-center"
        style={{
          background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #1e3a8a 100%)",
          color: "#fff",
          boxShadow: "0 40px 90px -30px rgba(37,99,235,.55)",
        }}
      >
        <div className="lp-grid absolute inset-0 opacity-20" aria-hidden />
        <div
          className="lp-spot"
          style={{
            width: 560,
            height: 560,
            top: -200,
            left: "50%",
            transform: "translateX(-50%)",
            background: "radial-gradient(circle, rgba(147,197,253,.5) 0%, transparent 70%)",
            opacity: 0.7,
          }}
          aria-hidden
        />
        <div className="relative">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold"
            style={{
              background: "rgba(255,255,255,.14)",
              color: "#dbeafe",
              fontFamily: "var(--f-mono)",
              letterSpacing: ".1em",
            }}
          >
            <Sparkles size={11} /> GET STARTED
          </span>
          <h2
            className="mx-auto mt-6 max-w-[760px]"
            style={{
              fontSize: "clamp(32px, 5.2vw, 58px)",
              fontWeight: 700,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
            }}
          >
            The reputation command center
            <br />
            <span style={{ color: "#dbeafe" }}>your business deserves.</span>
          </h2>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 transition-all hover:-translate-y-0.5 active:translate-y-0"
              style={{
                height: 50,
                padding: "0 26px",
                borderRadius: 999,
                background: "#fff",
                color: C.pri700,
                fontSize: 15,
                fontWeight: 700,
                boxShadow: "0 14px 30px -10px rgba(0,0,0,.4)",
              }}
            >
              Start free
              <ArrowRight size={15} />
            </Link>
            <Link
              href="mailto:sales@repulabs.com"
              className="inline-flex items-center gap-2"
              style={{
                height: 50,
                padding: "0 22px",
                borderRadius: 999,
                background: "rgba(255,255,255,.1)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                border: "1px solid rgba(255,255,255,.28)",
              }}
            >
              Book a demo
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div
            className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px]"
            style={{ color: "#bfdbfe" }}
          >
            {["No card required", "Live in 6 minutes", "Cancel anytime"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CircleCheck size={13} style={{ color: "#fff" }} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   13. Footer.
============================================================ */
function Footer() {
  const cols: Array<{ h: string; links: Array<{ label: string; href: string }> }> = [
    {
      h: "Product",
      links: [
        { label: "Dashboard", href: "/dashboard" },
        { label: "Review requests", href: "/outreach" },
        { label: "Inbox", href: "/reviews" },
        { label: "AI training", href: "/ai/training" },
        { label: "Phone receptionist", href: "/phone" },
        { label: "Surveys", href: "/surveys" },
        { label: "QR plaques", href: "/hardware" },
      ],
    },
    {
      h: "Resources",
      links: [
        { label: "Docs", href: "/docs" },
        { label: "API reference", href: "/docs/api" },
        { label: "Changelog", href: "/changelog" },
        { label: "Status", href: "/status" },
        { label: "Brand assets", href: "/brand" },
      ],
    },
    {
      h: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Customers", href: "/customers" },
        { label: "Press", href: "/press" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      h: "Legal",
      links: [
        { label: "Privacy", href: "/legal/privacy" },
        { label: "Terms", href: "/legal/terms" },
        { label: "Security", href: "/legal/security" },
        { label: "DPA", href: "/legal/dpa" },
        { label: "Sub-processors", href: "/legal/subprocessors" },
        { label: "Cookies", href: "/legal/cookies" },
      ],
    },
  ];
  return (
    <footer className="border-t" style={{ borderColor: C.line, background: C.surface2 }}>
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_3fr]">
          <div>
            <Link
              href="/"
              aria-label="repulabs home"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Logo size={44} />
            </Link>
            <p
              className="mt-5 max-w-[320px]"
              style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}
            >
              The reputation command center for ambitious local businesses. Built for the teams who
              live and die by their review stars.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px]"
                style={{ borderColor: C.line, background: C.surface, color: C.mute }}
              >
                <span className="relative grid h-1.5 w-1.5 place-items-center" aria-hidden>
                  <span className="lp-ping" style={{ background: C.ok }} />
                  <span className="relative h-1.5 w-1.5 rounded-full" style={{ background: C.ok }} />
                </span>
                <Link href="/status" style={{ color: "inherit", textDecoration: "none" }}>
                  All systems operational
                </Link>
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] transition-colors hover:bg-white"
                style={{ borderColor: C.line, color: C.mute, background: C.surface }}
              >
                Contact sales
                <ArrowUpRight size={11} />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4">
            {cols.map((col) => (
              <div key={col.h}>
                <div
                  className="mb-5 text-[10.5px]"
                  style={{
                    color: C.mute,
                    fontFamily: "var(--f-mono)",
                    letterSpacing: ".14em",
                    fontWeight: 600,
                  }}
                >
                  {col.h.toUpperCase()}
                </div>
                <ul className="space-y-3">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="text-[13px] transition-colors hover:underline"
                        style={{ color: C.ink2, textUnderlineOffset: 3 }}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div
          className="mt-14 flex flex-wrap items-center justify-between gap-3 border-t pt-6"
          style={{ borderColor: C.line, fontSize: 11.5, color: C.mute }}
        >
          <span>© 2026 repulabs Pty Ltd. All rights reserved.</span>
          <span style={{ fontFamily: "var(--f-mono)", letterSpacing: ".06em" }}>
            v3.0 · JUN 2026
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ============================================================
   Section helpers.
============================================================ */
function SectionLabel({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={align === "center" ? "text-center" : "text-left"}
      style={{
        fontSize: 11,
        color: C.pri,
        fontFamily: "var(--f-mono)",
        letterSpacing: ".16em",
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mx-auto mt-3 text-center"
      style={{
        fontSize: "clamp(30px, 4.4vw, 50px)",
        fontWeight: 700,
        letterSpacing: "-0.035em",
        lineHeight: 1.06,
        maxWidth: 820,
        color: C.ink,
      }}
    >
      {children}
    </h2>
  );
}

function SectionDescription({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="mx-auto mt-5 text-center"
      style={{ fontSize: 16.5, color: C.mute, lineHeight: 1.6, maxWidth: 640 }}
    >
      {children}
    </p>
  );
}
