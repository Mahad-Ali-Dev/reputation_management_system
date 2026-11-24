"use client";

/**
 * RepulabsLanding — the repulabs marketing home ("/"):
 *
 *   Nav (transparent → floating pill on scroll) → Hero (rounded blue box with
 *   real product screenshots + integration dock) → Stats tiles → Marquee
 *   → Who it's for → How it works (pinned step cards) → Features (bento)
 *   → Pricing (monthly / annual)
 *   → FAQ (scroll-driven) → CTA band → Footer (reused MarketingFooter).
 *
 * Brand: repulabs LIGHT premium (white / pale-blue, #2563eb primary, rounded,
 * soft shadows) so it reads as one system with the other marketing pages
 * (About / Pricing / Contact use the same MarketingShell). "use client" for the
 * small tab / toggle / scroll interactions.
 */

import { Logo } from "@/components/shell/logo";
import { type HowStep, HowItWorksSteps } from "@/components/landing/how-it-works-steps";
import { type Feature, FeatureParallax } from "@/components/landing/feature-parallax";
import { IntegrationDock } from "@/components/landing/integration-dock";
import { ProductWindow, SCREENS, type ScreenId } from "@/components/landing/product-screens";
import { BusinessScroller } from "@/components/landing/business-scroller";
import { type FaqItem, ScrollFaq } from "@/components/landing/scroll-faq";
import { StepTimeline, type TimelineStep } from "@/components/landing/step-timeline";
import { MarketingFooter } from "@/components/landing/marketing-shell";
import { LandingCommandCenter } from "@/components/landing/sections/command-center";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  Clock,
  Inbox,
  Phone,
  QrCode,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { animate, useInView, useReducedMotion } from "motion/react";
import { type ComponentType, type CSSProperties, useEffect, useRef, useState } from "react";

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

/** The landing nav. Other marketing pages (e.g. /legal) reuse it with
 *  `linkBase="/"` so the section links jump back to the homepage. */
