import { MarketingFooter } from "@/components/landing/marketing-shell";
import { SiteNav } from "@/components/landing/site-nav";
import Link from "next/link";

/**
 * Legal pages shell — now shares the REAL marketing site chrome instead of a
 * bespoke mini-header/footer: <SiteNav> is the same sticky animated nav the
 * homepage uses (components/landing/site-nav.tsx, extracted from hero.tsx),
 * and <MarketingFooter> is the same rich footer every other marketing page
 * gets. Previously this shell drew its own plain header (app-shell "R" mark +
 * a text-link row) that looked like a leftover dashboard fragment, not part
 * of the site.
 *
 * Article content in each page.tsx (privacy/terms/cookies/dpa/security/
 * subprocessors) is untouched — plain semantic <h1>/<h2>/<p>/<ul>/<table>.
 * The `.legal-prose` styling below is what changed: larger, more generously
 * spaced type and a softer rounded-2xl card, matching the marketing site's
 * look instead of a compact dashboard document.
 */

const LINKS = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/dpa", label: "DPA" },
  { href: "/legal/security", label: "Security" },
  { href: "/legal/subprocessors", label: "Sub-processors" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #F6F7F4)" }}>
      <SiteNav />

      <div
        style={{
          background:
            "radial-gradient(120% 70% at 50% 0%, rgba(37,99,235,0.06) 0%, transparent 60%)",
        }}
      >
        <main className="mx-auto w-full max-w-[880px] px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
          {/* legal cross-links — same pill language as the marketing site's
              kicker chips, not a plain dashboard nav row */}
          <nav aria-label="Legal pages" className="mb-10 flex flex-wrap justify-center gap-2">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="legal-tab rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  borderColor: "var(--line, #eceeea)",
                  background: "var(--surface, #fff)",
                  color: "var(--rl-muted, #61697a)",
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <article
            className="legal-prose rounded-2xl border bg-white"
            style={{
              borderColor: "var(--line, #eceeea)",
              boxShadow: "0 24px 60px -32px rgba(26,43,95,0.28)",
              padding: "44px 48px",
            }}
          >
            {children}
          </article>

          <p className="mt-8 text-center text-[13px]" style={{ color: "var(--rl-muted, #61697a)" }}>
            Questions about this policy?{" "}
            <a href="mailto:info@repulabs.com" style={{ color: "var(--pri, #2563EB)", fontWeight: 500 }}>
              info@repulabs.com
            </a>
          </p>
        </main>
      </div>

      <MarketingFooter />

      {/* Scoped marketing-site type scale for the raw prose markup in each
          legal page — bigger and more generously spaced than a dashboard
          document, matching the rest of the site's typographic voice. */}
      <style>{`
        .legal-tab:hover {
          color: var(--ink, #0B0D0E);
          border-color: #c7d2fe;
        }
        .legal-prose {
          font-family: var(--f-ui);
          font-size: 15.5px;
          line-height: 1.75;
          color: var(--ink-2, #1e2225);
          letter-spacing: -0.005em;
        }
        .legal-prose h1 {
          font-size: 40px;
          font-weight: 700;
          letter-spacing: -0.03em;
          color: var(--ink, #0B0D0E);
          line-height: 1.08;
          margin: 0 0 10px;
        }
        .legal-prose h2 {
          font-size: 19px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--ink, #0B0D0E);
          margin: 36px 0 12px;
        }
        .legal-prose p { margin: 0 0 16px; }
        .legal-prose ul {
          margin: 0 0 16px;
          padding-left: 22px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .legal-prose li { padding-left: 2px; }
        .legal-prose strong { color: var(--ink, #0B0D0E); font-weight: 600; }
        .legal-prose a {
          color: var(--pri, #2563EB);
          text-decoration: none;
          font-weight: 500;
        }
        .legal-prose a:hover { text-decoration: underline; }
        .legal-prose code {
          font-family: var(--f-mono);
          font-size: 13px;
          background: var(--surface-2, #fafbf8);
          border: 1px solid var(--line, #eceeea);
          border-radius: 6px;
          padding: 1px 6px;
          color: var(--ink-2, #1e2225);
        }
        .legal-prose .text-muted-foreground,
        .legal-prose .text-sm.text-muted-foreground {
          color: var(--rl-muted, #61697a) !important;
          font-size: 13px;
        }
        .legal-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 0 0 20px;
          font-size: 14px;
        }
        .legal-prose thead th {
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--rl-muted, #61697a);
          font-weight: 600;
          padding: 11px 12px;
          background: var(--surface-2, #fafbf8);
          border-bottom: 1px solid var(--line, #eceeea);
        }
        .legal-prose tbody td {
          padding: 13px 12px;
          border-bottom: 1px solid var(--line, #eceeea);
          vertical-align: top;
          color: var(--ink-2, #1e2225);
        }
        .legal-prose tbody tr:last-child td { border-bottom: 0; }
      `}</style>
    </div>
  );
}
