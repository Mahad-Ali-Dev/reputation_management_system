"use client";

/**
 * ZeitraLanding — the repulabs marketing home, rebuilt to mirror the clean,
 * focused section flow of zeitra.app:
 *
 *   Nav → Hero (tab-labelled product frame) → Stats strip → Marquee ticker
 *   → Who it's for (3 cards) → How it works (numbered vertical timeline)
 *   → Features (bento grid + "everyday things" list) → Product tour (tabbed)
 *   → Pricing (monthly / annual) → FAQ (reused) → CTA band → Footer (reused).
 *
 * Brand stays repulabs LIGHT premium (white / pale-blue, #2563eb primary,
 * rounded, soft shadows) so it reads as one system with the other marketing
 * pages (About / Pricing / Contact use the same MarketingShell), while the
 * STRUCTURE follows zeitra. Self-contained, "use client" for the small tab /
 * toggle interactions; heavy animation kit of the old page is dropped on
 * purpose to keep this fast and legible.
 */

import { Logo } from "@/components/shell/logo";
import { LandingFaq } from "@/components/landing/sections/faq";
import { MarketingFooter } from "@/components/landing/marketing-shell";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Building2,
  Check,
  Clock,
  Globe,
  Inbox,
  MapPin,
  Phone,
  QrCode,
  Send,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { type ComponentType, type CSSProperties, useEffect, useState } from "react";

/* ─────────────────────────── palette ─────────────────────────── */

const C = {
  ink: "#0b1220",
  ink2: "#283449",
  mute: "#5b6473",
  mute2: "#8a93a6",
  line: "#e7ecf6",
  line2: "#eef2fa",
  pri: "#2563eb",
  pri2: "#1e40af",
  surface: "#ffffff",
  wash: "#f4f8ff",
} as const;

const MAXW = "mx-auto w-full max-w-[1200px] px-5 sm:px-6";

/* ─────────────────────────── brand marks ─────────────────────────── */

type MarkProps = { size?: number; className?: string };

function GoogleMark({ size = 20, className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.19c-.27 1.44-1.08 2.66-2.3 3.48v2.89h3.72c2.18-2 3.45-4.96 3.45-8.38Z" />
      <path fill="#34A853" d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.75H1.7v2.98A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.55 14.67A7.2 7.2 0 0 1 5.17 12c0-.93.16-1.83.38-2.67V6.35H1.7A12 12 0 0 0 0 12c0 1.94.46 3.77 1.7 5.65l3.85-2.98Z" />
      <path fill="#EA4335" d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.2 15.1 0 12 0 7.5 0 3.59 2.65 1.7 6.35l3.85 2.98C6.46 6.6 9 4.75 12 4.75Z" />
    </svg>
  );
}

function Stars({ count = 5, size = 15, className }: { count?: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[2px] ${className ?? ""}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Star key={`s-${i}`} size={size} strokeWidth={0} className="fill-[#FFB000] text-[#FFB000]" />
      ))}
    </span>
  );
}

/* ─────────────────────────── shared bits ─────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11.5px] font-semibold uppercase"
      style={{
        borderColor: C.line,
        background: "rgba(255,255,255,.7)",
        color: C.pri,
        letterSpacing: ".12em",
        fontFamily: "var(--f-mono)",
      }}
    >
      {children}
    </span>
  );
}

function SectionHead({
  eyebrow,
  title,
  sub,
  center = true,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={`flex max-w-2xl flex-col gap-4 ${center ? "mx-auto items-center text-center" : "items-start text-left"}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        style={{
          fontSize: "clamp(30px, 4.6vw, 46px)",
          lineHeight: 1.06,
          letterSpacing: "-0.03em",
          fontWeight: 700,
          color: C.ink,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p style={{ fontSize: 17, lineHeight: 1.6, color: C.mute, maxWidth: 560 }}>{sub}</p>
      )}
    </div>
  );
}

/* ═══════════════════════════════ NAV ═══════════════════════════════ */

