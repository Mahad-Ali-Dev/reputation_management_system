import {
  AnalyticsScene,
  DashboardScene,
  OutreachScene,
  PhoneScene,
  QrScene,
  ReviewsInboxScene,
  SceneFrame,
} from "@/components/landing/app-scenes";
import { BRAND_LOGOS } from "@/components/landing/brand-logos";
import { LandingAnimations } from "@/components/landing/landing-animations";
import { Logo } from "@/components/shell/logo";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleCheck,
  Flag,
  Inbox,
  Phone,
  QrCode,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "repulabs — Run your reputation like a system.",
  description:
    "The reputation operating system for local businesses. Requests, replies, surveys, social, phone — all rooted in your brand voice, all in one workspace.",
};

/* ============================================================
   Tokens used inline (mirror app/globals.css).
============================================================ */
const C = {
  bg: "var(--bg, #F6F7F4)",
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbf8)",
  surface3: "var(--surface-3, #f2f4ef)",
  ink: "var(--ink, #0B0D0E)",
  ink2: "var(--ink-2, #1e2225)",
  ink3: "var(--ink-3, #3a4046)",
  mute: "var(--rl-muted, #61697a)",
  mute2: "var(--rl-muted-2, #8e96a4)",
  line: "var(--line, #eceeea)",
  line2: "var(--line-2, #d8dcd3)",
  pri: "var(--pri, #2563EB)",
  pri50: "var(--pri-50, #ECFDF7)",
  pri100: "var(--pri-100, #cffaf0)",
  pri700: "var(--pri-700, #0f766e)",
  ok: "var(--ok, #10b981)",
  warn: "var(--warn, #f59e0b)",
  bad: "var(--bad, #ef4444)",
  info: "var(--info, #0ea5e9)",
} as const;

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
      <LogoMarquee />
      <HowItWorks />
      <ProductTour />
      <BentoFeatures />
      <Comparison />
      <StatsBand />
      <Integrations />
      <Pricing />
      <Testimonials />
      <Security />
      <Faq />
      <FinalCta />
      <Footer />
      {/* Client-only scroll/entrance animations. No-op when JS disabled or
          prefers-reduced-motion is set. Loaded after LCP via dynamic import
          inside the component. */}
      <LandingAnimations />
    </main>
  );
}