export function LandingNav({ linkBase = "" }: { linkBase?: string } = {}) {
  const links = [
    { href: `${linkBase}#features`, label: "Features" },
    { href: `${linkBase}#how`, label: "How it works" },
    { href: `${linkBase}#pricing`, label: "Pricing" },
    { href: `${linkBase}#faq`, label: "FAQ" },
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
        className={`pointer-events-auto relative mx-auto flex h-14 items-center gap-3 px-5 sm:px-6 ${scrolled ? "w-[90%] max-w-[1180px] rounded-full" : "w-full max-w-[1200px] rounded-none"}`}
        style={headerStyle}
      >
        <Link href="/" aria-label="repulabs home" style={{ color: "inherit", textDecoration: "none" }}>
          <Logo size={27} />
        </Link>
        {/* From lg up, pinned to the true centre of the bar regardless of the
            logo and right-hand buttons' widths. On tablets the bar is too
            narrow for that, so the links just flow between them. */}
        <nav className="mx-auto hidden items-center gap-1 md:flex lg:absolute lg:left-1/2 lg:top-1/2 lg:mx-0 lg:-translate-x-1/2 lg:-translate-y-1/2">
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

/** How long each hero tab stays up before auto-advancing. */
const HERO_TAB_MS = 5000;

function Hero() {
  const [tab, setTab] = useState<ScreenId>("dashboard");
  // Auto-rotate the product tabs. Pauses while the visitor hovers or focuses
  // the tabs / screenshot, while the browser tab is hidden, and never runs for
  // reduced-motion visitors. A click restarts the timer from that tab.
  const reduce = useReducedMotion();
  const [hovering, setHovering] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [cycle, setCycle] = useState(0);
  const paused = hovering || pageHidden;
  const autoplay = !reduce;

  useEffect(() => {
    const onVis = () => setPageHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    // Warm the cache so the first switch to each screenshot doesn't flash.
    for (const sc of SCREENS) {
      const img = new Image();
      img.src = sc.src;
    }
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `cycle` restarts the timer after a click
  useEffect(() => {
    if (!autoplay || paused) return;
    const t = window.setTimeout(() => {
      setTab((cur) => {
        const i = SCREENS.findIndex((x) => x.id === cur);
        return SCREENS[(i + 1) % SCREENS.length]?.id ?? cur;
      });
    }, HERO_TAB_MS);
    return () => window.clearTimeout(t);
  }, [tab, autoplay, paused, cycle]);

  const pick = (id: ScreenId) => {
    setTab(id);
    setCycle((c) => c + 1);
  };
  const pauseProps = {
    onMouseEnter: () => setHovering(true),
    onMouseLeave: () => setHovering(false),
    onFocus: () => setHovering(true),
    onBlur: () => setHovering(false),
  };

  return (
    <section className="relative overflow-x-clip px-2.5 pb-10 pt-2.5 sm:px-4">
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

          {/* tab chips (auto-advancing; the active chip fills up as its time runs) */}
          <div
            className="mt-9 flex max-w-xl flex-wrap items-center justify-center gap-1.5"
            role="tablist"
            aria-label="Product screens"
            {...pauseProps}
          >
            {SCREENS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => pick(t.id)}
                  className="relative overflow-hidden rounded-full px-4 py-2 text-[13px] font-semibold transition-all"
                  style={on ? { background: "#0b1220", color: "#fff" } : { background: "rgba(255,255,255,.16)", color: "#fff" }}
                >
                  {on && autoplay && (
                    <span
                      key={`${t.id}-${cycle}`}
                      aria-hidden
                      className="rl-hero-tab-progress pointer-events-none absolute inset-y-0 left-0"
                      style={{
                        background: "rgba(255,255,255,.16)",
                        animationDuration: `${HERO_TAB_MS}ms`,
                        animationPlayState: paused ? "paused" : "running",
                      }}
                    />
                  )}
                  <span className="relative">{t.label}</span>
                </button>
              );
            })}
          </div>
          <style>{`
            @keyframes rl-hero-tab-progress { from { width: 0%; } to { width: 100%; } }
            .rl-hero-tab-progress { width: 0%; animation-name: rl-hero-tab-progress; animation-timing-function: linear; animation-fill-mode: forwards; }
          `}</style>
        </div>

        {/* real product screenshot peeking from the bottom edge of the box */}
        <div className="relative z-10 mx-auto mt-10 w-full max-w-[1000px] px-4" style={{ transform: "translateY(46px)" }}>
          <div aria-hidden className="absolute -left-4 bottom-10 z-20 hidden w-[208px] -rotate-[8deg] lg:block">
            <MiniReviewCard />
          </div>
          <div aria-hidden className="absolute -right-4 bottom-10 z-20 hidden w-[196px] rotate-[8deg] lg:block">
            <MiniRatingCard />
          </div>
          <div className="relative z-10" {...pauseProps}>
            <ProductWindow id={tab} priority />
          </div>
        </div>
      </div>

      {/* connects with — on the page background, below the box */}
      <div className="mx-auto mt-12 flex max-w-[1200px] flex-col items-center gap-3.5 px-5">
        <span className="text-[11px] font-bold uppercase" style={{ letterSpacing: ".22em", color: C.mute2 }}>
          Connects with
        </span>
        <IntegrationDock />
      </div>
    </section>
  );
}