function Nav() {
  const links = [
    { href: "#features", label: "Features" },
    { href: "#how", label: "How it works" },
    { href: "#tour", label: "Tour" },
    { href: "#pricing", label: "Pricing" },
    { href: "#faq", label: "FAQ" },
  ];
  // At the top of the page: the previous full-width, transparent navbar on the
  // page background. Once scrolled: it morphs into a floating dark pill (90%
  // width, rounded, a gap from the top) that stays pinned as the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const headerStyle: CSSProperties & Record<string, string | number> = {
    transition: "all .3s ease",
    "--ink": scrolled ? "#ffffff" : "#15132b",
    color: scrolled ? "rgba(255,255,255,.7)" : C.mute,
    background: scrolled ? "rgba(13,17,26,.72)" : "rgba(236,238,234,0)",
    border: scrolled ? "1px solid rgba(255,255,255,.1)" : "1px solid transparent",
    backdropFilter: scrolled ? "saturate(180%) blur(14px)" : "none",
    WebkitBackdropFilter: scrolled ? "saturate(180%) blur(14px)" : "none",
    boxShadow: scrolled ? "0 18px 44px -18px rgba(5,8,15,.6)" : "none",
  };
  const hoverBg = scrolled ? "hover:bg-white/10" : "hover:bg-black/5";

  return (
    <div
      className={`pointer-events-none sticky top-0 z-50 transition-all duration-300 ${scrolled ? "px-3 pt-3 sm:pt-4" : "px-0 pt-0"}`}
    >
      <header
        className={`pointer-events-auto mx-auto flex h-14 items-center gap-3 px-5 sm:px-6 ${scrolled ? "w-[90%] max-w-[1180px] rounded-full" : "w-full max-w-[1200px] rounded-none"}`}
        style={headerStyle}
      >
        <Link href="/" aria-label="repulabs home" style={{ color: "inherit", textDecoration: "none" }}>
          <Logo size={27} />
        </Link>
        <nav className="mx-auto hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-[13.5px] font-medium transition-colors ${hoverBg}`}
              style={{ color: "inherit" }}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className={`hidden rounded-full px-3 py-1.5 text-[13.5px] font-medium transition-colors sm:inline-flex ${hoverBg}`}
            style={{ color: "inherit" }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition-all active:translate-y-px"
            style={{
              height: 36,
              background: scrolled ? "#ffffff" : "#0b1220",
              color: scrolled ? "#0b1220" : "#ffffff",
              boxShadow: "0 10px 24px -12px rgba(0,0,0,.45)",
            }}
          >
            Start free <ArrowRight size={14} />
          </Link>
        </div>
      </header>
    </div>
  );
}

/* ═══════════════════════════════ HERO ═══════════════════════════════ */

/* Real product screenshots (the live app, dark mode, with data). */
const SCREENS = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "dashboard",
    src: "/assets/repulabs/landing/screens/dashboard.png",
    line: "Your whole reputation at a glance, with Repulabs AI ready to answer anything.",
  },
  {
    id: "autopilot",
    label: "AI Autopilot",
    path: "autopilot",
    src: "/assets/repulabs/landing/screens/autopilot.png",
    line: "One switch runs the whole loop — 5★ replies published, everything else drafted to approve.",
  },
  {
    id: "inbox",
    label: "Review inbox",
    path: "reviews",
    src: "/assets/repulabs/landing/screens/review-inbox.png",
    line: "Every review across every platform in one queue, with AI drafting the reply you approve.",
  },
  {
    id: "devices",
    label: "Device Manager",
    path: "devices",
    src: "/assets/repulabs/landing/screens/device-manager.png",
    line: "QR plaques and cards that send customers straight to a review, with scan and impact tracking.",
  },
  {
    id: "analytics",
    label: "Analytics",
    path: "analytics",
    src: "/assets/repulabs/landing/screens/analytics.png",
    line: "Trends, rating breakdowns and sources — see exactly how your reputation is moving.",
  },
] as const;
type ScreenId = (typeof SCREENS)[number]["id"];

