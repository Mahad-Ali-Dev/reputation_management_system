"use client";

/**
 * Landing hero — repulabs marketing home (DARK cinematic canvas).
 *
 * Rebuilt as the founder's original InteractiveHero composition ("Nexus"):
 * sticky blur nav → centered announcement pill → centered rotating headline →
 * email-capture form → "works with" brand strip → floating product preview.
 * All on the single #070b16 canvas shared by every landing section.
 *
 * Animation primitives are shared from `@/components/landing/anim`:
 *   - DotGrid       interactive dot-grid canvas behind the hero
 *   - Reveal        staggered entrance fade-up
 *   - Float         idle bob on the floating cards + badge
 *   - RotatingText  the rotating final word of the headline
 *   - ShinyText     sheen sweep on the announcement pill
 */

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  Calendar,
  ChevronDown,
  Inbox,
  Menu,
  Phone,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { type ComponentType, type FormEvent, useEffect, useState } from "react";
import { DotGrid, Float, Reveal, RotatingText, ShinyText } from "@/components/landing/anim";
import { cn } from "@/lib/utils";

/* ─────────────────────────────── data ─────────────────────────────── */

const NAV_LINKS: { label: string; href: string; dropdown?: boolean }[] = [
  { label: "Product", href: "#platform", dropdown: true },
  { label: "How it works", href: "#how-it-works" },
  { label: "Integrations", href: "#integrations" },
  { label: "Operators", href: "#operators" },
  { label: "FAQ", href: "#faq" },
];

/** Items inside the "Product" hover dropdown — each links to a landing section. */
const PRODUCT_MENU = [
  { label: "Reviews & Inbox", href: "#command" },
  { label: "Platform", href: "#platform" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Integrations", href: "#integrations" },
  { label: "For operators", href: "#operators" },
] as const;

/** "Works with" brand strip — real integration marks shipped in /public.
 *  Square's mark is a black tile, so it gets inverted (monochrome-safe) to
 *  stay legible on the dark canvas. */
const WORKS_WITH: { name: string; file: string; invert?: boolean }[] = [
  { name: "Google", file: "google" },
  { name: "Meta", file: "meta" },
  { name: "Instagram", file: "instagram" },
  { name: "WhatsApp", file: "whatsapp" },
  { name: "Square", file: "square", invert: true },
  { name: "Slack", file: "slack" },
];

const RECENT_REVIEWS = [
  { Mark: GoogleMark, text: "Great service and super friendly team!", time: "2m ago" },
  { Mark: FacebookMark, text: "Highly recommend this place.", time: "1h ago" },
  { Mark: YelpMark, text: "Consistently excellent every time.", time: "3h ago" },
] as const;

const BUSINESS_PLATFORMS = [
  { Mark: GoogleMark, name: "Google", rating: "4.8" },
  { Mark: FacebookMark, name: "Facebook", rating: "4.7" },
  { Mark: YelpMark, name: "Yelp", rating: "4.5" },
] as const;

const FEATURES: { label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { label: "AI Replies", Icon: Sparkles },
  { label: "Requests", Icon: Send },
  { label: "Inbox", Icon: Inbox },
  { label: "AI Phone", Icon: Phone },
  { label: "Autopilot", Icon: Zap },
];

/* ─────────────────────────── brand marks ─────────────────────────── */

type MarkProps = { size?: number; className?: string };

/** The repulabs "R" tile mark — indigo→violet gradient tile, white R. */
function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-[11px] shadow-[0_10px_24px_-8px_rgba(99,102,241,0.65)]"
      style={{ width: size, height: size, background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
      aria-hidden
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path
          d="M5 21V3.6C5 3.27 5.27 3 5.6 3H13c3.31 0 6 2.46 6 5.5 0 2.46-1.76 4.54-4.2 5.24L19 21h-4.2l-3.6-6.5H9V21H5Zm4-9.7h3.4c1.38 0 2.6-1 2.6-2.3s-1.22-2.3-2.6-2.3H9v4.6Z"
          fill="#fff"
        />
      </svg>
    </span>
  );
}

function GoogleMark({ size = 20, className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h6.19c-.27 1.44-1.08 2.66-2.3 3.48v2.89h3.72c2.18-2 3.45-4.96 3.45-8.38Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.75H1.7v2.98A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.67A7.2 7.2 0 0 1 5.17 12c0-.93.16-1.83.38-2.67V6.35H1.7A12 12 0 0 0 0 12c0 1.94.46 3.77 1.7 5.65l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.2 15.1 0 12 0 7.5 0 3.59 2.65 1.7 6.35l3.85 2.98C6.46 6.6 9 4.75 12 4.75Z"
      />
    </svg>
  );
}

function FacebookMark({ size = 20, className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M15.9 15.47 16.43 12h-3.33V9.75c0-.95.46-1.87 1.95-1.87h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H6.6v3.47h3.05V24h3.75v-8.53h2.5Z"
      />
    </svg>
  );
}

function YelpMark({ size = 20, className }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="5" fill="#D32323" />
      <g fill="#fff" transform="translate(12 13)">
        <rect x="-1.05" y="-8.4" width="2.1" height="6.2" rx="1.05" transform="rotate(-58)" />
        <rect x="-1.05" y="-8.4" width="2.1" height="6.2" rx="1.05" transform="rotate(-29)" />
        <rect x="-1.05" y="-8.6" width="2.1" height="6.4" rx="1.05" />
        <rect x="-1.05" y="-8.4" width="2.1" height="6.2" rx="1.05" transform="rotate(29)" />
        <rect x="-1.05" y="-8.4" width="2.1" height="6.2" rx="1.05" transform="rotate(58)" />
      </g>
    </svg>
  );
}

