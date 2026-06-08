import Link from "next/link";

/**
 * Legal pages shell — repulabs v3 (cool-slate + blue).
 *
 * Public, lightweight, no app chrome or auth. A clean header with the repulabs
 * brand mark, the article rendered inside a `.ds-card` on the cool `--bg`
 * canvas, and a slim footer with the legal cross-links. The article body uses
 * Tailwind's `prose` plugin re-themed to v3 tokens via the scoped
 * `legal-prose` class (see the <style> block) so the raw <h1>/<h2>/<p>/<table>
 * markup in each page reads in the v3 type scale + palette.
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
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          className="row"
          style={{
            maxWidth: 880,
            margin: "0 auto",
            height: "var(--h-tb)",
            padding: "0 24px",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            className="row"
            style={{ gap: 10, textDecoration: "none", color: "inherit" }}
          >
            <span className="sb__mark" aria-hidden style={{ width: 30, height: 30, fontSize: 15 }}>
              R
            </span>
            <span className="sb__brandname" style={{ fontSize: 16 }}>
              repu<span>labs</span>
            </span>
          </Link>
          <nav
            className="row"
            style={{ gap: 16, fontSize: 12.5, color: "var(--rl-muted)", flexWrap: "wrap" }}
          >
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{ color: "inherit", textDecoration: "none" }}
                className="hover:!text-[var(--ink)]"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px 64px" }}>
        <article className="ds-card">
          <div className="ds-card__body legal-prose" style={{ padding: "32px 36px" }}>
            {children}
          </div>
        </article>

        <footer
          className="row"
          style={{
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 24,
            fontSize: 12,
            color: "var(--rl-muted)",
          }}
        >
          <span>© {new Date().getFullYear()} Repulabs. All rights reserved.</span>
          <Link
            href="/"
            style={{ color: "var(--pri)", textDecoration: "none", fontWeight: 500 }}
          >
            Back to repulabs.com →
          </Link>
        </footer>
      </main>

      {/* Scoped v3 theming for the raw prose markup in each legal page. Kept
          inline so the public legal route stays self-contained. */}
      <style>{`
        .legal-prose {
          font-family: var(--f-ui);
          font-size: 14px;
          line-height: 1.7;
          color: var(--ink-2);
          letter-spacing: -0.005em;
        }
        .legal-prose h1 {
          font-size: 30px;
          font-weight: 600;
          letter-spacing: -0.03em;
          color: var(--ink);
          line-height: 1.15;
          margin: 0 0 8px;
        }
        .legal-prose h2 {
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.015em;
          color: var(--ink);
          margin: 28px 0 10px;
        }
        .legal-prose p { margin: 0 0 14px; }
        .legal-prose ul {
          margin: 0 0 14px;
          padding-left: 20px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .legal-prose li { padding-left: 2px; }
        .legal-prose strong { color: var(--ink); font-weight: 600; }
        .legal-prose a {
          color: var(--pri);
          text-decoration: none;
          font-weight: 500;
        }
        .legal-prose a:hover { text-decoration: underline; }
        .legal-prose code {
          font-family: var(--f-mono);
          font-size: 12.5px;
          background: var(--surface-3);
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 1px 6px;
          color: var(--ink-2);
        }
        .legal-prose .text-muted-foreground,
        .legal-prose .text-sm.text-muted-foreground {
          color: var(--rl-muted) !important;
          font-size: 12.5px;
        }
        .legal-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 0 0 18px;
          font-size: 13px;
        }
        .legal-prose thead th {
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--rl-muted);
          font-weight: 500;
          padding: 10px 12px;
          background: var(--surface-2);
          border-bottom: 1px solid var(--line);
        }
        .legal-prose tbody td {
          padding: 12px;
          border-bottom: 1px solid var(--line);
          vertical-align: top;
          color: var(--ink-2);
        }
        .legal-prose tbody tr:last-child td { border-bottom: 0; }
      `}</style>
    </div>
  );
}