function MiniReviewCard() {
  return (
    <div className="glass-surface glass-surface--raised rounded-2xl p-3.5">
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
    <div className="glass-surface glass-surface--raised rounded-2xl p-3.5">
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

const HAIR_V = "linear-gradient(180deg, transparent, #c9d6ee 20%, #c9d6ee 80%, transparent)";
const HAIR_H = "linear-gradient(90deg, transparent, #c9d6ee 20%, #c9d6ee 80%, transparent)";

/** Open metric band: big numbers on the page background, divided by fading
 *  hairlines (no cards). Numbers count up as the band scrolls into view. */
function StatsStrip() {
  const stats: {
    Icon: ComponentType<{ size?: number; style?: CSSProperties }>;
    count: number;
    decimals?: number;
    tail?: string;
    suffix?: string;
    suffixColor?: string;
    label: string;
  }[] = [
    { Icon: Star, count: 4.8, decimals: 1, suffix: "★", suffixColor: "#f5a623", label: "Average rating across 12k+ businesses" },
    { Icon: Clock, count: 6, suffix: "min", label: "To your first automated review request" },
    { Icon: Phone, count: 24, tail: "/7", label: "AI phone receptionist, never off the clock" },
    { Icon: BadgeCheck, count: 0, label: "Lock-in contracts — cancel anytime" },
  ];
  return (
    <section className="py-12 sm:py-16">
      <div className={MAXW}>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className="relative flex flex-col items-center px-3 py-7 text-center sm:px-6 lg:py-3">
              {/* vertical hairline between columns (2 per row on mobile, 4 on desktop) */}
              {i > 0 && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute left-0 top-1/2 h-[70%] w-px -translate-y-1/2 ${i % 2 === 1 ? "" : "hidden lg:block"}`}
                  style={{ background: HAIR_V }}
                />
              )}
              {/* horizontal hairline between the two mobile rows */}
              {i >= 2 && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-[10%] top-0 h-px lg:hidden"
                  style={{ background: HAIR_H }}
                />
              )}
              <s.Icon size={18} style={{ color: C.pri }} />
              <p
                className="mt-3 flex items-baseline justify-center gap-1 font-bold leading-none"
                style={{ color: C.ink, fontSize: "clamp(38px, 5vw, 56px)", letterSpacing: "-0.035em" }}
              >
                <CountUp to={s.count} decimals={s.decimals} />
                {s.tail}
                {s.suffix && (
                  <span className="font-semibold" style={{ fontSize: "0.42em", letterSpacing: 0, color: s.suffixColor ?? C.mute }}>
                    {s.suffix}
                  </span>
                )}
              </p>
              <span aria-hidden className="mt-4 h-[3px] w-7 rounded-full" style={{ background: C.pri }} />
              <p className="mt-3 max-w-[210px] text-[13.5px] leading-snug sm:text-[14px]" style={{ color: C.mute }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Counts up from 0 when scrolled into view. The server HTML has the real value
 * (crawlers / no-JS see real figures). On mount, a number that's off-screen
 * quietly resets to 0 and counts up once it's actually visible; one already on
 * screen, or reduced motion, just shows the value. Uses no IntersectionObserver
 * rootMargin, which browsers ignore inside iframes (previews, embeds).
 */
function CountUp({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const visible = useInView(ref, { once: true, amount: 0.6 });
  const [armed, setArmed] = useState(false);
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    if (r.top > window.innerHeight || r.bottom < 0) {
      setArmed(true);
      setValue(0);
    }
  }, [reduce]);

  useEffect(() => {
    if (!armed || !visible) return;
    const controls = animate(0, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setValue });
    return () => controls.stop();
  }, [armed, visible, to]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {value.toFixed(decimals)}
    </span>
  );
}

/* ═══════════════════════════ MARQUEE ═══════════════════════════ */

function Marquee() {
  return (
    <section
      className="py-7 sm:py-8"
      aria-label="Built for every kind of local business"
    >
      <BusinessScroller />
    </section>
  );
}

/* ═══════════════════════════ WHO IT'S FOR ═══════════════════════════ */

const AUDIENCES: TimelineStep[] = [
  {
    title: "Single location",
    description: "Turn every happy customer into a public 5-star review, and quietly catch the unhappy ones before they post.",
  },
  {
    title: "Multi-location brands",
    description: "One dashboard for every branch — compare ratings, standardise replies and keep each listing on brand.",
  },
  {
    title: "Agencies",
    description: "Run reputation for all your clients under one roof, with white-label reports and per-client workspaces.",
  },
];

function WhoItsFor() {
  return (
    <section className="py-20 sm:py-24">
      <div className={MAXW}>
        <StepTimeline
          steps={AUDIENCES}
          ringColor="rgba(255,255,255,.75)"
          header={
            <SectionHead
              eyebrow="Who it's for"
              title="Built for the businesses stars matter to."
              sub="From a single storefront to a portfolio of locations — repulabs scales with you."
              center={false}
            />
          }
        />
      </div>
    </section>
  );
}

/* ═══════════════════════════ HOW IT WORKS ═══════════════════════════ */

const HOW_STEPS: HowStep[] = [
  {
    title: "Connect your platforms",
    description: "Link Google Business, Facebook, Yelp and your POS or CRM in a few clicks. The setup wizard does the rest.",
  },
  {
    title: "Ask for the review",
    description: "A QR plaque, SMS or email reaches each customer at the perfect moment, right after a great experience.",
  },
  {
    title: "Smart routing",
    description: "Happy customers go straight to Google. A low rating opens a private feedback form and alerts your team instead.",
  },
  {
    title: "AI drafts the reply",
    description: "Every review gets an on-brand response in your voice. Approve, tweak or let autopilot send it.",
  },
  {
    title: "Autopilot keeps it running",
    description: "Requests, replies and follow-ups run on their own, so your rating climbs while you get on with work.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="relative overflow-hidden py-20 sm:py-24">
      <div className={`${MAXW} relative`}>
        <SectionHead eyebrow="How it works" title="Your reputation, on a loop." sub="Five steps that run on their own once they’re set up." />
        <div className="mt-14 md:mt-16">
          <HowItWorksSteps steps={HOW_STEPS} />
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ FEATURES ═══════════════════════════ */

const FEATURES: Feature[] = [
  {
    id: "inbox",
    Icon: Inbox,
    eyebrow: "Unified inbox",
    title: "Every review, in one queue.",
    description: "Google, Facebook and Yelp reviews land in one inbox, sorted so the ones that need you come first.",
    points: ["Filter by rating, platform or location", "A needs-reply queue so nothing slips", "One-click AI reply drafts"],
    screen: "inbox",
  },
  {
    id: "autopilot",
    Icon: Sparkles,
    eyebrow: "AI replies",
    title: "Replies in your voice, on autopilot.",
    description: "Five-star reviews get an on-brand reply automatically; everything else is drafted for you to approve.",
    points: ["Learns your tone from past replies", "Choose how much it handles alone", "A weekly digest of what it did"],
    screen: "autopilot",
  },
  {
    id: "requests",
    Icon: QrCode,
    eyebrow: "Review requests",
    title: "Ask at the perfect moment.",
    description: "QR stands, cards, SMS and email send happy customers straight to your review page, and every scan is tracked.",
    points: ["QR stands, cards and links", "SMS and email requests", "Scans and reviews tracked per device"],
    screen: "devices",
  },
  {
    id: "analytics",
    Icon: BarChart3,
    eyebrow: "Analytics",
    title: "Watch your rating climb.",
    description: "New reviews, average rating and where they came from, over any period, with a report you can export.",
    points: ["Trends and rating breakdowns", "Review sources at a glance", "One-click PDF export"],
    screen: "analytics",
  },
];

function Features() {
  const everyday = [
    "QR plaques & cards", "SMS & email requests", "Smart review routing", "Sentiment analysis",
    "Local SEO & listings", "Surveys & NPS", "Team roles & approvals", "White-label reports",
    "Competitor tracking",
  ];
  return (
    <section id="features" className="py-20 sm:py-24">
      <div className={MAXW}>
        <SectionHead eyebrow="Features" title="Everything your reputation needs, in one place." sub="Reviews, replies, requests, phone and autopilot — one premium workspace." />

        <div className="mt-14 md:mt-20">
          <FeatureParallax features={FEATURES} />
        </div>

        {/* everyday list */}
        <div className="glass-surface mt-20 rounded-2xl p-6 sm:p-7 md:mt-28">
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

/* ═══════════════════════════ PRICING ═══════════════════════════ */

/* ═══════════════════════════ COMMAND CENTER ═══════════════════════════ */

/** The multi-location section from the previous landing page (world map, unified
 *  inbox, volume chart, Autopilot/digest cards), on the glass canvas with this
 *  page's section heading. */
function CommandCenter() {
  return (
    <LandingCommandCenter
      transparent
      header={
        <SectionHead
          eyebrow="Command center"
          title={
            <>
              Every location. <span style={{ color: C.pri }}>One pane of glass.</span>
            </>
          }
          sub="Reviews, messages, calls and reports from every location stream into one live command center, so nothing slips."
        />
      }
    />
  );
}

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
    <section id="pricing" className="py-20 sm:py-24">
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
          <div className="glass-surface glass-surface--raised rounded-[22px] p-7">
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
          <div className="glass-surface rounded-[22px] p-7">
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

/* ═══════════════════════════ FAQ ═══════════════════════════ */

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "setup",
    question: "How quickly can I set up repulabs?",
    answer:
      "Most teams are sending automated requests within 6 minutes. Connect Google Business, plug in one POS or CRM, and the wizard does the rest.",
  },
  {
    id: "voice",
    question: "Does the AI actually sound like me?",
    answer:
      "It learns from your past reviews, replies and website, then drafts every response in your brand's tone. You stay in control — approve, tweak or auto-send — and it sharpens with every edit.",
  },
  {
    id: "phone",
    question: "Can I use the AI receptionist with my existing number?",
    answer:
      "Yes. Forward missed or after-hours calls to your AI receptionist, or port your number across. It answers 24/7, books jobs and texts callers back, with recording consent handled.",
  },
  {
    id: "security",
    question: "Is my customer data secure?",
    answer:
      "Every record is encrypted in transit and at rest and isolated per workspace with role-based access. We never sell your data or train shared models on it, and you can export or delete it anytime.",
  },
  {
    id: "cancel",
    question: "Can I cancel anytime?",
    answer:
      "Always. No lock-in contracts — cancel in one click and keep access until the end of your billing period. Start with a 14-day free trial, no card required.",
  },
];

function Faq() {
  return (
    <section id="faq" className="py-20 sm:py-24">
      <div className={MAXW}>
        <ScrollFaq
          items={FAQ_ITEMS}
          header={
            <SectionHead
              eyebrow="FAQ"
              title="Questions, answered."
              sub="Everything you need to know about repulabs. Keep scrolling — each answer opens in turn."
            />
          }
        />

        <div
          className="glass-surface mx-auto mt-12 flex max-w-3xl flex-col items-center justify-between gap-4 rounded-2xl px-6 py-5 sm:flex-row"
        >
          <div className="text-center sm:text-left">
            <p className="text-[16px] font-bold" style={{ color: C.ink }}>Still have questions?</p>
            <p className="mt-0.5 text-[14px]" style={{ color: C.mute }}>Talk to a specialist — no pressure, no sales script.</p>
          </div>
          <Link
            href="/contact"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-[14px] font-semibold text-white transition-transform hover:-translate-y-0.5"
            style={{ background: `linear-gradient(180deg,#2f6bff,${C.pri2})`, boxShadow: "0 12px 26px -12px rgba(37,99,235,.6)" }}
          >
            Contact us <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ CTA BAND ═══════════════════════════ */

function CtaBand() {
  return (
    <section className="py-20 sm:py-24">
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

export function RepulabsLanding() {
  return (
    <main className="glass-theme glass-canvas overflow-x-clip" data-glass-mode="light" style={{ color: C.ink, fontFamily: "var(--f-ui)" }}>
      <LandingNav />
      <Hero />
      <StatsStrip />
      <Marquee />
      <WhoItsFor />
      <HowItWorks />
      <Features />
      <CommandCenter />
      <Pricing />
      <Faq />
      <CtaBand />
      <MarketingFooter />
    </main>
  );
}

export default RepulabsLanding;
