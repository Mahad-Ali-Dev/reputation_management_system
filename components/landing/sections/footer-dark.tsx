import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";

/**
 * LandingFooterDark — the dark-canvas variant of `MarketingFooter`
 * (components/landing/marketing-shell.tsx) for the ONE dark cinematic landing.
 *
 * Same structure — logo + blurb, status/contact chips, four link columns and a
 * copyright row — re-tinted for the #070b16 canvas: bg #05080f, white/8 top
 * border, #6b7ba3 column headings, #cdd8f2 links that brighten to white on
 * hover, and a glowing green status dot.
 *
 * Do NOT fold this back into marketing-shell.tsx — the stub pages (About,
 * Contact, Docs, …) still use the light `MarketingFooter`.
 */

const HEAD = "#6b7ba3";
const LINK = "#cdd8f2";
const BODY = "#9db0d6";
const LINE = "rgba(255,255,255,0.08)";
const CHIP_LINE = "rgba(255,255,255,0.10)";
const CHIP_BG = "rgba(255,255,255,0.05)";
const OK = "#10b981";

export function LandingFooterDark() {
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
    <footer className="border-t" style={{ borderColor: LINE, background: "#05080f" }}>
      <div className="mx-auto max-w-[1280px] px-6 py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_3fr]">
          <div>
            <Link
              href="/"
              aria-label="Repulabs home"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              {/* Logo wordmark reads var(--ink)/var(--pri); re-point them at dark-canvas tones. */}
              <span style={{ "--ink": "#ffffff", "--pri": "#6d8bff" } as React.CSSProperties}>
                <Logo size={48} />
              </span>
            </Link>
            <p
              className="mt-5 max-w-[320px]"
              style={{ fontSize: 14, color: BODY, lineHeight: 1.6 }}
            >
              The reputation operating system for ambitious small businesses. Built in Melbourne;
              loved everywhere review stars matter.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11.5px]"
                style={{
                  borderColor: CHIP_LINE,
                  background: CHIP_BG,
                  color: LINK,
                }}
              >
                <span className="relative grid h-1.5 w-1.5 place-items-center" aria-hidden>
                  <span className="lp-ping" style={{ background: OK }} />
                  <span
                    className="relative h-1.5 w-1.5 rounded-full"
                    style={{ background: OK, boxShadow: "0 0 8px 2px rgba(16,185,129,0.65)" }}
                  />
                </span>
                <Link href="/status" style={{ color: "inherit", textDecoration: "none" }}>
                  All systems operational
                </Link>
              </div>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] transition-colors hover:bg-white/10 hover:text-white"
                style={{ borderColor: CHIP_LINE, color: LINK, background: CHIP_BG }}
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
                    color: HEAD,
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
                        className="text-[13px] text-[#cdd8f2] transition-colors hover:text-white hover:underline"
                        style={{ textUnderlineOffset: 3 }}
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
          style={{ borderColor: LINE, fontSize: 11.5, color: HEAD }}
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

export default LandingFooterDark;