/* ─────────────────────────── small pieces ─────────────────────────── */

function Stars({ count = 5, size = 15, className }: { count?: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[2px]", className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Star key={`s-${i}`} size={size} strokeWidth={0} className="fill-[#FFB000] text-[#FFB000]" />
      ))}
    </span>
  );
}

/** Cyan upward trend line with soft area fill + halo endpoint — dark-tinted. */
function TrendChart() {
  const line = "M2 58 L20 52 L38 55 L56 44 L74 47 L92 34 L110 38 L128 24 L146 12";
  return (
    <svg viewBox="0 0 148 68" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="hero-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0.22" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hero-trend-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4a7dff" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      {[16, 34, 52].map((y) => (
        <line key={y} x1="0" y1={y} x2="148" y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      ))}
      <path d={`${line} L146 68 L2 68 Z`} fill="url(#hero-trend-fill)" />
      <path
        d={line}
        fill="none"
        stroke="url(#hero-trend-line)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="146" cy="12" r="6" fill="#22d3ee" opacity="0.2" />
      <circle cx="146" cy="12" r="3.2" fill="#22d3ee" />
    </svg>
  );
}

/** Night storefront illustration for the "Your business" card — dark-tinted. */
function Storefront() {
  return (
    <svg viewBox="0 0 200 74" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="200" height="74" fill="#121b2f" />
      <rect y="40" width="200" height="34" fill="#0d1526" />
      {/* lit windows + door */}
      <rect x="18" y="46" width="46" height="28" rx="2" fill="#e8b96b" opacity="0.85" />
      <rect x="82" y="52" width="34" height="22" rx="2" fill="#1c2942" />
      <rect x="134" y="46" width="46" height="28" rx="2" fill="#e8b96b" opacity="0.85" />
      {/* awning stripes */}
      <g fill="#c65a4e">
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={`aw-${i}`} x={12 + i * 18} y="30" width="9" height="12" />
        ))}
      </g>
      <g fill="#1e2b4a">
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={`aw2-${i}`} x={21 + i * 18} y="30" width="9" height="12" />
        ))}
      </g>
      <rect x="0" y="28" width="200" height="4" fill="#7d4640" />
    </svg>
  );
}