/* ============================================================
   1. Top navigation — sticky, glass blur, NEW pill.
============================================================ */
function TopNav() {
  const links = [
    { href: "#features", label: "Product" },
    { href: "#pricing", label: "Pricing" },
    { href: "#integrations", label: "Integrations" },
    { href: "#testimonials", label: "Customers" },
    { href: "#faq", label: "FAQ" },
  ];
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(246, 247, 244, .72)",
        backdropFilter: "saturate(180%) blur(12px)",
        WebkitBackdropFilter: "saturate(180%) blur(12px)",
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div className="mx-auto flex h-[64px] w-full max-w-[1280px] items-center gap-3 px-6">
        <Link
          href="/"
          aria-label="Repulabs home"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <Logo size={32} />
        </Link>

        <nav className="ml-8 hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-white/60"
              style={{ color: C.mute }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span
            className="hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold sm:inline-flex"
            style={{
              fontFamily: "var(--f-mono)",
              background: C.pri50,
              color: C.pri700,
              border: `1px solid ${C.pri100}`,
              letterSpacing: "0.06em",
            }}
          >
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="lp-ping" style={{ background: C.pri }} />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ background: C.pri }}
              />
            </span>
            NEW · AI PHONE 2.0
          </span>
          <Link
            href="/login"
            className="rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-white/60"
            style={{ color: C.mute }}
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 transition-all active:translate-y-px"
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 999,
              background: C.ink,
              color: "#fff",
              fontSize: 13,
              fontWeight: 500,
              boxShadow: "0 4px 14px -4px rgba(11,13,14,.4)",
            }}
          >
            Start free trial
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   2. Hero — grid background, spotlight glows, dashboard preview.
============================================================ */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="lp-grid absolute inset-0" aria-hidden />
      <div
        className="lp-spot lp-spot--teal"
        style={{
          width: 720,
          height: 720,
          top: -260,
          left: "50%",
          transform: "translateX(-50%)",
        }}
        aria-hidden
      />
      <div
        className="lp-spot lp-spot--mint lp-float"
        style={{ width: 460, height: 460, top: 120, right: -140 }}
        aria-hidden
      />
      <div
        className="lp-spot lp-spot--mint lp-float-2"
        style={{ width: 360, height: 360, top: 380, left: -120 }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1280px] px-6 pb-12 pt-20 sm:pt-28">
        <div className="lp-fade-up mx-auto max-w-[820px] text-center">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium"
            style={{
              borderColor: C.pri100,
              background: "rgba(236, 253, 247, .7)",
              color: C.pri700,
              fontFamily: "var(--f-mono)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <Sparkles size={11} />
            The reputation OS
          </span>
          <h1
            className="mt-6"
            style={{
              fontSize: "clamp(40px, 7vw, 80px)",
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              fontWeight: 600,
            }}
          >
            Reputation,
            <br />
            <span className="lp-text-gradient">run like a system.</span>
          </h1>
          <p
            className="mx-auto mt-6"
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: C.ink3,
              maxWidth: 620,
            }}
          >
            One workspace for the boring-but-critical work of being well-spoken-of: requests,
            replies, surveys, social, phone — all rooted in your brand voice.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 transition-all active:translate-y-px"
              style={{
                height: 46,
                padding: "0 22px",
                borderRadius: 999,
                background: C.ink,
                color: "#fff",
                fontSize: 14,
                fontWeight: 500,
                boxShadow: "0 10px 30px -8px rgba(11,13,14,.45)",
              }}
            >
              Start 30-day free trial
              <ArrowRight size={14} />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center gap-2 transition-colors"
              style={{
                height: 46,
                padding: "0 18px",
                borderRadius: 999,
                background: "rgba(255,255,255,.7)",
                border: `1px solid ${C.line}`,
                color: C.ink,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              See the platform
            </Link>
          </div>

          <div
            className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2"
            style={{ fontSize: 12.5, color: C.mute }}
          >
            {["No card required", "Set up in 6 minutes", "Cancel anytime"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CircleCheck size={13} style={{ color: C.pri }} />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Dashboard preview card */}
        <div
          className="lp-fade-up relative mx-auto mt-16 max-w-[1100px]"
          style={{ animationDelay: ".15s" }}
        >
          <div
            className="lp-gradient-border overflow-hidden"
            style={{
              borderRadius: 22,
              boxShadow: "0 40px 80px -30px rgba(11,13,14,.3)",
            }}
          >
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Dashboard preview — pure JSX/CSS recreation of the in-app shell so the
 * landing page shows what the product actually looks like.
 */
function DashboardPreview() {
  const navs = [
    { i: "▦", t: "Dashboard", on: true },
    { i: "◉", t: "Establishments" },
    { i: "✉", t: "Requests" },
    { i: "★", t: "Reviews" },
    { i: "❒", t: "Inbox" },
    { i: "♺", t: "Social" },
    { i: "✦", t: "AI Training" },
    { i: "☏", t: "Phone AI" },
  ];
  const kpis = [
    { l: "Composite rating", v: "4.78", em: "/5", d: "+0.18 this week", up: true },
    { l: "Reviews · 7d", v: "32", d: "+22%", up: true },
    { l: "Requests sent", v: "248", d: "62% open" },
    { l: "Replies", v: "184", d: "12 pending", pri: true },
  ];
  return (
    <div className="grid grid-cols-[200px_1fr]" style={{ background: C.surface }}>
      <aside style={{ background: "#0b0d0e", color: "#fff", padding: "16px 12px" }}>
        <div className="mb-5 flex items-center gap-2 px-2">
          <Image
            src="/repulabs-logo.png"
            alt=""
            width={26}
            height={26}
            style={{
              borderRadius: 7,
              objectFit: "contain",
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            repu<span style={{ color: "#5EEAD4" }}>labs</span>
          </span>
        </div>
        <div
          className="px-2 pb-2 text-[10px]"
          style={{ color: "#8e96a4", letterSpacing: ".1em", fontFamily: "var(--f-mono)" }}
        >
          WORKSPACE
        </div>
        {navs.map((n) => (
          <div
            key={n.t}
            className="mb-0.5 flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]"
            style={{
              background: n.on ? "rgba(37,99,235,.2)" : "transparent",
              color: n.on ? "#5EEAD4" : "#b8bfcb",
              fontWeight: n.on ? 500 : 400,
            }}
          >
            <span style={{ width: 14, fontSize: 12, opacity: 0.9 }}>{n.i}</span>
            {n.t}
          </div>
        ))}
      </aside>

      <div style={{ padding: "16px 20px" }}>
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <div
              className="mb-1 text-[10.5px]"
              style={{ color: C.mute, fontFamily: "var(--f-mono)", letterSpacing: ".08em" }}
            >
              FRI · 8:42 AM
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.015em" }}>
              Good morning, Mahad
            </div>
          </div>
          <div className="hidden gap-1.5 sm:flex">
            {["24h", "7d", "30d", "12mo"].map((t) => (
              <span
                key={t}
                className="rounded-md px-2 py-1 text-[11px]"
                style={{
                  background: t === "7d" ? C.pri50 : "transparent",
                  color: t === "7d" ? C.pri : C.mute,
                  border: `1px solid ${t === "7d" ? C.pri100 : C.line}`,
                  fontWeight: 500,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
                style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}
              >
                {k.v}
                {k.em && (
                  <em
                    style={{
                      fontSize: 11,
                      color: C.mute,
                      fontStyle: "normal",
                      fontWeight: 500,
                    }}
                  >
                    {k.em}
                  </em>
                )}
                {k.pri && (
                  <span
                    className="ml-auto"
                    style={{ width: 6, height: 6, borderRadius: 999, background: C.pri }}
                  />
                )}
              </div>
              <div
                className="mt-0.5 text-[11px]"
                style={{ color: k.up ? C.ok : C.mute, fontWeight: 500 }}
              >
                {k.d}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-[1.4fr_1fr] gap-3">
          <div
            className="rounded-xl border p-3"
            style={{
              borderColor: C.line,
              background: "linear-gradient(140deg, #2563EB 0%, #0F766E 100%)",
              color: "#fff",
              minHeight: 130,
            }}
          >
            <div className="mb-2 flex items-center gap-1.5 text-[10.5px] opacity-80">
              <Sparkles size={10} /> AI INSIGHTS
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
              Your replies to 1-star reviews are 2.4× more likely to flip a customer in 30 days.
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] opacity-80">
              <Star size={10} fill="#fff" /> 3 new pending · auto-drafted by Haiku
            </div>
          </div>
          <div
            className="rounded-xl border p-3"
            style={{ borderColor: C.line, background: C.surface }}
          >
            <div className="mb-2 text-[11px]" style={{ color: C.mute, fontWeight: 500 }}>
              Today's queue
            </div>
            <QRow tone="bad" t="3 reviews need reply" s="2 are 2★ or below" />
            <QRow tone="info" t="Recent voicemails" s="4 in last 24h" />
            <QRow tone="pri" t="AI drafted 3 replies" s="Awaiting approval" />
          </div>
        </div>
      </div>
    </div>
  );
}

function QRow({ tone, t, s }: { tone: "bad" | "info" | "pri"; t: string; s: string }) {
  const bg = tone === "bad" ? "var(--bad-soft)" : tone === "pri" ? C.pri50 : "var(--info-soft)";
  const fg = tone === "bad" ? C.bad : tone === "pri" ? C.pri : C.info;
  return (
    <div className="mb-1 flex items-center gap-2 py-1">
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          background: bg,
          color: fg,
          display: "grid",
          placeItems: "center",
          fontSize: 10,
        }}
      >
        ★
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 500 }}>{t}</div>
        <div style={{ fontSize: 10.5, color: C.mute }}>{s}</div>
      </div>
    </div>
  );
}

/* ============================================================
   3. Logo marquee.
============================================================ */
function LogoMarquee() {
  const logos = [
    "FindLeak",
    "Nomil",
    "Greenboard",
    "Northwind",
    "Stellaris",
    "Helios Co.",
    "Bricklane",
    "Sunrise",
    "Brightway",
    "Quill & Co.",
    "Atlas POS",
    "Pinecroft",
  ];
  const row = [...logos, ...logos];
  return (
    <section
      className="lp-marquee--pause border-y"
      style={{
        borderColor: C.line,
        background: C.surface2,
        padding: "28px 0",
        position: "relative",
      }}
      aria-label="Trusted by local businesses"
    >
      <div className="mx-auto max-w-[1280px] px-6">
        <div
          className="mb-5 text-center text-[11px]"
          style={{ color: C.mute, fontFamily: "var(--f-mono)", letterSpacing: ".12em" }}
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
              style={{ color: C.mute, letterSpacing: "-0.015em" }}
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
   4. How it works.
============================================================ */
function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24">
      <SectionLabel>HOW IT WORKS</SectionLabel>
      <SectionHeading>
        Live in <span className="lp-text-gradient">under 10 minutes.</span>
      </SectionHeading>
      <SectionDescription>
        No engineer, no consultant. The wizard walks you through connecting your first integration,
        uploading your brand voice, and turning on automation.
      </SectionDescription>

      <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StepCard
          n={1}
          title="Connect your business"
          desc="One-click OAuth to Google Business, Facebook and your POS. We pull historical data so the AI has context from day one."
        >
          <ConnectStepArt />
        </StepCard>
        <StepCard
          n={2}
          title="Train the AI on your voice"
          desc="Upload your service catalog, brand guide and refund policy. The AI builds a voice model that matches your tone slider."
        >
          <TrainStepArt />
        </StepCard>
        <StepCard
          n={3}
          title="Turn on automations"
          desc="Drag-and-drop rules. After a Square sale, wait 2 hours, send a warm post-visit SMS. Easy to author, easy to pause."
        >
          <AutomationStepArt />
        </StepCard>
      </div>
    </section>
  );
}

function StepCard({
  n,
  title,
  desc,
  children,
}: {
  n: number;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="lp-bento p-6">
      <div
        className="mb-5 flex h-32 items-center justify-center overflow-hidden rounded-xl border"
        style={{ borderColor: C.line, background: C.surface2 }}
      >
        {children}
      </div>
      <div className="flex items-center gap-3">
        <span
          className="grid place-items-center text-[12px] font-semibold"
          style={{
            width: 26,
            height: 26,
            borderRadius: 999,
            background: C.pri50,
            color: C.pri,
            border: `1px solid ${C.pri100}`,
          }}
        >
          {n}
        </span>
        <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</h3>
      </div>
      <p className="mt-2" style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.55 }}>
        {desc}
      </p>
    </div>
  );
}

function ConnectStepArt() {
  const icons = ["G", "f", "□", "$", "☏"];
  return (
    <div className="flex items-center gap-2">
      {icons.map((s, i) => (
        <div
          key={i}
          className="grid h-10 w-10 place-items-center rounded-lg border text-[14px] font-semibold"
          style={{
            borderColor: C.line,
            background: i === 0 ? C.pri50 : C.surface,
            color: i === 0 ? C.pri : C.ink2,
            transform: `translateY(${i % 2 ? "-4px" : "4px"})`,
          }}
        >
          {s}
        </div>
      ))}
    </div>
  );
}

function TrainStepArt() {
  const files = ["Service catalog.pdf", "Brand voice.docx", "Refund policy.pdf"];
  return (
    <div className="w-full px-4">
      {files.map((f, i) => (
        <div
          key={f}
          className="mb-1 flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]"
          style={{ borderColor: C.line, background: C.surface, opacity: 1 - i * 0.18 }}
        >
          <span
            className="grid h-5 w-5 place-items-center rounded text-[8.5px] font-bold"
            style={{ background: C.pri50, color: C.pri }}
          >
            PDF
          </span>
          <span style={{ flex: 1, color: C.ink2 }}>{f}</span>
          <Check size={11} style={{ color: C.ok }} />
        </div>
      ))}
      <div className="mt-2 flex items-center gap-2 text-[10.5px]" style={{ color: C.mute }}>
        <span className="h-1 flex-1 rounded-full" style={{ background: C.surface3 }}>
          <span className="block h-full rounded-full" style={{ width: "78%", background: C.pri }} />
        </span>
        <span style={{ fontFamily: "var(--f-mono)" }}>78%</span>
      </div>
    </div>
  );
}

function AutomationStepArt() {
  const rows: Array<{ icon: React.ReactNode; t: string }> = [
    { icon: <Zap size={11} />, t: "Invoice paid" },
    { icon: <ChevronDown size={11} />, t: "Wait 2 hours" },
    { icon: <Send size={11} />, t: "Send warm SMS" },
  ];
  return (
    <div className="px-4">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span
            className="grid h-7 w-7 place-items-center rounded-md border"
            style={{ borderColor: C.line, background: C.surface, color: C.pri }}
          >
            {r.icon}
          </span>
          <span style={{ fontSize: 11.5, color: C.ink2 }}>{r.t}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   4.5. Product tour — real app scenes (mid-fidelity), tab-switchable.
============================================================ */
function ProductTour() {
  const tabs: Array<{ id: string; label: string; render: () => React.ReactNode }> = [
    { id: "dashboard", label: "Dashboard", render: () => <DashboardScene /> },
    { id: "reviews", label: "Reviews inbox", render: () => <ReviewsInboxScene /> },
    { id: "qr", label: "QR stands", render: () => <QrScene /> },
    { id: "outreach", label: "Outreach", render: () => <OutreachScene /> },
    { id: "phone", label: "AI phone", render: () => <PhoneScene /> },
    { id: "analytics", label: "Analytics", render: () => <AnalyticsScene /> },
  ];

  // Static-render strategy: stack all scenes vertically on small screens; on
  // wide screens, show a sticky-side tab strip + a single tall preview. We
  // ship them all and use CSS :target to switch — no client JS.
  return (
    <section className="mx-auto max-w-[1280px] px-6 py-24">
      <SectionLabel>PRODUCT TOUR</SectionLabel>
      <SectionHeading>
        This is the <span className="lp-text-gradient">actual app.</span>
      </SectionHeading>
      <SectionDescription>
        Every screen below is rendered straight from the React components your team will see after
        sign-in — same design tokens, same components, same layouts. Sign in to use them with your
        data.
      </SectionDescription>

      <div className="mt-14 grid gap-10 lg:grid-cols-[200px_1fr]">
        {/* Vertical tab strip */}
        <ul
          className="hidden lg:flex flex-col gap-1"
          style={{ position: "sticky", top: 100, alignSelf: "flex-start" }}
        >
          {tabs.map((t, i) => (
            <li key={t.id}>
              <a
                href={`#tour-${t.id}`}
                style={{
                  display: "block",
                  padding: "10px 14px",
                  fontSize: 13.5,
                  fontWeight: 500,
                  borderRadius: 9,
                  color: i === 0 ? C.ink : C.mute,
                  background: i === 0 ? C.surface : "transparent",
                  border: `1px solid ${i === 0 ? C.line : "transparent"}`,
                  textDecoration: "none",
                }}
              >
                {t.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Stacked previews */}
        <div className="flex flex-col gap-10">
          {tabs.map((t) => (
            <div key={t.id} id={`tour-${t.id}`}>
              <div
                className="mb-3 flex items-center justify-between"
                style={{ scrollMarginTop: 100 }}
              >
                <div
                  className="text-[10.5px] font-semibold"
                  style={{
                    color: C.mute,
                    fontFamily: "var(--f-mono)",
                    letterSpacing: "0.1em",
                  }}
                >
                  {t.label.toUpperCase()}
                </div>
              </div>
              <SceneFrame
                title={`repulabs.com / ${t.id === "dashboard" ? "dashboard" : t.id}`}
                height={t.id === "phone" || t.id === "outreach" ? 460 : 520}
              >
                {t.render()}
              </SceneFrame>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   5. Bento features — six surfaces.
============================================================ */
function BentoFeatures() {
  return (
    <section id="features" className="mx-auto max-w-[1280px] px-6 py-24">
      <SectionLabel>THE PLATFORM</SectionLabel>
      <SectionHeading>
        Six surfaces. <span className="lp-text-gradient">One workspace.</span>
      </SectionHeading>
      <SectionDescription>
        Stop duct-taping six tools together. repulabs gives you the entire reputation stack in one
        place, with the same brand voice running through every reply.
      </SectionDescription>

      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
        <FeatureCard
          span="md:col-span-4 md:row-span-2"
          icon={<Sparkles size={14} />}
          eyebrow="AI · VOICE-MATCHED"
          title="AI replies in your voice"
          desc="Trained on your brand guide, service catalog and refund policy. The AI drafts; you approve. Every reply sounds like your best manager wrote it."
          tall
        >
          <ReplyDemo />
        </FeatureCard>

        <FeatureCard
          span="md:col-span-2"
          icon={<Send size={14} />}
          eyebrow="AUTOMATION"
          title="Requests on autopilot"
          desc="Trigger from POS, CRM or a calendar. Wait, then send a warm SMS or email."
        >
          <AutomationStepArt />
        </FeatureCard>

        <FeatureCard
          span="md:col-span-2"
          icon={<Inbox size={14} />}
          eyebrow="UNIFIED INBOX"
          title="One inbox · every channel"
          desc="Comments, DMs and live chat from every connected page in one keyboard-first view."
        >
          <InboxDemo />
        </FeatureCard>

        <FeatureCard
          span="md:col-span-2"
          icon={<QrCode size={14} />}
          eyebrow="HARDWARE"
          title="QR review stands"
          desc="Counter cards and brass plaques that turn one scan into a 5-star review."
        >
          <QrDemo />
        </FeatureCard>

        <FeatureCard
          span="md:col-span-2"
          icon={<Phone size={14} />}
          eyebrow="AI PHONE 2.0"
          title="AI phone receptionist"
          desc="Answers every call in your cloned voice. Books appointments via Cal.com."
        >
          <PhoneDemo />
        </FeatureCard>

        <FeatureCard
          span="md:col-span-2"
          icon={<Flag size={14} />}
          eyebrow="DISPUTE DEFENSE"
          title="Fight fake reviews"
          desc="We file Google disputes for fake or abusive reviews. 71% removal rate."
        >
          <DisputeDemo />
        </FeatureCard>
      </div>
    </section>
  );
}

function FeatureCard({
  span,
  icon,
  eyebrow,
  title,
  desc,
  children,
  tall,
}: {
  span?: string;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <article className={`lp-bento p-6 ${span ?? ""}`} style={{ minHeight: tall ? 380 : 220 }}>
      <div
        className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px]"
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
      <h3 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}>{title}</h3>
      <p className="mt-1.5" style={{ fontSize: 13, color: C.mute, lineHeight: 1.55 }}>
        {desc}
      </p>
      {children && <div className="mt-5">{children}</div>}
    </article>
  );
}

function ReplyDemo() {
  return (
    <div
      className="space-y-3 rounded-xl border p-4"
      style={{ borderColor: C.line, background: C.surface2 }}
    >
      <div className="flex items-center gap-2">
        <div
          className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: "#a855f7" }}
        >
          JG
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>Judith G.</div>
          <div className="flex items-center gap-1" style={{ color: C.warn }}>
            {[1, 2].map((s) => (
              <Star key={s} size={10} fill="currentColor" />
            ))}
            <span style={{ color: C.mute2, fontSize: 10 }}>· 2h ago · Google</span>
          </div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.ink2, lineHeight: 1.55 }}>
        &quot;Tried the new SPF formula — way more expensive and felt thicker than the old one. Not
        impressed for the price.&quot;
      </p>
      <div
        className="rounded-lg border p-3"
        style={{
          borderColor: C.pri100,
          background: C.surface,
          borderLeft: `3px solid ${C.pri}`,
        }}
      >
        <div
          className="mb-2 inline-flex items-center gap-1 text-[10px] font-semibold"
          style={{ color: C.pri, fontFamily: "var(--f-mono)", letterSpacing: ".08em" }}
        >
          <Sparkles size={9} /> AI DRAFT
        </div>
        <p style={{ fontSize: 12.5, color: C.ink2, lineHeight: 1.6 }}>
          Judith — really appreciate the candid feedback, and sorry the new formula didn&apos;t land
          for you. We tightened the texture for better water resistance, but it&apos;s not for
          everyone. DM&apos;d you a refund link and a sample of the lighter SKU.
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-[10.5px] font-medium text-white"
            style={{ background: C.pri }}
          >
            Approve &amp; publish
          </button>
          <button
            type="button"
            className="rounded-full px-2.5 py-1 text-[10.5px] font-medium"
            style={{ background: C.surface3, color: C.ink2 }}
          >
            Tweak
          </button>
        </div>
      </div>
    </div>
  );
}

function InboxDemo() {
  const rows = [
    { i: "JG", c: "#a855f7", n: "Judith", t: "Is this Australian made?", b: "FB" },
    { i: "BR", c: "#0ea5e9", n: "Brett", t: "Why so expensive?", b: "IG" },
    { i: "TR", c: "#f59e0b", n: "Theresa", t: "Great service!", b: "GG" },
  ];
  return (
    <div className="rounded-xl border p-2" style={{ borderColor: C.line, background: C.surface2 }}>
      {rows.map((r) => (
        <div key={r.n} className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <div
            className="grid h-6 w-6 place-items-center rounded-full text-[9.5px] font-semibold text-white"
            style={{ background: r.c }}
          >
            {r.i}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="truncate" style={{ fontSize: 11, fontWeight: 600 }}>
              {r.n}
            </div>
            <div className="truncate" style={{ fontSize: 10.5, color: C.mute }}>
              {r.t}
            </div>
          </div>
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: C.surface3, color: C.mute }}
          >
            {r.b}
          </span>
        </div>
      ))}
    </div>
  );
}

function QrDemo() {
  const lit = new Set([0, 1, 5, 6, 7, 12, 14, 18, 22, 27, 31, 35, 36, 40, 42, 44, 48]);
  return (
    <div className="flex items-center justify-center">
      <div
        className="grid place-items-center rounded-lg border p-3"
        style={{ borderColor: C.line, background: C.surface }}
      >
        <div className="grid grid-cols-7 gap-0.5" style={{ width: 84 }} aria-hidden>
          {Array.from({ length: 49 }).map((_, i) => (
            <span
              key={i}
              style={{
                background: lit.has(i) ? C.ink : "transparent",
                width: 10,
                height: 10,
                borderRadius: 1.5,
              }}
            />
          ))}
        </div>
        <div
          className="mt-1.5 text-[8.5px]"
          style={{ fontFamily: "var(--f-mono)", color: C.mute, letterSpacing: ".1em" }}
        >
          /r/AB12XY3Z
        </div>
      </div>
    </div>
  );
}

function PhoneDemo() {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.line, background: C.surface2 }}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-white"
          style={{ background: C.pri }}
        >
          <Phone size={14} />
        </span>
        <div style={{ fontSize: 12, fontWeight: 600 }}>+1 415 555 0188</div>
        <span
          className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
          style={{ background: "var(--ok-soft)", color: C.ok }}
        >
          <span className="h-1 w-1 rounded-full" style={{ background: C.ok }} />
          LIVE
        </span>
      </div>
      <div className="space-y-1">
        <div className="rounded-md px-2 py-1 text-[11px]" style={{ background: C.surface }}>
          &ldquo;Hi, do you have any 2pm openings?&rdquo;
        </div>
        <div
          className="ml-4 rounded-md px-2 py-1 text-[11px] text-white"
          style={{ background: C.ink }}
        >
          &ldquo;Yes — 2pm or 2:30pm. Want me to book?&rdquo;
        </div>
      </div>
    </div>
  );
}

function DisputeDemo() {
  const days = [
    { d: "Day 1", t: "Submitted", c: C.info },
    { d: "Day 3", t: "Sent to Google", c: C.warn },
    { d: "Day 12", t: "Removed", c: C.ok },
  ];
  return (
    <div className="space-y-1.5">
      {days.map((s) => (
        <div key={s.d} className="flex items-center gap-2 text-[11.5px]">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: s.c, boxShadow: `0 0 0 3px ${s.c}33` }}
          />
          <span style={{ color: C.mute, width: 46 }}>{s.d}</span>
          <span style={{ color: C.ink2, fontWeight: 500 }}>{s.t}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   6. Comparison.
============================================================ */
function Comparison() {
  const rows: Array<[string, string | boolean, string | boolean]> = [
    ["Review requests / mo", "Unlimited", "Spreadsheet copy-paste"],
    ["AI replies in your brand voice", true, "Generic templates"],
    ["Cross-channel inbox", true, "Switch between apps"],
    ["AI phone receptionist", true, "Hire a part-timer"],
    ["Dispute filing", true, "Self-serve only"],
    ["Surveys with smart routing", "Unlimited", "Google Forms"],
    ["QR review stands", true, "Make in Canva"],
    ["Integrations", "20+", "API hacking"],
    ["Setup time", "6 minutes", "Forever"],
  ];
  return (
    <section className="mx-auto max-w-[1100px] px-6 py-24">
      <SectionLabel>WHY REPULABS</SectionLabel>
      <SectionHeading>
        Stop renting six tools. <span className="lp-text-gradient">Own one platform.</span>
      </SectionHeading>

      <div
        className="mt-12 overflow-hidden rounded-2xl border"
        style={{ borderColor: C.line, background: C.surface }}
      >
        <div
          className="grid grid-cols-[1.6fr_1fr_1fr] border-b px-6 py-4"
          style={{
            borderColor: C.line,
            background: C.surface2,
            fontFamily: "var(--f-mono)",
            fontSize: 11,
            letterSpacing: ".08em",
            color: C.mute,
          }}
        >
          <div />
          <div className="flex items-center gap-2">
            <span
              className="grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white"
              style={{
                background: "linear-gradient(140deg, #2563EB 0%, #6366F1 100%)",
              }}
            >
              r
            </span>
            <span style={{ color: C.ink2, fontWeight: 600, fontFamily: "var(--f-ui)" }}>
              repulabs
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[8.5px]"
              style={{ background: C.pri50, color: C.pri }}
            >
              BEST FOR SMBs
            </span>
          </div>
          <div style={{ color: C.mute2 }}>Generic CRM</div>
        </div>
        {rows.map(([label, mine, theirs], i) => (
          <div
            key={String(label)}
            className="grid grid-cols-[1.6fr_1fr_1fr] items-center px-6 py-3.5"
            style={{
              borderTop: i ? `1px solid ${C.line}` : undefined,
              fontSize: 13.5,
            }}
          >
            <div style={{ color: C.ink2, fontWeight: 500 }}>{label}</div>
            <ComparisonCell value={mine} positive />
            <ComparisonCell value={theirs} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ComparisonCell({ value, positive }: { value: string | boolean; positive?: boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1.5" style={{ color: C.pri, fontWeight: 500 }}>
        <span
          className="grid h-4 w-4 place-items-center rounded-full"
          style={{ background: C.pri50 }}
        >
          <Check size={11} />
        </span>
        Included
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1.5" style={{ color: C.mute2 }}>
        <X size={13} />—
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 13,
        color: positive ? C.ink2 : C.mute,
        fontWeight: positive ? 500 : 400,
      }}
    >
      {value}
    </span>
  );
}

/* ============================================================
   7. Stats band.
============================================================ */
function StatsBand() {
  const stats = [
    { v: "4.6×", l: "More reviews vs control", s: "Average across 200 SMB pilots" },
    { v: "71%", l: "Dispute removal rate", s: "Within 14 days, Google + Facebook" },
    { v: "1.6s", l: "Avg AI reply time", s: "Approval-to-publish median" },
    { v: "$48k", l: "Annual revenue lift", s: "Median per location, 12 months" },
  ];
  return (
    <section
      className="relative overflow-hidden border-y"
      style={{
        borderColor: C.line,
        background: "linear-gradient(180deg, #0b0d0e 0%, #111418 100%)",
        color: "#fff",
      }}
    >
      <div className="lp-grid absolute inset-0 opacity-30" aria-hidden />
      <div className="relative mx-auto grid max-w-[1280px] grid-cols-2 gap-px px-0 md:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.l}
            className="lp-stat px-8 py-12"
            style={{
              background: "rgba(255,255,255,.02)",
              borderLeft: i > 0 ? "1px solid rgba(255,255,255,.06)" : undefined,
            }}
          >
            <div
              className="lp-stat__ring inline-flex items-center justify-center rounded-2xl px-3 py-1.5"
              style={{
                background: "linear-gradient(140deg, rgba(37,99,235,.18), rgba(37,99,235,.02))",
                border: "1px solid rgba(37,99,235,.32)",
                fontSize: 44,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                transition: "box-shadow .25s ease",
              }}
            >
              <span className="lp-text-gradient">{s.v}</span>
            </div>
            <div className="mt-4" style={{ fontSize: 15, fontWeight: 500 }}>
              {s.l}
            </div>
            <div className="mt-1" style={{ fontSize: 12, color: "#94a3b8" }}>
              {s.s}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   8. Integrations.
============================================================ */
function Integrations() {
  return (
    <section id="integrations" className="mx-auto max-w-[1280px] px-6 py-24">
      <SectionLabel>INTEGRATIONS</SectionLabel>
      <SectionHeading>
        Lives where your <span className="lp-text-gradient">business already lives.</span>
      </SectionHeading>
      <SectionDescription>
        Native two-click connections to the platforms your reputation actually depends on — review
        hosts, social, payments, CRMs, and automation pipes.
      </SectionDescription>

      <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {BRAND_LOGOS.map(({ name, Icon, color }) => (
          <div
            key={name}
            className="lp-bento group flex flex-col items-center justify-center gap-3 py-6 transition-transform hover:-translate-y-0.5"
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
        — Zapier-bridged for anything we don&rsquo;t natively support yet.
      </p>
    </section>
  );
}

/* ============================================================
   9. Pricing.
============================================================ */
function Pricing() {
  const STANDARD = [
    "QR review cards & plaques",
    "Up to 50 review requests / mo",
    "Live Google feed",
    "Basic spam filter",
  ];
  const PRO = [
    "Everything in Standard",
    "Unlimited review requests",
    "AI-drafted replies in your voice",
    "Cross-channel social scheduler",
    "Surveys with AI polish",
    "Premium dispute service",
    "AI phone receptionist · 200 min",
    "Priority support",
  ];
  const SCALE = [
    "Everything in Pro",
    "SSO + SAML + audit logs",
    "Multi-brand workspaces",
    "Volume API access",
    "Dedicated CSM",
    "Custom voice clone",
  ];
  return (
    <section id="pricing" className="mx-auto max-w-[1280px] px-6 py-24">
      <SectionLabel>PRICING</SectionLabel>
      <SectionHeading>
        Honest pricing. <span className="lp-text-gradient">No per-seat surprises.</span>
      </SectionHeading>

      <div className="mt-8 flex justify-center">
        <div
          className="inline-flex items-center rounded-full border p-1"
          style={{ borderColor: C.line, background: C.surface }}
        >
          <span
            className="rounded-full px-3.5 py-1.5 text-[12.5px] font-medium"
            style={{ color: C.mute }}
          >
            Monthly
          </span>
          <span
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium text-white"
            style={{ background: C.ink }}
          >
            Annual{" "}
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: C.pri, color: "#fff" }}
            >
              −20%
            </span>
          </span>
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
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
        padding: 24,
        position: "relative",
      }}
    >
      {badge && (
        <span
          className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider text-white"
          style={{
            background: "linear-gradient(140deg, #2563EB 0%, #6366F1 100%)",
            fontFamily: "var(--f-mono)",
          }}
        >
          {badge}
        </span>
      )}
      <div
        className="text-[11px]"
        style={{
          color: accent ? C.pri : C.mute,
          fontFamily: "var(--f-mono)",
          letterSpacing: ".1em",
        }}
      >
        {name.toUpperCase()}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.025em" }}>{price}</span>
        {priceSuffix && (
          <span style={{ fontSize: 15, color: C.mute, fontWeight: 500 }}>{priceSuffix}</span>
        )}
      </div>
      <div className="mt-1" style={{ fontSize: 12.5, color: C.mute }}>
        {period}
      </div>
      <Link
        href={ctaHref ?? "/login"}
        className="mt-5 inline-flex w-full items-center justify-center gap-1.5 transition-all active:translate-y-px"
        style={{
          height: 42,
          borderRadius: 10,
          background: accent ? C.ink : C.surface2,
          color: accent ? "#fff" : C.ink,
          border: accent ? "none" : `1px solid ${C.line}`,
          fontSize: 13.5,
          fontWeight: 500,
          boxShadow: accent ? "0 8px 24px -8px rgba(11,13,14,.4)" : undefined,
        }}
      >
        {cta}
        {accent && <ArrowRight size={13} />}
      </Link>
      <div className="my-5 h-px" style={{ background: C.line }} />
      <ul className="space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2" style={{ fontSize: 13, color: C.ink2 }}>
            <Check size={13} style={{ color: C.pri, flexShrink: 0, marginTop: 3 }} />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   10. Testimonials.
============================================================ */
function Testimonials() {
  const items = [
    {
      n: "Mahad Ali",
      r: "Founder · FindLeak",
      a: "MA",
      c: "#a855f7",
      q: "We went from 8 reviews a month to 47, and our rating ticked up to 4.8. The AI sounds like me on a good day.",
    },
    {
      n: "Priya Reddy",
      r: "Director · Greenboard Clinic",
      a: "PR",
      c: "#0ea5e9",
      q: "Receptionist used to spend 90 minutes a day on review follow-ups. Now it's automated and she's free for actual patients.",
    },
    {
      n: "Daniel Okafor",
      r: "Owner · Northwind Restaurant",
      a: "DO",
      c: "#f59e0b",
      q: "The dispute service alone is worth it. Got two fake 1-star reviews removed in under two weeks.",
    },
  ];
  return (
    <section id="testimonials" className="mx-auto max-w-[1280px] px-6 py-24">
      <SectionLabel>LOVED BY OPERATORS</SectionLabel>
      <SectionHeading>
        From hi-vis tradies <span className="lp-text-gradient">to D2C founders.</span>
      </SectionHeading>
      <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
        {items.map((t) => (
          <article key={t.n} className="lp-bento p-6">
            <div className="mb-4 flex items-center gap-0.5" style={{ color: C.warn }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} size={14} fill="currentColor" />
              ))}
            </div>
            <p style={{ fontSize: 14.5, color: C.ink2, lineHeight: 1.6 }}>&ldquo;{t.q}&rdquo;</p>
            <div className="mt-5 flex items-center gap-3">
              <span
                className="grid h-9 w-9 place-items-center rounded-full text-[11.5px] font-semibold text-white"
                style={{ background: t.c }}
              >
                {t.a}
              </span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{t.n}</div>
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
   11. Security.
============================================================ */
function Security() {
  const items = [
    {
      t: "AES-256 at rest, TLS 1.3 in transit",
      d: "Every byte of customer data, encrypted by default — including the OAuth tokens we hold for your integrations.",
    },
    {
      t: "SOC 2 Type II",
      d: "Independently audited security controls. DPA available on request, including GDPR + CCPA addenda.",
    },
    {
      t: "No model training on your data",
      d: "Your customer data never leaves your tenant. We use Anthropic's no-training data agreement for every API call.",
    },
  ];
  const badges = ["SOC 2", "GDPR", "HIPAA·add-on", "ISO 27001", "PCI DSS", "APP·Australian"];
  return (
    <section className="border-y" style={{ borderColor: C.line, background: C.surface2 }}>
      <div className="mx-auto max-w-[1280px] px-6 py-24">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <SectionLabel align="left">SECURITY &amp; COMPLIANCE</SectionLabel>
            <h2
              className="mt-3"
              style={{
                fontSize: "clamp(32px, 4vw, 44px)",
                fontWeight: 600,
                letterSpacing: "-0.025em",
                lineHeight: 1.1,
              }}
            >
              Enterprise-grade security{" "}
              <span className="lp-text-gradient">for small business prices.</span>
            </h2>
            <div className="mt-8 space-y-6">
              {items.map((it) => (
                <div key={it.t} className="flex items-start gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-lg"
                    style={{
                      background: C.pri50,
                      color: C.pri,
                      border: `1px solid ${C.pri100}`,
                    }}
                  >
                    <ShieldCheck size={16} />
                  </span>
                  <div>
                    <div style={{ fontSize: 14.5, fontWeight: 600 }}>{it.t}</div>
                    <p className="mt-1" style={{ fontSize: 13, color: C.mute, lineHeight: 1.55 }}>
                      {it.d}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-2xl border p-6"
            style={{ borderColor: C.line, background: C.surface }}
          >
            <div
              className="text-[11px]"
              style={{
                color: C.mute,
                fontFamily: "var(--f-mono)",
                letterSpacing: ".1em",
              }}
            >
              COMPLIANCE BADGES
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {badges.map((b) => (
                <div
                  key={b}
                  className="rounded-lg border px-3 py-3 text-center"
                  style={{ borderColor: C.line, background: C.surface2 }}
                >
                  <div
                    className="text-[10.5px] font-semibold"
                    style={{ color: C.ink2, letterSpacing: "0.04em" }}
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
              className="mt-6 flex items-center gap-2 rounded-lg border p-3 text-[11.5px]"
              style={{
                borderColor: C.line,
                background: C.pri50,
                color: C.pri700,
              }}
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
      </div>
    </section>
  );
}

/* ============================================================
   12. FAQ.
============================================================ */
function Faq() {
  const items = [
    {
      q: "How quickly can I set up repulabs?",
      a: "Most teams are sending automated requests within 6 minutes. Connect Google Business, plug in one POS or CRM, and the wizard does the rest.",
    },
    {
      q: "Does the AI actually sound like me?",
      a: "It learns from your service catalog, brand guide and refund policy. After 50–100 manual approvals it matches your voice closely enough that most operators stop editing drafts entirely.",
    },
    {
      q: "Can I use the AI receptionist with my existing phone number?",
      a: "Yes. We provide a new number you can either advertise directly or forward your existing line to. Calls are recorded, transcribed and synced to your CRM.",
    },
    {
      q: "Is my customer data secure?",
      a: "AES-256 at rest, TLS 1.3 in transit, SOC 2 Type II audited. Your data never trains a shared model. Full DPA available on request.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes — one click from Settings → Subscription. We don't lock you in with annual-only billing, and prorated refunds are handled within one business day.",
    },
  ];
  return (
    <section id="faq" className="mx-auto max-w-[860px] px-6 py-24">
      <SectionLabel>FAQ</SectionLabel>
      <SectionHeading>Common questions.</SectionHeading>

      <div className="mt-12 space-y-2">
        {items.map((it, i) => (
          <details
            key={it.q}
            className="group rounded-xl border"
            style={{ borderColor: C.line, background: C.surface }}
            open={i === 0}
          >
            <summary
              className="flex cursor-pointer list-none items-center gap-4 px-5 py-4"
              style={{ fontSize: 15, fontWeight: 500 }}
            >
              <span style={{ flex: 1 }}>{it.q}</span>
              <ChevronDown
                size={16}
                className="transition-transform group-open:rotate-180"
                style={{ color: C.mute }}
              />
            </summary>
            <div className="px-5 pb-5" style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.6 }}>
              {it.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   13. Final CTA.
============================================================ */
function FinalCta() {
  return (
    <section className="relative mx-auto max-w-[1280px] px-6 py-24">
      <div
        className="relative overflow-hidden rounded-3xl px-8 py-20 text-center"
        style={{
          background: "linear-gradient(140deg, #0b0d0e 0%, #0f766e 100%)",
          color: "#fff",
          boxShadow: "0 30px 80px -20px rgba(11,13,14,.4)",
        }}
      >
        <div className="lp-grid absolute inset-0 opacity-25" aria-hidden />
        <div
          className="lp-spot lp-spot--teal"
          style={{
            width: 600,
            height: 600,
            top: -200,
            left: "50%",
            transform: "translateX(-50%)",
            opacity: 0.7,
          }}
          aria-hidden
        />
        <div className="relative">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
            style={{
              background: "rgba(94,234,212,.12)",
              color: "#5EEAD4",
              fontFamily: "var(--f-mono)",
              letterSpacing: ".08em",
            }}
          >
            <Sparkles size={11} /> GET STARTED
          </span>
          <h2
            className="mx-auto mt-6 max-w-[760px]"
            style={{
              fontSize: "clamp(34px, 5.5vw, 60px)",
              fontWeight: 600,
              letterSpacing: "-0.03em",
              lineHeight: 1.05,
            }}
          >
            The reputation OS
            <br />
            <span style={{ color: "#5EEAD4" }}>your business deserves.</span>
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 transition-all active:translate-y-px"
              style={{
                height: 48,
                padding: "0 24px",
                borderRadius: 999,
                background: "#fff",
                color: C.ink,
                fontSize: 14.5,
                fontWeight: 500,
                boxShadow: "0 12px 28px -8px rgba(0,0,0,.4)",
              }}
            >
              Start 30-day free trial
              <ArrowRight size={14} />
            </Link>
            <Link
              href="mailto:sales@repulabs.com"
              className="inline-flex items-center gap-2"
              style={{
                height: 48,
                padding: "0 20px",
                borderRadius: 999,
                background: "rgba(255,255,255,.06)",
                color: "#fff",
                fontSize: 14.5,
                fontWeight: 500,
                border: "1px solid rgba(255,255,255,.18)",
              }}
            >
              Book a demo
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div
            className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px]"
            style={{ color: "#94a3b8" }}
          >
            {["No card required", "Set up in 6 minutes", "Cancel anytime"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CircleCheck size={13} style={{ color: "#5EEAD4" }} />
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
   14. Footer.
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
      <div className="mx-auto max-w-[1280px] px-6 py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_3fr]">
          <div>
            <Link
              href="/"
              aria-label="Repulabs home"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Logo size={48} />
            </Link>
            <p
              className="mt-5 max-w-[320px]"
              style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}
            >
              The reputation operating system for ambitious small businesses. Built in Melbourne;
              loved everywhere review stars matter.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px]"
                style={{
                  borderColor: C.line,
                  background: C.surface,
                  color: C.mute,
                }}
              >
                <span className="relative grid h-1.5 w-1.5 place-items-center" aria-hidden>
                  <span className="lp-ping" style={{ background: C.ok }} />
                  <span
                    className="relative h-1.5 w-1.5 rounded-full"
                    style={{ background: C.ok }}
                  />
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
          <span>© 2026 Repulabs Pty Ltd. All rights reserved.</span>
          <span style={{ fontFamily: "var(--f-mono)", letterSpacing: ".06em" }}>
            v2.0.4 · MAY 2026
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
        letterSpacing: ".14em",
        fontWeight: 600,
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
        fontSize: "clamp(32px, 4.5vw, 52px)",
        fontWeight: 600,
        letterSpacing: "-0.03em",
        lineHeight: 1.05,
        maxWidth: 820,
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
      style={{
        fontSize: 16,
        color: C.mute,
        lineHeight: 1.55,
        maxWidth: 620,
      }}
    >
      {children}
    </p>
  );
}
