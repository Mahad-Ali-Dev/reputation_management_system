"use client";

/**
 * Landing hero — repulabs marketing home.
 *
 * Recreates the delivered mockup ("reputation system.png") as a live, animated,
 * fully-responsive section: a sticky blur nav + a two-column hero (left promise
 * copy, right floating product-preview cluster).
 *
 * Animation primitives are shared from `@/components/landing/anim`:
 *   - DotGrid       interactive dot-grid behind the hero
 *   - Reveal        staggered scroll/entrance fade-up
 *   - Float         idle bob on the floating cards + badge
 *   - RotatingText  the rotating final word of the headline
 *   - ShinyText     sheen sweep on the primary CTA label
 *
 * Light "premium SaaS" brand: white → pale-blue bg, primary #2563eb, blue→teal
 * gradient accents, Inter (app default), weights ≤700.
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

/** The repulabs "R" tile mark from the mockup — black rounded square, white R. */
function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-[11px] bg-[#0b1220] text-white shadow-[0_6px_16px_-6px_rgba(11,18,32,0.5)]"
      style={{ width: size, height: size }}
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

/** Blue upward trend line with soft area fill + halo endpoint — the overview chart. */
function TrendChart() {
  const line = "M2 58 L20 52 L38 55 L56 44 L74 47 L92 34 L110 38 L128 24 L146 12";
  return (
    <svg viewBox="0 0 148 68" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="hero-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2563eb" stopOpacity="0.18" />
          <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[16, 34, 52].map((y) => (
        <line key={y} x1="0" y1={y} x2="148" y2={y} stroke="#E7ECF6" strokeWidth="1" />
      ))}
      <path d={`${line} L146 68 L2 68 Z`} fill="url(#hero-trend-fill)" />
      <path d={line} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="146" cy="12" r="6" fill="#2563eb" opacity="0.16" />
      <circle cx="146" cy="12" r="3.2" fill="#2563eb" />
    </svg>
  );
}

/** Warm little storefront illustration for the "Your business" card. */
function Storefront() {
  return (
    <svg viewBox="0 0 200 74" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="200" height="74" fill="#efe7dc" />
      <rect y="40" width="200" height="34" fill="#d9cbb6" />
      <rect x="18" y="46" width="46" height="28" rx="2" fill="#a98f6f" />
      <rect x="82" y="52" width="34" height="22" rx="2" fill="#7c6a52" />
      <rect x="134" y="46" width="46" height="28" rx="2" fill="#a98f6f" />
      <g fill="#c65a4e">
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={`aw-${i}`} x={12 + i * 18} y="30" width="9" height="12" />
        ))}
      </g>
      <g fill="#e0d2bd">
        {Array.from({ length: 10 }).map((_, i) => (
          <rect key={`aw2-${i}`} x={21 + i * 18} y="30" width="9" height="12" />
        ))}
      </g>
      <rect x="0" y="28" width="200" height="4" fill="#8a5049" />
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
      className="group relative flex items-center py-1 text-[15px] font-semibold text-[#0b1220] transition-colors duration-200 hover:text-[#2563eb]"
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
        className="absolute -bottom-0.5 left-0 right-0 h-px origin-center scale-x-0 rounded-full bg-gradient-to-r from-[#2563eb] to-[#22d3ee] transition-transform duration-300 ease-out group-hover:scale-x-100"
      />
    </a>
  );
}