/* ─────────────────────────────── nav ─────────────────────────────── */

/**
 * Desktop nav link — ported from the kit's NavLink/AnimatedNavLink: a relative
 * link whose 1px gradient underline (blue → cyan) scales from 0 to full width
 * on hover, plus the rotating chevron for dropdown triggers.
 */
function NavLink({
  href,
  children,
  hasDropdown = false,
  isOpen = false,
}: {
  href: string;
  children: React.ReactNode;
  hasDropdown?: boolean;
  isOpen?: boolean;
}) {
  return (
    <a
      href={href}
      className="group relative flex items-center py-1 text-[15px] font-semibold text-[#cdd8f2] transition-colors duration-200 hover:text-white"
    >
      {children}
      {hasDropdown && (
        <ChevronDown
          size={13}
          strokeWidth={2.5}
          className={cn("ml-1 transition-transform duration-200", isOpen && "rotate-180")}
          aria-hidden
        />
      )}
      {/* gradient underline — scaleX 0 → 1 from center on hover (0.3s ease-out,
          same feel as the kit's motion variant) */}
      <span
        aria-hidden
        className="absolute -bottom-0.5 left-0 right-0 h-px origin-center scale-x-0 rounded-full bg-gradient-to-r from-[#4a7dff] to-[#22d3ee] transition-transform duration-300 ease-out group-hover:scale-x-100"
      />
    </a>
  );
}

/**
 * Hover dropdown card — same AnimatePresence pop as the kit's DropdownMenu
 * (y:10 / scale:0.95 → rest), restyled as a dark glass card. The 8px gap is
 * padding (not margin) so the pointer never leaves the hover wrapper while
 * travelling from trigger to menu.
 */
