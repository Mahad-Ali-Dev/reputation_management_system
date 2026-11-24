"use client";

/**
 * LegalShell: the glassmorphism frame for the /legal documents (privacy,
 * terms, security, DPA), matching the new landing page.
 *
 *   - Landing nav (floating pill on scroll), links back to the homepage.
 *   - Rounded brand-blue hero: eyebrow, title, one-line summary, dates and a
 *     segmented switcher between the four documents.
 *   - Two columns on desktop: a sticky "On this page" table of contents built
 *     from the document's <h2>s (active section follows the scroll) plus a
 *     contact card, and the document itself in a raised glass card.
 *   - "Related documents" cards, then the marketing footer.
 *
 * Each page.tsx keeps its plain semantic <h1>/<h2>/<p>/<ul> markup. The shell
 * hides the page's own <h1> and date line (the hero shows them), and turns the
 * "1. Title" numbering of each <h2> into a number badge.
 */

import { MarketingFooter } from "@/components/landing/marketing-shell";
import { LandingNav } from "@/components/landing/repulabs-landing";
import { ArrowRight, FileSignature, FileText, Lock, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";

export type LegalSlug = "privacy" | "terms" | "security" | "dpa";

type Doc = {
  slug: LegalSlug;
  tab: string;
  title: string;
  summary: string;
  meta: Array<[string, string]>;
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};

export const LEGAL_DOCS: Doc[] = [
  {
    slug: "privacy",
    tab: "Privacy",
    title: "Privacy Policy",
    summary: "What we collect, why we collect it, and how you stay in control of it.",
    meta: [
      ["Effective", "12 May 2026"],
      ["Last updated", "12 May 2026"],
    ],
    Icon: Lock,
  },
  {
    slug: "terms",
    tab: "Terms",
    title: "Terms of Service",
    summary: "The rules for using Repulabs, written to be read, not skimmed past.",
    meta: [
      ["Effective", "12 May 2026"],
      ["Last updated", "12 May 2026"],
    ],
    Icon: FileText,
  },
  {
    slug: "security",
    tab: "Security",
    title: "Security overview",
    summary: "How we protect your data and your customers' data, the short and honest version.",
    meta: [
      ["Last reviewed", "17 May 2026"],
      ["Owner", "info@repulabs.com"],
    ],
    Icon: ShieldCheck,
  },
  {
    slug: "dpa",
    tab: "DPA",
    title: "Data Processing Addendum",
    summary: "How we process personal data on your behalf under GDPR, UK GDPR and Swiss law.",
    meta: [
      ["Effective", "17 May 2026"],
      ["Last updated", "17 May 2026"],
    ],
    Icon: FileSignature,
  },
];

const C = {
  ink: "#0b1220",
  mute: "#5b6473",
  mute2: "#8a93a6",
  pri: "#2563eb",
} as const;

type TocItem = { id: string; num: string; label: string };

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * `slug` is optional: app/legal/layout.tsx wraps every document and doesn't
 * know which one is rendering, so by default it's read from the URL.
 */
export function LegalShell({
  slug: slugProp,
  children,
}: { slug?: LegalSlug; children: ReactNode }) {
  const pathname = usePathname();
  const fromPath = pathname?.split("/").filter(Boolean).at(-1);
  const doc = LEGAL_DOCS.find((d) => d.slug === (slugProp ?? fromPath)) ?? (LEGAL_DOCS[0] as Doc);
  const slug = doc.slug;
  const articleRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [active, setActive] = useState<string | null>(null);

  // Build the table of contents from the document's <h2>s, give each an id,
  // and move the leading "1." into a badge (data-num, drawn by CSS). Re-runs
  // when the switcher swaps documents without a full page load.
  // biome-ignore lint/correctness/useExhaustiveDependencies: slug marks a new document in the DOM
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const items: TocItem[] = [];
    root.querySelectorAll("h2").forEach((h, i) => {
      const raw = (h.dataset.label ?? h.textContent ?? "").trim();
      const m = /^(\d+)\.\s*(.*)$/.exec(raw);
      const num = String(m?.[1] ?? i + 1).padStart(2, "0");
      const label = m?.[2] ?? raw;
      const id = h.id || slugify(label) || `section-${i + 1}`;
      h.id = id;
      h.dataset.num = num;
      h.dataset.label = raw;
      if (m && h.childNodes.length === 1 && h.firstChild?.nodeType === Node.TEXT_NODE) {
        h.firstChild.textContent = label;
      }
      items.push({ id, num, label });
    });
    setToc(items);
  }, [slug]);

  // Highlight the section currently in view.
  useEffect(() => {
    if (toc.length === 0) return;
    const heads = toc
      .map((t) => document.getElementById(t.id))
      .filter((h): h is HTMLElement => !!h);
    const onScroll = () => {
      let current = heads[0]?.id ?? null;
      for (const h of heads) if (h.getBoundingClientRect().top < 140) current = h.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [toc]);

  const related = LEGAL_DOCS.filter((d) => d.slug !== slug);

  return (
    <main
      className="glass-theme glass-canvas min-h-screen overflow-x-clip"
      data-glass-mode="light"
      style={{ color: C.ink, fontFamily: "var(--f-ui)" }}
    >
      <LandingNav linkBase="/" />

      {/* ── hero ── */}
      <section className="px-2.5 pt-2.5 sm:px-4">
        <div
          className="relative mx-auto overflow-hidden rounded-[30px] sm:rounded-[40px]"
          style={{
            maxWidth: 1400,
            background: "linear-gradient(168deg,#3b82f6 0%,#2563eb 46%,#1e3a8a 100%)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(900px 440px at 50% -8%, rgba(255,255,255,.34), transparent 60%)",
            }}
          />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center px-5 pb-12 pt-14 text-center sm:pb-14 sm:pt-[72px]">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11.5px] font-semibold uppercase text-white"
              style={{
                borderColor: "rgba(255,255,255,.28)",
                background: "rgba(255,255,255,.14)",
                letterSpacing: ".12em",
                fontFamily: "var(--f-mono)",
              }}
            >
              <doc.Icon size={13} strokeWidth={2.2} />
              Legal
            </span>
            <h1
              className="mt-6 text-white"
              style={{
                fontSize: "clamp(36px, 6vw, 60px)",
                lineHeight: 1.04,
                letterSpacing: "-0.035em",
                fontWeight: 700,
              }}
            >
              {doc.title}
            </h1>
            <p
              className="mt-4 max-w-xl text-[17px] leading-relaxed"
              style={{ color: "rgba(255,255,255,.82)" }}
            >
              {doc.summary}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {doc.meta.map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-full px-3 py-1 text-[12.5px]"
                  style={{ background: "rgba(255,255,255,.12)", color: "rgba(255,255,255,.78)" }}
                >
                  {k} <span className="font-semibold text-white">{v}</span>
                </span>
              ))}
            </div>

            {/* document switcher */}
            <nav
              aria-label="Legal documents"
              className="mt-9 inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1"
              style={{
                background: "rgba(10,20,60,.28)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,.14)",
              }}
            >
              {LEGAL_DOCS.map((d) => {
                const on = d.slug === slug;
                return (
                  <Link
                    key={d.slug}
                    href={`/legal/${d.slug}`}
                    aria-current={on ? "page" : undefined}
                    className="whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors sm:px-5"
                    style={
                      on
                        ? {
                            background: "#ffffff",
                            color: C.pri,
                            boxShadow: "0 8px 20px -10px rgba(0,0,0,.45)",
                          }
                        : { color: "rgba(255,255,255,.82)" }
                    }
                  >
                    {d.tab}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </section>

      {/* ── document ── */}
      <section className="mx-auto w-full max-w-[1160px] px-5 pb-20 pt-12 sm:px-6 sm:pt-16">
        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <div className="sticky top-24 flex flex-col gap-4">
              <div className="glass-surface rounded-[22px] p-5">
                <p
                  className="mb-3 text-[11px] font-semibold uppercase"
                  style={{ color: C.mute2, letterSpacing: ".12em", fontFamily: "var(--f-mono)" }}
                >
                  On this page
                </p>
                <ol className="flex flex-col gap-0.5">
                  {toc.map((t) => {
                    const on = t.id === active;
                    return (
                      <li key={t.id}>
                        <a
                          href={`#${t.id}`}
                          className="flex items-baseline gap-2.5 rounded-xl px-2.5 py-2 text-[13.5px] leading-snug transition-colors hover:bg-white/70"
                          style={
                            on
                              ? { background: "rgba(37,99,235,.09)", color: C.pri, fontWeight: 600 }
                              : { color: C.mute }
                          }
                        >
                          <span
                            className="text-[11px] tabular-nums"
                            style={{ fontFamily: "var(--f-mono)", color: on ? C.pri : C.mute2 }}
                          >
                            {t.num}
                          </span>
                          {t.label}
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="glass-surface rounded-[22px] p-5">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl text-white"
                  style={{ background: "linear-gradient(160deg,#3b82f6,#1d4ed8)" }}
                >
                  <Mail size={18} />
                </span>
                <p
                  className="mt-3 text-[15px] font-semibold"
                  style={{ fontFamily: "var(--f-head)" }}
                >
                  Questions about this?
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: C.mute }}>
                  Email us and a real person will get back to you.
                </p>
                <a
                  href="mailto:info@repulabs.com"
                  className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold"
                  style={{ color: C.pri }}
                >
                  info@repulabs.com <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </aside>

          <article
            ref={articleRef}
            className="legal-doc glass-surface glass-surface--raised rounded-[28px] px-6 py-8 sm:px-12 sm:py-12"
          >
            {children}
          </article>
        </div>

        {/* related documents */}
        <div className="mt-16">
          <p
            className="mb-4 text-[11px] font-semibold uppercase"
            style={{ color: C.mute2, letterSpacing: ".12em", fontFamily: "var(--f-mono)" }}
          >
            Related documents
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {related.map((d) => (
              <Link
                key={d.slug}
                href={`/legal/${d.slug}`}
                className="glass-surface glass-surface--hover group flex items-start gap-3.5 rounded-[22px] p-5"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: "rgba(37,99,235,.1)", color: C.pri }}
                >
                  <d.Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[15px] font-semibold"
                    style={{ fontFamily: "var(--f-head)" }}
                  >
                    {d.title}
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug" style={{ color: C.mute }}>
                    {d.summary}
                  </span>
                </span>
                <ArrowRight
                  size={16}
                  className="mt-1 shrink-0 transition-transform group-hover:translate-x-0.5"
                  style={{ color: C.pri }}
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <MarketingFooter />

      <style>{`
        .legal-doc { font-size: 15.5px; line-height: 1.75; color: #283449; }
        .legal-doc > h1,
        .legal-doc > h1 + p.text-muted-foreground { display: none; }
        .legal-doc > h1 + p.text-muted-foreground + p { margin-top: 0; }
        .legal-doc > p:first-of-type { font-size: 17px; color: #1f2a3d; }
        .legal-doc h2 {
          display: flex; align-items: center; gap: 12px;
          font-family: var(--f-head); font-size: 21px; font-weight: 600;
          letter-spacing: -0.02em; color: ${C.ink};
          margin: 44px 0 14px; scroll-margin-top: 110px;
        }
        .legal-doc h2[data-num]::before {
          content: attr(data-num);
          display: inline-grid; place-items: center; flex: none;
          width: 34px; height: 34px; border-radius: 11px;
          background: rgba(37,99,235,.1); color: ${C.pri};
          font-family: var(--f-mono); font-size: 12.5px; font-weight: 600; letter-spacing: 0;
        }
        .legal-doc p { margin: 0 0 16px; }
        .legal-doc ul { list-style: none; margin: 0 0 18px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
        .legal-doc li { position: relative; padding: 12px 16px 12px 36px; border-radius: 14px; background: rgba(244,247,252,.85); }
        .legal-doc li::before {
          content: ""; position: absolute; left: 16px; top: 22px;
          width: 7px; height: 7px; border-radius: 99px; background: ${C.pri};
        }
        .legal-doc strong { color: ${C.ink}; font-weight: 600; }
        .legal-doc a { color: ${C.pri}; font-weight: 500; text-decoration: none; }
        .legal-doc a:hover { text-decoration: underline; }
        .legal-doc code {
          font-family: var(--f-mono); font-size: 13px; padding: 2px 7px; border-radius: 7px;
          background: rgba(37,99,235,.08); color: #1e3a8a;
        }
        .legal-doc table { width: 100%; border-collapse: separate; border-spacing: 0 6px; margin: 0 0 20px; font-size: 14px; }
        .legal-doc thead th {
          text-align: left; font-family: var(--f-mono); font-size: 11px; font-weight: 600;
          text-transform: uppercase; letter-spacing: .08em; color: ${C.mute2}; padding: 4px 14px;
        }
        .legal-doc tbody td { padding: 12px 14px; background: rgba(244,247,252,.85); vertical-align: top; }
        .legal-doc tbody td:first-child { border-radius: 12px 0 0 12px; }
        .legal-doc tbody td:last-child { border-radius: 0 12px 12px 0; }
      `}</style>
    </main>
  );
}