/**
 * Hover dropdown card — same AnimatePresence pop as the kit's DropdownMenu
 * (y:10 / scale:0.95 → rest), restyled to the light brand. The 8px gap is
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
          <div className="rounded-xl border border-[#e7ecf6] bg-white/95 p-2 shadow-[0_24px_50px_-18px_rgba(49,92,170,0.35)] backdrop-blur-md">
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
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13.5px] font-medium text-[#0b1220] transition-colors duration-150 hover:bg-[#f2f6ff] hover:text-[#2563eb]"
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
        backgroundColor: scrolled ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.6)",
        borderBottomColor: scrolled ? "rgba(221,229,242,1)" : "rgba(221,229,242,0)",
        boxShadow: scrolled ? "0 8px 30px -18px rgba(49,92,170,0.35)" : "0 0 0 rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full border-b backdrop-blur-md"
    >
      <nav className="mx-auto flex h-[76px] max-w-[1280px] items-center justify-between px-6 lg:px-10">
        {/* logo */}
        <a href="#top" className="flex flex-shrink-0 items-center gap-3">
          <BrandMark size={40} />
          <span className="text-[22px] font-bold tracking-[-0.02em] text-[#0b1220]">
            repu<span className="text-[#2563eb]">labs</span>
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
          <a href="/login" className="hidden text-[15px] font-semibold text-[#0b1220] hover:text-[#2563eb] sm:inline">
            Log in
          </a>
          <motion.a
            href="/signup"
            whileHover={{ y: -1, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 18 }}
            className="inline-flex items-center gap-1.5 rounded-2xl bg-gradient-to-b from-[#2f6bff] to-[#1e40af] px-4 py-2.5 text-[15px] font-bold text-white shadow-[0_12px_26px_-10px_rgba(35,82,255,0.7)] sm:px-5"
          >
            Start free <ArrowRight size={17} />
          </motion.a>
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-xl text-[#0b1220] hover:bg-[#eef3ff] lg:hidden"
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
            className="border-t border-[#e6ecf7] bg-white/95 px-6 py-4 backdrop-blur-md lg:hidden"
          >
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-2.5 text-[15px] font-semibold text-[#0b1220] hover:bg-[#eef3ff]"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2.5 text-[15px] font-semibold text-[#2563eb] hover:bg-[#eef3ff]"
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
  return <h3 className="text-[15px] font-bold text-[#0b1220]">{children}</h3>;
}

function ProductPreview() {
  return (
    /* text-left: the preview sits inside the hero's centered column — dashboard
       content must not inherit the centered text alignment */
    <div className="relative mx-auto w-full max-w-[560px] text-left lg:mx-0 lg:max-w-none">
      {/* main dashboard panel */}
      <Reveal delay={0.15} y={28}>
        <div className="rounded-[26px] border border-[#e2ebf9] bg-gradient-to-b from-white to-[#f4f8ff] p-4 shadow-[0_34px_80px_-30px_rgba(49,92,170,0.4)] sm:p-5">
          {/* reputation overview */}
          <div className="rounded-2xl border border-[#e9eff9] bg-white p-4 shadow-[0_10px_30px_-18px_rgba(49,92,170,0.25)] sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <CardHeading>Reputation overview</CardHeading>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#dce4f1] px-2.5 py-1.5 text-[12px] font-medium text-[#5b6473]">
                <Calendar size={14} className="text-[#8a93a6]" /> Last 30 days
                <ChevronDown size={14} className="text-[#8a93a6]" />
              </span>
            </div>

            <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-4">
              {/* average rating */}
              <div>
                <p className="text-[12px] font-medium text-[#8a93a6]">Average rating</p>
                <p className="mt-1 text-[30px] font-bold leading-none text-[#0b1220]">4.8</p>
                <Stars className="mt-2" size={14} />
                <p className="mt-2 text-[11px] text-[#8a93a6]">Based on 324 reviews</p>
              </div>
              {/* new reviews */}
              <div>
                <p className="text-[12px] font-medium text-[#8a93a6]">New reviews</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-[30px] font-bold leading-none text-[#0b1220]">+47</p>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#e7f8f0] px-1.5 py-0.5 text-[11px] font-semibold text-[#0f9d63]">
                    <TrendingUp size={11} /> 18%
                  </span>
                </div>
                <p className="mt-[18px] text-[11px] text-[#8a93a6]">vs previous 30 days</p>
              </div>
              {/* chart */}
              <div className="h-[72px] self-center">
                <TrendChart />
              </div>
            </div>
          </div>

          {/* recent reviews */}
          <div className="mt-4 rounded-2xl border border-[#e9eff9] bg-white p-4 shadow-[0_10px_30px_-18px_rgba(49,92,170,0.25)] sm:p-5">
            <CardHeading>Recent reviews</CardHeading>
            <div className="mt-3 space-y-3">
              {RECENT_REVIEWS.map((r) => (
                <div key={r.time} className="flex items-center gap-3">
                  <r.Mark size={22} />
                  <Stars size={13} />
                  <p className="hidden flex-1 truncate text-[12px] text-[#5b6473] sm:block">{r.text}</p>
                  <span className="ml-auto flex-shrink-0 text-[11px] text-[#a2abbc] sm:ml-0">{r.time}</span>
                </div>
              ))}
            </div>
            <a
              href="#reviews"
              className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563eb] hover:gap-1.5"
            >
              View all reviews <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </Reveal>

      {/* floating: +47 badge — sits above the panel's top-left corner */}
      <Reveal delay={0.5} className="absolute -left-8 -top-12 z-30 hidden lg:block">
        <Float amount={9} duration={5.5}>
          <div className="flex items-center gap-3 rounded-2xl border border-[#eef2fa] bg-white px-4 py-3 shadow-[0_22px_50px_-18px_rgba(37,99,235,0.4)]">
            <span className="grid h-[46px] w-[46px] place-items-center rounded-full bg-gradient-to-br from-[#2f6bff] to-[#1e40af] text-white">
              <Star size={22} className="fill-white text-white" strokeWidth={0} />
            </span>
            <div>
              <p className="text-[22px] font-bold leading-none text-[#0b1220]">+47</p>
              <p className="mt-1 text-[12px] text-[#8a93a6]">reviews this month</p>
            </div>
          </div>
        </Float>
      </Reveal>

      {/* floating: your business card — overlaps the panel's right edge */}
      <Reveal delay={0.4} className="absolute -right-8 top-[150px] z-30 hidden w-[228px] lg:block">
        <Float amount={12} duration={6.5} delay={0.4}>
          <div className="rounded-[20px] border border-[#e9eff9] bg-white p-4 shadow-[0_28px_60px_-22px_rgba(49,92,170,0.45)]">
            <CardHeading>Your business</CardHeading>
            <div className="mt-2.5 h-[54px] w-full overflow-hidden rounded-md">
              <Storefront />
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <p className="text-[14px] font-bold text-[#0b1220]">Downtown Location</p>
              <BadgeCheck size={15} className="fill-[#2563eb] text-white" />
            </div>
            <p className="text-[11px] text-[#8a93a6]">123 Main St, Austin, TX</p>

            <div className="mt-2.5 flex items-center gap-2">
              <p className="text-[24px] font-bold leading-none text-[#0b1220]">4.8</p>
              <div>
                <Stars size={12} />
                <p className="text-[10px] text-[#8a93a6]">324 reviews</p>
              </div>
            </div>

            <div className="mt-2.5 space-y-1.5 border-t border-[#eef2fa] pt-2.5">
              {BUSINESS_PLATFORMS.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <p.Mark size={16} />
                  <span className="text-[12px] font-medium text-[#5b6473]">{p.name}</span>
                  <span className="ml-auto text-[12px] font-bold text-[#0b1220]">{p.rating}</span>
                </div>
              ))}
            </div>
            <a
              href="#listings"
              className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#2563eb] hover:gap-1.5"
            >
              Manage listings <ArrowRight size={13} />
            </a>
          </div>
        </Float>
      </Reveal>

      {/* feature pill strip */}
      <Reveal delay={0.55} y={20}>
        <Float amount={5} duration={7}>
          <div className="mt-4 flex items-center justify-between gap-1 overflow-x-auto rounded-2xl border border-[#e9eff9] bg-white px-3 py-3 shadow-[0_16px_40px_-24px_rgba(49,92,170,0.35)] sm:gap-2 sm:px-4">
            {FEATURES.map((f, i) => (
              <div key={f.label} className="flex items-center gap-2 sm:gap-3">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <f.Icon className="h-4 w-4 text-[#2563eb]" />
                  <span className="text-[12px] font-semibold text-[#0b1220] sm:text-[13px]">{f.label}</span>
                </span>
                {i < FEATURES.length - 1 && <span className="h-[26px] w-px flex-shrink-0 bg-[#d8e2f2]" />}
              </div>
            ))}
          </div>
        </Float>
      </Reveal>
    </div>
  );
}

