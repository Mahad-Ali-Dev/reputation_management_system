"use client";

/**
 * SiteNav — the real repulabs marketing nav (sticky blur header, gradient
 * underline links, "Product" hover dropdown, mobile menu).
 *
 * Extracted from components/landing/sections/hero.tsx's local `TopNav` so
 * secondary pages (legal, docs, etc.) can use the SAME nav the homepage
 * does, instead of a separate hand-rolled header. `hero.tsx` now imports
 * this instead of defining its own copy.
 *
 * NAV_LINKS/PRODUCT_MENU are `#anchor` hrefs into the homepage's own
 * sections — correct as-is when rendered ON the homepage, but a page-relative
 * `#platform` from e.g. /legal/privacy would just be a no-op (there's no
 * matching id on that page). `homeHref` prefixes anchors with `/` off the
 * homepage so they route back to "/#platform" etc.
 */

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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

/**
 * Desktop nav link — a relative link whose 1px gradient underline
 * (blue → cyan) scales from 0 to full width on hover, plus the rotating
 * chevron for dropdown triggers.
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
      {/* gradient underline — scaleX 0 → 1 from center on hover */}
      <span
        aria-hidden
        className="absolute -bottom-0.5 left-0 right-0 h-px origin-center scale-x-0 rounded-full bg-gradient-to-r from-[#2563eb] to-[#22d3ee] transition-transform duration-300 ease-out group-hover:scale-x-100"
      />
    </a>
  );
}

/** Hover dropdown card — pop-in from the trigger, restyled to the light brand. */
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

export function SiteNav() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const resolveHref = (href: string) => (onHome ? href : `/${href}`);

  const [scrolled, setScrolled] = useState(!onHome);
  const [open, setOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    if (!onHome) return;
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onHome]);

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
        <a href={onHome ? "#top" : "/"} className="flex flex-shrink-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/favicon.png"
            alt="repulabs"
            width={40}
            height={40}
            className="rounded-[9px]"
            style={{ height: 40, width: 40, objectFit: "cover" }}
          />
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
                <NavLink href={resolveHref(l.href)} hasDropdown isOpen={openDropdown === l.label}>
                  {l.label}
                </NavLink>
                <DropdownMenu isOpen={openDropdown === l.label}>
                  {PRODUCT_MENU.map((item) => (
                    <DropdownItem
                      key={item.label}
                      href={resolveHref(item.href)}
                      onClick={() => setOpenDropdown(null)}
                    >
                      {item.label}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </div>
            ) : (
              <NavLink key={l.label} href={resolveHref(l.href)}>
                {l.label}
              </NavLink>
            ),
          )}
        </div>

        {/* right actions */}
        <div className="flex flex-shrink-0 items-center gap-3 sm:gap-5">
          <a
            href="/login"
            className="hidden text-[15px] font-semibold text-[#0b1220] hover:text-[#2563eb] sm:inline"
          >
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
                  href={resolveHref(l.href)}
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
