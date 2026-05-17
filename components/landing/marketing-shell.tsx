import { Logo } from "@/components/shell/logo";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

/**
 * Marketing-shell wrapper — top nav + footer wrapping any marketing/legal
 * stub page. Extracted from app/page.tsx so every secondary page (About,
 * Contact, Docs, Changelog, Status, etc.) gets the same nav and footer
 * without duplicating ~150 lines per file.
 *
 * Tokens mirror app/globals.css. Kept inline so this stays self-contained.
 */

const C = {
  bg: "var(--bg, #F6F7F4)",
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbf8)",
  ink: "var(--ink, #0B0D0E)",
  ink2: "var(--ink-2, #1e2225)",
  mute: "var(--rl-muted, #61697a)",
  line: "var(--line, #eceeea)",
  pri: "var(--pri, #2563EB)",
  pri50: "var(--pri-50, #ECFDF7)",
  pri100: "var(--pri-100, #cffaf0)",
  pri700: "var(--pri-700, #0f766e)",
  ok: "var(--ok, #10b981)",
} as const;

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        background: C.bg,
        color: C.ink,
        fontFamily: "var(--f-ui)",
        letterSpacing: "-0.005em",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <MarketingTopNav />
      <div style={{ flex: 1 }}>{children}</div>
      <MarketingFooter />
    </main>
  );
}

export function MarketingTopNav() {
  const links = [
    { href: "/#features", label: "Product" },
    { href: "/#pricing", label: "Pricing" },
    { href: "/#integrations", label: "Integrations" },
    { href: "/#testimonials", label: "Customers" },
    { href: "/#faq", label: "FAQ" },
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

export function MarketingFooter() {
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

/**
 * Standard hero block for stub pages — kicker pill, title, description, optional
 * actions. Same visual language as the landing page hero, scaled down to fit
 * informational pages.
 */
export function StubHero({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: `radial-gradient(at 50% 0%, ${C.pri50} 0%, transparent 60%), ${C.bg}`,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      <div className="mx-auto max-w-[920px] px-6 pb-16 pt-20 text-center sm:pt-28">
        {kicker && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium"
            style={{
              borderColor: C.pri100,
              background: "rgba(236, 253, 247, .7)",
              color: C.pri700,
              fontFamily: "var(--f-mono)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {kicker}
          </span>
        )}
        <h1
          className="mt-5"
          style={{
            fontSize: "clamp(32px, 5.5vw, 56px)",
            lineHeight: 1.04,
            letterSpacing: "-0.03em",
            fontWeight: 600,
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            className="mx-auto mt-5"
            style={{
              fontSize: 16,
              lineHeight: 1.6,
              color: C.mute,
              maxWidth: 620,
            }}
          >
            {description}
          </p>
        )}
        {actions && (
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">{actions}</div>
        )}
      </div>
    </section>
  );
}