/* ─────────────────────────────── hero ─────────────────────────────── */

/* "Works with" strip — real brand SVGs under the email capture, like the
   original InteractiveHero's works-with row. */
const WORKS_WITH = [
  { name: "Google", file: "google" },
  { name: "Meta", file: "meta" },
  { name: "Instagram", file: "instagram" },
  { name: "WhatsApp", file: "whatsapp" },
  { name: "Square", file: "square" },
  { name: "Slack", file: "slack" },
] as const;

export function LandingHero() {
  const [email, setEmail] = useState("");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    window.location.href = "/signup?email=" + encodeURIComponent(email);
  };

  return (
    <section id="top" className="relative isolate overflow-x-clip bg-white">
      {/* background wash + dot grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_680px_at_50%_-8%,#e6effe_0%,rgba(240,245,255,0.55)_42%,transparent_72%)]"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-transparent to-[#f0f5ff]" />

      <TopNav />

      <div className="relative">
        {/* interactive dot canvas + a soft bottom fade so the hero settles into the page */}
        <DotGrid className="opacity-70" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, transparent 60%, rgba(240,245,255,0.9) 96%)",
          }}
        />

        <div className="relative mx-auto flex max-w-[1200px] flex-col items-center px-6 pb-20 pt-14 text-center sm:pt-16 lg:pb-24 lg:pt-20">
          {/* announcement pill */}
          <Reveal delay={0.05}>
            <ShinyText
              text="✦ New: AI Phone receptionist is live"
              className="cursor-default rounded-full border border-[#D9DDF7] bg-white/75 px-4 py-1 text-[12px] font-semibold text-[#2563eb] backdrop-blur transition-colors hover:border-[#2563eb]/40 sm:text-[13px]"
            />
          </Reveal>

          {/* headline */}
          <Reveal delay={0.12}>
            <h1 className="mt-6 max-w-4xl text-[42px] font-bold leading-[1.04] tracking-[-0.02em] text-[#0b1220] sm:text-[56px] lg:text-[64px]">
              Run your reputation
              <br />
              <span className="bg-gradient-to-r from-[#2563eb] to-[#2294f2] bg-clip-text text-transparent [-webkit-text-fill-color:transparent]">
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
            <p className="mt-6 max-w-2xl text-[17px] leading-[1.6] text-[#5b6473] sm:text-[19px]">
              Reviews, AI replies, requests, a unified inbox, AI phone, social, local SEO and autopilot &mdash; one
              premium workspace that keeps every customer moment on brand and on time.
            </p>
          </Reveal>

          {/* email capture — like the original InteractiveHero form */}
          <Reveal delay={0.3} className="w-full">
            <form
              onSubmit={onSubmit}
              className="mx-auto mt-9 flex w-full max-w-md flex-col items-center gap-3 sm:flex-row"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your work email"
                aria-label="Work email"
                className="h-12 w-full flex-grow rounded-full border border-[#dce4f2] bg-white px-5 text-[15px] text-[#0b1220] placeholder-[#8a93a6] shadow-[0_10px_26px_-18px_rgba(49,92,170,0.4)] outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#2563eb]"
              />
              <motion.button
                type="submit"
                whileHover={{ y: -1, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                className="inline-flex h-12 w-full flex-shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-b from-[#2f6bff] to-[#1e40af] px-6 text-[15px] font-bold text-white shadow-[0_14px_34px_-10px_rgba(35,82,255,0.6)] sm:w-auto"
              >
                Start free <ArrowRight size={17} />
              </motion.button>
            </form>
          </Reveal>

          <Reveal delay={0.36}>
            <p className="mt-4 text-[12.5px] text-[#8a93a6]">Free 30-day trial &middot; No card required</p>
          </Reveal>

          {/* works with */}
          <Reveal delay={0.42}>
            <div className="mt-10 flex flex-col items-center gap-3.5">
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a93a6]">Works with</span>
              <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
                {WORKS_WITH.map((b) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={b.file}
                    src={`/assets/repulabs/landing/integrations/${b.file}.svg`}
                    alt={b.name}
                    title={b.name}
                    className="h-[22px] w-auto opacity-60 transition-opacity hover:opacity-100"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          </Reveal>

          {/* floating product preview — centered under the form like the
              original's screenshot block */}
          <div className="mt-14 w-full max-w-[920px]">
            <ProductPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

export default LandingHero;