function DropdownMenu({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{ x: "-50%" }}
          className="absolute left-1/2 top-full z-40 w-60 origin-top pt-2"
        >
          <div className="rounded-xl border border-white/10 bg-[#0d1526]/95 p-2 shadow-[0_28px_60px_-18px_rgba(0,0,0,0.75)] backdrop-blur-md">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DropdownItem({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13.5px] font-medium text-[#cdd8f2] transition-colors duration-150 hover:bg-white/5 hover:text-white"
    >
      <span>{children}</span>
    </a>
  );
}

function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={false}
      animate={{
        backgroundColor: scrolled ? "rgba(10,14,26,0.85)" : "rgba(10,14,26,0.5)",
        borderBottomColor: scrolled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0)",
        boxShadow: scrolled ? "0 16px 40px -24px rgba(0,0,0,0.8)" : "0 0 0 rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full border-b backdrop-blur-md"
    >
      <nav className="mx-auto flex h-[76px] max-w-[1280px] items-center justify-between px-6 lg:px-10">
        {/* logo */}
        <a href="#top" className="flex flex-shrink-0 items-center gap-3">
          <BrandMark size={40} />
          <span className="text-[22px] font-bold tracking-[-0.02em] text-white">
            repu
            <span className="bg-gradient-to-r from-[#6d8bff] to-[#22d3ee] bg-clip-text text-transparent [-webkit-text-fill-color:transparent]">
              labs
            </span>
          </span>
        </a>

        {/* center links */}
        <div className="hidden items-center gap-7 lg:flex xl:gap-9">
          {NAV_LINKS.map((l) =>
            l.dropdown ? (
              <div
                key={l.label}
                data-dropdown={l.label.toLowerCase()}
                className="relative"
                onMouseEnter={() => setOpenDropdown(l.label)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <NavLink href={l.href} hasDropdown isOpen={openDropdown === l.label}>
                  {l.label}
                </NavLink>
                <DropdownMenu isOpen={openDropdown === l.label}>
                  {PRODUCT_MENU.map((item) => (
                    <DropdownItem key={item.label} href={item.href} onClick={() => setOpenDropdown(null)}>
                      {item.label}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </div>
            ) : (
              <NavLink key={l.label} href={l.href}>
                {l.label}
              </NavLink>
            ),
          )}
        </div>

        {/* right actions */}
        <div className="flex flex-shrink-0 items-center gap-3 sm:gap-5">
          <a href="/login" className="hidden text-[15px] font-semibold text-[#cdd8f2] hover:text-white sm:inline">
            Log in
          </a>
          <motion.a
            href="/signup"
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[15px] font-bold text-white sm:px-5"
            style={{
              background: "linear-gradient(90deg,#4f46e5,#7c3aed)",
              boxShadow: "0 14px 40px -8px rgba(99,102,241,0.65)",
            }}
          >
            Start free <ArrowRight size={17} />
          </motion.a>
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-xl text-[#cdd8f2] hover:bg-white/5 hover:text-white lg:hidden"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-t border-white/10 bg-[#0d1526]/95 px-6 py-4 backdrop-blur-md lg:hidden"
          >
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2.5 text-[15px] font-semibold text-[#cdd8f2] hover:bg-white/5 hover:text-white"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-[15px] font-semibold text-[#22d3ee] hover:bg-white/5"
              >
                Log in
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

/* ─────────────────────── product preview cluster ─────────────────────── */

function CardHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-bold text-white">{children}</h3>;
}

function ProductPreview() {
  return (
    <div className="relative mx-auto mt-14 w-full max-w-4xl text-left sm:mt-16">
      {/* soft glow behind the panel */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-16 bottom-0"
        style={{
          background: "radial-gradient(640px 320px at 50% 20%, rgba(79,70,229,0.18), transparent 70%)",
        }}
      />

      {/* main dashboard panel */}
      <Reveal delay={0.5} y={28}>
        <div className="rounded-[26px] border border-white/[0.09] bg-white/[0.035] p-4 shadow-[0_44px_110px_-38px_rgba(0,0,0,0.85)] backdrop-blur-sm sm:p-5">
          {/* reputation overview */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#0d1526] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <CardHeading>Reputation overview</CardHeading>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] font-medium text-[#9db0d6]">
                <Calendar size={14} className="text-[#6b7ba3]" /> Last 30 days
                <ChevronDown size={14} className="text-[#6b7ba3]" />
              </span>
            </div>

            <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-4">
              {/* average rating */}
              <div>
                <p className="text-[12px] font-medium text-[#6b7ba3]">Average rating</p>
                <p className="mt-1 text-[30px] font-bold leading-none text-white">4.8</p>
                <Stars className="mt-2" size={14} />
                <p className="mt-2 text-[11px] text-[#6b7ba3]">Based on 324 reviews</p>
              </div>
              {/* new reviews */}
              <div>
                <p className="text-[12px] font-medium text-[#6b7ba3]">New reviews</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-[30px] font-bold leading-none text-white">+47</p>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#0f9d63]/15 px-1.5 py-0.5 text-[11px] font-semibold text-[#2fd58a]">
                    <TrendingUp size={11} /> 18%
                  </span>
                </div>
                <p className="mt-[18px] text-[11px] text-[#6b7ba3]">vs previous 30 days</p>
              </div>
              {/* chart */}
              <div className="h-[72px] self-center">
                <TrendChart />
              </div>
            </div>
          </div>

          {/* recent reviews */}
          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#0d1526] p-4 sm:p-5">
            <CardHeading>Recent reviews</CardHeading>
            <div className="mt-3 space-y-3">
              {RECENT_REVIEWS.map((r) => (
                <div key={r.time} className="flex items-center gap-3">
                  <r.Mark size={22} />
                  <Stars size={13} />
                  <p className="hidden flex-1 truncate text-[12px] text-[#9db0d6] sm:block">{r.text}</p>
                  <span className="ml-auto flex-shrink-0 text-[11px] text-[#6b7ba3] sm:ml-0">{r.time}</span>
                </div>
              ))}
            </div>
            <a
              href="#reviews"
              className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#22d3ee] hover:gap-1.5"
            >
              View all reviews <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </Reveal>

      {/* floating: +47 badge — sits above the panel's top-left corner */}
      <Reveal delay={0.85} className="absolute -left-10 -top-10 z-30 hidden lg:block">
        <Float amount={9} duration={5.5}>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1526] px-4 py-3 shadow-[0_28px_60px_-20px_rgba(0,0,0,0.8)]">
            <span
              className="grid h-[46px] w-[46px] place-items-center rounded-full text-white"
              style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}
            >
              <Star size={22} className="fill-white text-white" strokeWidth={0} />
            </span>
            <div>
              <p className="text-[22px] font-bold leading-none text-white">+47</p>
              <p className="mt-1 text-[12px] text-[#6b7ba3]">reviews this month</p>
            </div>
          </div>
        </Float>
      </Reveal>

      {/* floating: your business card — overlaps the panel's right edge */}
      <Reveal delay={0.75} className="absolute -right-10 top-[158px] z-30 hidden w-[228px] lg:block">
        <Float amount={12} duration={6.5} delay={0.4}>
          <div className="rounded-[20px] border border-white/10 bg-[#0d1526] p-4 shadow-[0_32px_70px_-24px_rgba(0,0,0,0.85)]">
            <CardHeading>Your business</CardHeading>
            <div className="mt-2.5 h-[54px] w-full overflow-hidden rounded-md">
              <Storefront />
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <p className="text-[14px] font-bold text-white">Downtown Location</p>
              <BadgeCheck size={15} className="fill-[#4a7dff] text-[#0d1526]" />
            </div>
            <p className="text-[11px] text-[#6b7ba3]">123 Main St, Austin, TX</p>

            <div className="mt-2.5 flex items-center gap-2">
              <p className="text-[24px] font-bold leading-none text-white">4.8</p>
              <div>
                <Stars size={12} />
                <p className="text-[10px] text-[#6b7ba3]">324 reviews</p>
              </div>
            </div>

            <div className="mt-2.5 space-y-1.5 border-t border-white/[0.08] pt-2.5">
              {BUSINESS_PLATFORMS.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <p.Mark size={16} />
                  <span className="text-[12px] font-medium text-[#9db0d6]">{p.name}</span>
                  <span className="ml-auto text-[12px] font-bold text-white">{p.rating}</span>
                </div>
              ))}
            </div>
            <a
              href="#listings"
              className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#22d3ee] hover:gap-1.5"
            >
              Manage listings <ArrowRight size={13} />
            </a>
          </div>
        </Float>
      </Reveal>

      {/* feature pill strip */}
      <Reveal delay={0.9} y={20}>
        <Float amount={5} duration={7}>
          <div className="mt-4 flex items-center justify-between gap-1 overflow-x-auto rounded-2xl border border-white/[0.09] bg-white/[0.035] px-3 py-3 backdrop-blur-sm sm:gap-2 sm:px-4">
            {FEATURES.map((f, i) => (
              <div key={f.label} className="flex items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <f.Icon className="h-4 w-4 text-[#22d3ee]" />
                  <span className="text-[12px] font-semibold text-[#cdd8f2] sm:text-[13px]">{f.label}</span>
                </span>
                {i < FEATURES.length - 1 && <span className="h-[26px] w-px flex-shrink-0 bg-white/10" />}
              </div>
            ))}
          </div>
        </Float>
      </Reveal>
    </div>
  );
}

/* ─────────────────────────────── hero ─────────────────────────────── */

export function LandingHero() {
  const [email, setEmail] = useState("");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    window.location.href = "/signup?email=" + encodeURIComponent(email);
  };

  return (
    <section id="top" className="relative isolate overflow-x-clip bg-[#070b16]">
      {/* faint radial glow accent (single-canvas rule: no stripe backgrounds) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(1000px 560px at 50% -8%, rgba(59,90,255,0.14), transparent 70%)",
        }}
      />

      <TopNav />

      <div className="relative">
        {/* interactive dot canvas + the original's bottom fade into the page bg */}
        <DotGrid className="opacity-80" color="90, 130, 255" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, transparent 55%, #070b16 96%), radial-gradient(ellipse at center, transparent 40%, rgba(7,11,22,0.75) 100%)",
          }}
        />

        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-6 pb-24 pt-14 text-center sm:pt-16 lg:pb-28 lg:pt-20">
          {/* announcement pill */}
          <Reveal delay={0.05}>
            <ShinyText
              text="✦ New: AI Phone receptionist is live"
              className="cursor-default rounded-full border border-white/10 bg-[#101a33] px-4 py-1 text-[12px] font-medium text-[#22d3ee] transition-colors hover:border-[#22d3ee]/40 sm:text-[13px]"
            />
          </Reveal>

          {/* headline */}
          <Reveal delay={0.12}>
            <h1 className="mt-6 max-w-4xl text-[42px] font-bold leading-[1.04] tracking-[-0.02em] text-white sm:text-[56px] lg:text-[64px]">
              Run your reputation
              <br />
              <span className="bg-gradient-to-r from-[#4a7dff] via-[#22d3ee] to-[#22d3ee] bg-clip-text text-transparent [-webkit-text-fill-color:transparent]">
                like a{" "}
              </span>
              {/* RotatingText — the founder's component, same usage pattern as
                  the original InteractiveHero headline (fixed-height clip,
                  spring char-stagger from the last char). */}
              <span
                className="inline-flex h-[1.2em] items-baseline overflow-hidden"
                style={{ verticalAlign: "-0.18em" }}
              >
                <RotatingText
                  texts={["system.", "machine.", "engine.", "flywheel."]}
                  mainClassName="text-[#22d3ee]"
                  staggerFrom="last"
                  initial={{ y: "-100%", opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "110%", opacity: 0 }}
                  staggerDuration={0.01}
                  transition={{ type: "spring", damping: 18, stiffness: 250 }}
                  rotationInterval={2600}
                />
              </span>
            </h1>
          </Reveal>

          {/* sub */}
          <Reveal delay={0.22}>
            <p className="mt-6 max-w-2xl text-[17px] leading-[1.6] text-[#9db0d6] sm:text-[19px]">
              Reviews, AI replies, requests, a unified inbox, AI phone, social, local SEO and autopilot &mdash; one
              premium workspace that keeps every customer moment on brand and on time.
            </p>
          </Reveal>

          {/* email capture */}
          <Reveal delay={0.3} className="w-full">
            <form onSubmit={onSubmit} className="mx-auto mt-9 flex w-full max-w-md flex-col items-center gap-3 sm:flex-row">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your work email"
                aria-label="Work email"
                className="h-12 w-full flex-grow rounded-full border border-white/[0.12] bg-[#101a33] px-5 text-[15px] text-white placeholder-[#6b7ba3] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#22d3ee]"
              />
              <motion.button
                type="submit"
                whileHover={{ y: -1, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="inline-flex h-12 w-full flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-6 text-[15px] font-bold text-white sm:w-auto"
                style={{
                  background: "linear-gradient(90deg,#4f46e5,#7c3aed)",
                  boxShadow: "0 14px 40px -8px rgba(99,102,241,0.65)",
                }}
              >
                Start free <ArrowRight size={17} />
              </motion.button>
            </form>
          </Reveal>

          <Reveal delay={0.36}>
            <p className="mt-4 text-[12.5px] text-[#6b7ba3]">Free 30-day trial &middot; No card required</p>
          </Reveal>

          {/* works with */}
          <Reveal delay={0.42}>
            <div className="mt-10 flex flex-col items-center gap-3.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#6b7ba3]">Works with</span>
              <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
                {WORKS_WITH.map((b) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={b.file}
                    src={`/assets/repulabs/landing/integrations/${b.file}.svg`}
                    alt={b.name}
                    title={b.name}
                    className={cn(
                      "h-[22px] w-auto opacity-55 transition-opacity hover:opacity-90",
                      b.invert && "invert",
                    )}
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          </Reveal>

          {/* floating product preview */}
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

export default LandingHero;