const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s])) as Record<
  ScreenId,
  (typeof SCREENS)[number]
>;

/** A dark browser-window chrome wrapping a real product screenshot. */
function ProductWindow({ id, priority }: { id: ScreenId; priority?: boolean }) {
  const screen = SCREEN_BY_ID[id];
  return (
    <div
      className="overflow-hidden rounded-[16px] border"
      style={{ borderColor: "rgba(255,255,255,.12)", background: "#0b0f1a", boxShadow: "0 30px 80px -34px rgba(0,0,0,.65)" }}
    >
      <div
        className="flex items-center gap-1.5 px-3.5 py-2.5"
        style={{ background: "#11151f", borderBottom: "1px solid rgba(255,255,255,.07)" }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
        <span className="ml-3 truncate text-[11px] font-medium" style={{ color: "rgba(255,255,255,.4)" }}>
          app.repulabs.com/{screen.path}
        </span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={screen.src}
        alt={`Repulabs ${screen.label} — dark mode`}
        className="block w-full"
        loading={priority ? "eager" : "lazy"}
      />
    </div>
  );
}

function Hero() {
  const [tab, setTab] = useState<ScreenId>("dashboard");
  return (
    <section className="relative overflow-x-clip px-2.5 pb-10 pt-2.5 sm:px-4" style={{ background: "#eceeea" }}>
      {/* the rounded-corner hero box — sits inset below the nav, on the page bg */}
      <div
        className="relative mx-auto overflow-hidden rounded-[30px] sm:rounded-[40px]"
        style={{
          maxWidth: 1360,
          background: "linear-gradient(168deg,#3b82f6 0%,#2563eb 46%,#1e3a8a 100%)",
          boxShadow: "0 50px 120px -52px rgba(30,58,138,.72)",
        }}
      >
        {/* soft top glow inside the box */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(900px 440px at 50% -8%, rgba(255,255,255,.34), transparent 60%)" }}
        />

        {/* content */}
        <div className="relative z-20 mx-auto flex max-w-3xl flex-col items-center px-5 pt-14 text-center sm:pt-[72px]">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11.5px] font-semibold uppercase"
            style={{ borderColor: "rgba(255,255,255,.2)", background: "rgba(10,16,30,.4)", color: "#eaf1ff", letterSpacing: ".11em", fontFamily: "var(--f-mono)" }}
          >
            <Sparkles size={13} /> The reputation OS for local teams
          </span>

          <h1
            className="mt-6 max-w-4xl"
            style={{ fontSize: "clamp(40px, 6.6vw, 68px)", lineHeight: 1.05, letterSpacing: "-0.03em", fontWeight: 800, color: "#fff" }}
          >
            Run your reputation like{" "}
            <span
              className="inline-block rounded-[14px] px-3 pb-1 pt-0.5"
              style={{ background: "#fff", color: C.pri, boxShadow: "0 14px 32px -14px rgba(0,0,0,.5)" }}
            >
              a system.
            </span>
          </h1>

          <p className="mt-6 max-w-xl" style={{ fontSize: 17.5, lineHeight: 1.6, color: "rgba(255,255,255,.84)" }}>
            Reviews, AI replies, requests, a unified inbox and an AI phone — one premium workspace
            that keeps every customer moment on brand and on time.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full px-7 text-[15px] font-bold transition-transform hover:-translate-y-0.5 active:translate-y-0"
              style={{ background: "#fff", color: C.ink, boxShadow: "0 16px 34px -14px rgba(0,0,0,.45)" }}
            >
              Start free <ArrowRight size={17} />
            </Link>
            <a
              href="#how"
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full border px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10"
              style={{ borderColor: "rgba(255,255,255,.32)" }}
            >
              See how it works
            </a>
          </div>
          <p className="mt-4 text-[12.5px]" style={{ color: "rgba(255,255,255,.72)" }}>
            14-day free trial · No card required · Cancel anytime
          </p>

          {/* tab chips */}
          <div className="mt-9 flex max-w-xl flex-wrap items-center justify-center gap-1.5">
            {SCREENS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="rounded-full px-4 py-2 text-[13px] font-semibold transition-all"
                  style={on ? { background: "#0b1220", color: "#fff" } : { background: "rgba(255,255,255,.16)", color: "#fff" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* real product screenshot peeking from the bottom edge of the box */}
        <div className="relative z-10 mx-auto mt-10 w-full max-w-[1000px] px-4" style={{ transform: "translateY(46px)" }}>
          <div aria-hidden className="absolute -left-4 bottom-10 z-20 hidden w-[208px] -rotate-[8deg] lg:block">
            <MiniReviewCard />
          </div>
          <div aria-hidden className="absolute -right-4 bottom-10 z-20 hidden w-[196px] rotate-[8deg] lg:block">
            <MiniRatingCard />
          </div>
          <div className="relative z-10">
            <ProductWindow id={tab} priority />
          </div>
        </div>
      </div>

      {/* connects with — on the page background, below the box */}
      <div className="mx-auto mt-12 flex max-w-[1200px] flex-col items-center gap-3.5 px-5">
        <span className="text-[11px] font-bold uppercase" style={{ letterSpacing: ".22em", color: C.mute2 }}>
          Connects with
        </span>
        <div className="flex flex-wrap items-center justify-center gap-7">
          {["google", "meta", "instagram", "whatsapp", "square", "slack"].map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f}
              src={`/assets/repulabs/landing/integrations/${f}.svg`}
              alt={f}
              className="h-[22px] w-auto opacity-55 transition-opacity hover:opacity-100"
              loading="lazy"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function MiniReviewCard() {
  return (
    <div className="rounded-2xl border bg-white p-3.5" style={{ borderColor: C.line2, boxShadow: "0 26px 50px -24px rgba(0,0,0,.5)" }}>
      <div className="flex items-center gap-2">
        <GoogleMark size={20} />
        <span className="text-[12.5px] font-bold" style={{ color: C.ink }}>New 5★ review</span>
      </div>
      <Stars className="mt-2" size={13} />
      <p className="mt-1.5 text-[12px] leading-snug" style={{ color: C.mute }}>“Super friendly team — will be back!”</p>
    </div>
  );
}

function MiniRatingCard() {
  return (
    <div className="rounded-2xl border bg-white p-3.5" style={{ borderColor: C.line2, boxShadow: "0 26px 50px -24px rgba(0,0,0,.5)" }}>
      <p className="text-[12px] font-medium" style={{ color: C.mute2 }}>Average rating</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-[28px] font-bold leading-none" style={{ color: C.ink }}>4.8</p>
        <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e7f8f0] px-1.5 py-0.5 text-[11px] font-semibold text-[#0f9d63]">
          <TrendingUp size={11} /> 18%
        </span>
      </div>
      <Stars className="mt-2" size={13} />
      <p className="mt-1 text-[11px]" style={{ color: C.mute2 }}>324 reviews</p>
    </div>
  );
}

/* Mock in-hero screens retired — the hero now shows real product screenshots
   (ProductWindow + SCREENS). Shared marks (GoogleMark, Stars) stay for the
   floating MiniReviewCard / MiniRatingCard above. */

/* ═══════════════════════════ STATS STRIP ═══════════════════════════ */

function StatsStrip() {
  const stats = [
    { v: "4.8★", k: "average across 12k+ businesses" },
    { v: "6 min", k: "to your first automated request" },
    { v: "24/7", k: "AI phone receptionist" },
    { v: "0", k: "lock-in contracts, ever" },
  ];
  return (
    <section className="border-y" style={{ borderColor: C.line, background: C.wash }}>
      <div className={`${MAXW} grid grid-cols-2 gap-x-6 gap-y-7 py-10 sm:grid-cols-4`}>
        {stats.map((s) => (
          <div key={s.k} className="text-center sm:text-left">
            <p className="text-[28px] font-bold leading-none sm:text-[32px]" style={{ color: C.ink }}>{s.v}</p>
            <p className="mt-2 text-[13px]" style={{ color: C.mute }}>{s.k}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════ MARQUEE ═══════════════════════════ */

function Marquee() {
  const items = [
    "Restaurants", "Dental clinics", "Salons & spas", "Gyms & studios", "Cafés", "Law firms",
    "Auto shops", "Real estate", "Med spas", "Home services", "Veterinary", "Retail",
  ];
  const loop = [...items, ...items];
  return (
    <section className="overflow-hidden border-b py-5" style={{ borderColor: C.line, background: C.surface }} aria-label="Built for local businesses">
      <div className="zl-marquee flex w-max items-center gap-8">
        {loop.map((it, i) => (
          <span key={`${it}-${i}`} className="inline-flex items-center gap-8 text-[15px] font-semibold" style={{ color: C.mute2 }}>
            {it}
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.line2 }} />
          </span>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════ WHO IT'S FOR ═══════════════════════════ */

function WhoItsFor() {
  const cards: { Icon: ComponentType<{ size?: number; style?: React.CSSProperties }>; title: string; body: string }[] = [
    { Icon: Building2, title: "Single location", body: "Turn every happy customer into a public 5-star review, and quietly catch the unhappy ones before they post." },
    { Icon: MapPin, title: "Multi-location brands", body: "One dashboard for every branch — compare ratings, standardise replies and keep each listing on brand." },
    { Icon: Users, title: "Agencies", body: "Run reputation for all your clients under one roof, with white-label reports and per-client workspaces." },
  ];
  return (
    <section className="py-20 sm:py-24" style={{ background: C.surface }}>
      <div className={MAXW}>
        <SectionHead
          eyebrow="Who it's for"
          title="Built for the businesses stars matter to."
          sub="From a single storefront to a portfolio of locations — repulabs scales with you."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="rounded-2xl border p-6 transition-shadow hover:shadow-[0_24px_50px_-28px_rgba(49,92,170,.4)]" style={{ borderColor: C.line, background: "#fbfcff" }}>
              <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "#eef2ff", color: C.pri }}>
                <c.Icon size={20} />
              </span>
              <h3 className="mt-4 text-[18px] font-bold" style={{ color: C.ink, letterSpacing: "-0.01em" }}>{c.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed" style={{ color: C.mute }}>{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ HOW IT WORKS ═══════════════════════════ */

function HowItWorks() {
  const steps = [
    { Icon: Globe, title: "Connect your platforms", body: "Link Google Business, Facebook, Yelp and your POS or CRM in a few clicks. The setup wizard does the rest." },
    { Icon: QrCode, title: "Ask for the review", body: "A QR plaque, SMS or email reaches each customer at the perfect moment, right after a great experience." },
    { Icon: Star, title: "Happy? Straight to Google", body: "Delighted customers are routed to leave a public review on the platform that matters most." },
    { Icon: Shield, title: "Unhappy? Caught privately", body: "A low rating opens a private feedback form and alerts your team — before it ever becomes a public star." },
    { Icon: Sparkles, title: "AI drafts the reply", body: "Every review gets an on-brand response drafted in your voice. Approve, tweak or let autopilot send it." },
    { Icon: Zap, title: "Autopilot keeps it running", body: "Requests, replies and follow-ups run on their own, so your rating climbs while you get on with work." },
  ];
  return (
    <section id="how" className="py-20 sm:py-24" style={{ background: C.wash }}>
      <div className={MAXW}>
        <SectionHead eyebrow="How it works" title="Your reputation, on a loop." sub="Six steps that run on their own once they’re set up." />
        <div className="mx-auto mt-14 max-w-3xl">
          <div className="relative flex flex-col gap-8">
            <span aria-hidden className="absolute bottom-3 left-[23px] top-3 w-px" style={{ background: C.line2 }} />
            {steps.map((s, i) => (
              <div key={s.title} className="relative flex gap-5">
                <span className="relative z-10 grid h-12 w-12 flex-shrink-0 place-items-center rounded-full text-white" style={{ background: `linear-gradient(180deg,#2f6bff,${C.pri2})`, boxShadow: "0 12px 24px -12px rgba(37,99,235,.6)" }}>
                  <s.Icon size={19} />
                </span>
                <div className="pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold" style={{ fontFamily: "var(--f-mono)", color: C.mute2, letterSpacing: ".1em" }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-[18px] font-bold" style={{ color: C.ink, letterSpacing: "-0.01em" }}>{s.title}</h3>
                  </div>
                  <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: C.mute }}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ FEATURES (BENTO) ═══════════════════════════ */

function Bento() {
  const everyday = [
    "QR plaques & cards", "SMS & email requests", "Smart review routing", "Sentiment analysis",
    "Local SEO & listings", "Surveys & NPS", "Team roles & approvals", "White-label reports",
    "Competitor tracking",
  ];
  return (
    <section id="features" className="py-20 sm:py-24" style={{ background: C.surface }}>
      <div className={MAXW}>
        <SectionHead eyebrow="Features" title="Everything your reputation needs, in one place." sub="Reviews, replies, requests, phone and autopilot — one premium workspace." />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {/* wide: AI replies */}
          <BentoCard className="md:col-span-2" Icon={Sparkles} title="AI replies in your brand voice" body="Every review gets an on-brand response drafted from your past replies and website. Approve, edit or auto-send.">
            <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "#dbe6ff", background: "#f3f7ff" }}>
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: C.pri }}><Sparkles size={12} /> Suggested reply</div>
              <p className="text-[12.5px]" style={{ color: C.ink2 }}>Thank you so much, Sarah! We can’t wait to welcome you back. 🙌</p>
            </div>
          </BentoCard>

          {/* tall stat */}
          <BentoCard Icon={Star} title="4.8★ and climbing" body="Teams lift their average rating within the first 60 days.">
            <div className="mt-4 flex items-end gap-1.5">
              {[40, 55, 48, 68, 74, 90].map((h, i) => (
                <span key={i} className="flex-1 rounded-t-md" style={{ height: h, background: i === 5 ? C.pri : "#dbe6ff" }} />
              ))}
            </div>
          </BentoCard>

          <BentoCard Icon={Phone} title="AI phone receptionist" body="Answers every call 24/7, books jobs and texts callers back — in your business’s voice." />
          <BentoCard Icon={Send} title="Review requests" body="QR plaques, SMS and email reach customers at the perfect moment to ask." />
          <BentoCard Icon={Inbox} title="Unified inbox" body="Google, Facebook and Yelp reviews in one feed, triaged and tagged by sentiment." />
        </div>

        {/* everyday list */}
        <div className="mt-6 rounded-2xl border p-6 sm:p-7" style={{ borderColor: C.line, background: "#fbfcff" }}>
          <div className="flex items-center gap-2">
            <BarChart3 size={16} style={{ color: C.pri }} />
            <h3 className="text-[15px] font-bold" style={{ color: C.ink }}>And the everyday things</h3>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {everyday.map((e) => (
              <div key={e} className="flex items-center gap-2 text-[14px]" style={{ color: C.ink2 }}>
                <Check size={15} style={{ color: "#0f9d63" }} /> {e}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BentoCard({
  Icon,
  title,
  body,
  children,
  className,
}: {
  Icon: ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  body: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border p-6 transition-shadow hover:shadow-[0_24px_50px_-28px_rgba(49,92,170,.4)] ${className ?? ""}`} style={{ borderColor: C.line, background: C.surface }}>
      <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "#eef2ff", color: C.pri }}>
        <Icon size={19} />
      </span>
      <h3 className="mt-4 text-[17px] font-bold" style={{ color: C.ink, letterSpacing: "-0.01em" }}>{title}</h3>
      <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: C.mute }}>{body}</p>
      {children}
    </div>
  );
}

/* ═══════════════════════════ PRODUCT TOUR ═══════════════════════════ */

function Tour() {
  const [tab, setTab] = useState<ScreenId>("dashboard");
  const active = SCREEN_BY_ID[tab];
  return (
    <section id="tour" className="py-20 sm:py-24" style={{ background: C.wash }}>
      <div className={MAXW}>
        <SectionHead eyebrow="Take the tour" title="See the real workspace." sub="Pick a tab to see the actual screen, in dark mode." />
        <div className="mx-auto mt-10 flex max-w-[1000px] flex-col items-center">
          <div className="flex max-w-xl flex-wrap items-center justify-center gap-1.5">
            {SCREENS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="rounded-full px-4 py-2 text-[13px] font-semibold transition-all"
                  style={{ background: on ? C.pri : "transparent", color: on ? "#fff" : C.mute, boxShadow: on ? "0 10px 22px -10px rgba(37,99,235,.55)" : "none" }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="mt-4 max-w-md text-center text-[14.5px]" style={{ color: C.mute }}>{active.line}</p>
          <div className="mt-6 w-full">
            <ProductWindow id={tab} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ PRICING ═══════════════════════════ */

function Pricing() {
  const [annual, setAnnual] = useState(true);
  const monthly = 99;
  const annualMonthly = 79;
  const price = annual ? annualMonthly : monthly;
  const features = [
    "Unlimited review requests",
    "Unified inbox — Google, Facebook, Yelp",
    "AI replies in your brand voice",
    "QR plaques, SMS & email",
    "Smart review routing",
    "Surveys & NPS",
    "Local SEO & listings",
    "White-label reports",
  ];
  return (
    <section id="pricing" className="py-20 sm:py-24" style={{ background: C.surface }}>
      <div className={MAXW}>
        <SectionHead eyebrow="Pricing" title="One plan. Everything included." sub="Start with a 14-day free trial, then pay monthly or save with annual." />

        <div className="mt-8 flex items-center justify-center gap-3">
          <button type="button" onClick={() => setAnnual(false)} className="text-[13.5px] font-semibold" style={{ color: annual ? C.mute2 : C.ink }}>
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual((a) => !a)}
            aria-label="Toggle billing period"
            className="relative h-6 w-11 rounded-full transition-colors"
            style={{ background: annual ? C.pri : "#cfd9ec" }}
          >
            <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all" style={{ left: annual ? 22 : 2 }} />
          </button>
          <span className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: annual ? C.ink : C.mute2 }}>
            Annual
            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#e7f8f0", color: "#0f9d63" }}>Save 20%</span>
          </span>
        </div>

        <div className="mx-auto mt-10 grid max-w-[880px] gap-5 md:grid-cols-2">
          {/* Growth */}
          <div className="rounded-[22px] border p-7" style={{ borderColor: "#dbe6ff", background: "#fbfcff" }}>
            <h3 className="text-[15px] font-bold" style={{ color: C.ink }}>Growth</h3>
            <p className="mt-1 text-[13px]" style={{ color: C.mute }}>Everything one business needs to climb the ratings.</p>
            <div className="mt-5 flex items-end gap-1">
              <span className="text-[44px] font-bold leading-none" style={{ color: C.ink }}>${price}</span>
              <span className="mb-1 text-[14px]" style={{ color: C.mute2 }}>/mo</span>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: C.mute2 }}>{annual ? "Billed annually" : "Billed monthly"} · per location</p>
            <Link href="/signup" className="mt-5 flex h-11 items-center justify-center gap-1.5 rounded-full text-[14px] font-bold text-white transition-transform hover:-translate-y-0.5" style={{ background: `linear-gradient(180deg,#2f6bff,${C.pri2})`, boxShadow: "0 14px 30px -12px rgba(37,99,235,.6)" }}>
              Start free trial <ArrowRight size={15} />
            </Link>
            <ul className="mt-6 space-y-2.5">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13.5px]" style={{ color: C.ink2 }}>
                  <Check size={16} style={{ color: "#0f9d63", marginTop: 1, flexShrink: 0 }} /> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Scale / enterprise */}
          <div className="rounded-[22px] border p-7" style={{ borderColor: C.line, background: C.surface }}>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold" style={{ color: C.ink }}>Scale</h3>
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase" style={{ background: "#eef2ff", color: C.pri, letterSpacing: ".08em" }}>Multi-location</span>
            </div>
            <p className="mt-1 text-[13px]" style={{ color: C.mute }}>For brands and agencies running many locations.</p>
            <div className="mt-5 flex items-end gap-1">
              <span className="text-[44px] font-bold leading-none" style={{ color: C.ink }}>Custom</span>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: C.mute2 }}>Volume pricing · dedicated success manager</p>
            <Link href="/contact" className="mt-5 flex h-11 items-center justify-center gap-1.5 rounded-full border text-[14px] font-bold transition-colors hover:bg-[#f6f9ff]" style={{ borderColor: C.line, color: C.ink2 }}>
              Talk to sales
            </Link>
            <ul className="mt-6 space-y-2.5">
              {["Everything in Growth", "Unlimited locations & brands", "Per-client workspaces", "SSO & advanced roles", "API & webhooks", "Priority support & SLA"].map((f) => (
                <li key={f} className="flex items-start gap-2 text-[13.5px]" style={{ color: C.ink2 }}>
                  <Check size={16} style={{ color: "#0f9d63", marginTop: 1, flexShrink: 0 }} /> {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 text-center text-[12.5px]" style={{ color: C.mute2 }}>
          14-day free trial on every plan · No card required · Cancel anytime
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════ CTA BAND ═══════════════════════════ */

function CtaBand() {
  return (
    <section className="py-20 sm:py-24" style={{ background: C.surface }}>
      <div className={MAXW}>
        <div className="relative overflow-hidden rounded-[28px] px-8 py-16 text-center sm:px-12" style={{ background: "linear-gradient(135deg,#0b1220,#172554)" }}>
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(600px 300px at 50% -20%, rgba(59,130,246,.35), transparent 70%)" }} />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-semibold" style={{ borderColor: "rgba(255,255,255,.18)", color: "#bcd0ff", fontFamily: "var(--f-mono)", letterSpacing: ".1em" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#4ade80" }} /> LIVE NOW
            </span>
            <h2 className="mx-auto mt-5 max-w-2xl text-white" style={{ fontSize: "clamp(30px,5vw,48px)", lineHeight: 1.06, letterSpacing: "-0.03em", fontWeight: 700 }}>
              Your reputation, on autopilot.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px]" style={{ color: "#aeb9d6", lineHeight: 1.6 }}>
              Connect your platforms and your first automated request goes out in minutes. Start free —
              no card required.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex h-12 items-center justify-center gap-1.5 rounded-full px-7 text-[15px] font-bold text-white transition-transform hover:-translate-y-0.5" style={{ background: `linear-gradient(180deg,#2f6bff,${C.pri2})`, boxShadow: "0 18px 40px -14px rgba(37,99,235,.7)" }}>
                Start free <ArrowRight size={17} />
              </Link>
              <a href="#pricing" className="inline-flex h-12 items-center justify-center rounded-full border px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/10" style={{ borderColor: "rgba(255,255,255,.22)" }}>
                See pricing
              </a>
            </div>
            <div className="mt-8 flex items-center justify-center gap-2 text-[13px]" style={{ color: "#aeb9d6" }}>
              <BadgeCheck size={16} style={{ color: "#7dd3fc" }} /> Trusted by 12,000+ local businesses
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ ROOT ═══════════════════════════ */

export function ZeitraLanding() {
  return (
    <main className="overflow-x-clip" style={{ background: "#eceeea", color: C.ink, fontFamily: "var(--f-ui)" }}>
      <style>{`
        @keyframes zl-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .zl-marquee { animation: zl-scroll 36s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .zl-marquee { animation: none; } }
      `}</style>
      <Nav />
      <Hero />
      <StatsStrip />
      <Marquee />
      <WhoItsFor />
      <HowItWorks />
      <Bento />
      <Tour />
      <Pricing />
      <LandingFaq />
      <CtaBand />
      <MarketingFooter />
    </main>
  );
}

export default ZeitraLanding;
