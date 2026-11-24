/**
 * Glass chrome for a single documentation guide (same API as the old
 * app/docs/_components/doc-shell.tsx: DocShell, Step, Block, Note, Code, List).
 *
 *   - Blue hero with the guide title and an "All documentation" link.
 *   - Desktop: a sticky sidebar listing every guide (current one highlighted)
 *     plus a help card; the guide itself sits in a raised glass card.
 *   - Previous / next guide cards at the bottom.
 */

import { DocsGuideNav, DocsPrevNext } from "@/components/marketing/docs/docs-nav";
import { G, GlassPage, PageHero } from "@/components/marketing/glass-page";
import { ArrowLeft, BookOpen, Lightbulb } from "lucide-react";
import Link from "next/link";
import type React from "react";

export const C = {
  surface: "#ffffff",
  surface2: "rgba(244,247,252,.85)",
  ink: G.ink,
  ink2: G.ink2,
  mute: G.mute,
  line: "rgba(15,23,42,.08)",
  pri: G.pri,
  pri50: "rgba(37,99,235,.1)",
};

export function DocShell({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <GlassPage>
      <PageHero
        eyebrow={`Docs · ${kicker}`}
        icon={<BookOpen size={13} strokeWidth={2.2} />}
        title={title}
        description={description}
      >
        <Link
          href="/docs"
          className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold text-white"
          style={{
            background: "rgba(255,255,255,.12)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,.28)",
          }}
        >
          <ArrowLeft size={15} /> All documentation
        </Link>
      </PageHero>

      <section className="mx-auto w-full max-w-[1160px] px-5 pb-20 pt-12 sm:px-6 sm:pt-16">
        <div className="grid gap-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-10">
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <DocsGuideNav />
            </div>
          </aside>
          <div className="min-w-0">
            <article className="glass-surface glass-surface--raised rounded-[28px] px-6 py-8 sm:px-11 sm:py-11">
              {children}
            </article>
            <DocsPrevNext />
          </div>
        </div>
      </section>
    </GlassPage>
  );
}

const body =
  "mt-3 flex flex-col gap-3 text-[15.5px] leading-[1.75] [&_a]:font-medium [&_a]:text-[#2563eb]";

/** A numbered step in a walkthrough. */
export function Step({
  n,
  title,
  children,
}: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 flex gap-4 last:mb-0 sm:gap-5">
      <span
        className="grid h-10 w-10 flex-none place-items-center rounded-[13px] text-[14px] font-bold text-white"
        style={{
          background: "linear-gradient(160deg,#3b82f6,#1d4ed8)",
          boxShadow: "0 10px 20px -10px rgba(37,99,235,.8)",
          fontFamily: "var(--f-num)",
        }}
      >
        {n}
      </span>
      <div className="min-w-0 pt-1.5">
        <h2
          className="text-[20px] font-semibold"
          style={{ color: C.ink, letterSpacing: "-0.02em" }}
        >
          {title}
        </h2>
        <div className={body} style={{ color: C.ink2 }}>
          {children}
        </div>
      </div>
    </section>
  );
}

/** A titled prose block (for reference-style pages rather than walkthroughs). */
export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 last:mb-0">
      <h2 className="text-[20px] font-semibold" style={{ color: C.ink, letterSpacing: "-0.02em" }}>
        {title}
      </h2>
      <div className={body} style={{ color: C.ink2 }}>
        {children}
      </div>
    </section>
  );
}

/** Aside for gotchas and things that bite people. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-3 rounded-[16px] px-4 py-3.5 text-[14px] leading-relaxed"
      style={{ background: C.pri50, color: C.ink2 }}
    >
      <Lightbulb size={17} className="mt-0.5 flex-none" style={{ color: C.pri }} />
      <div>{children}</div>
    </div>
  );
}

/** Inline path/code token. */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="rounded-[7px] px-1.5 py-0.5 text-[13px]"
      style={{ background: C.pri50, color: "#1e3a8a", fontFamily: "var(--f-mono)" }}
    >
      {children}
    </code>
  );
}

/** Bulleted list with brand-blue dots. */
export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((it, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static content lists
        <li key={i} className="relative pl-5">
          <span
            className="absolute left-0 top-[0.72em] h-1.5 w-1.5 rounded-full"
            style={{ background: C.pri }}
          />
          {it}
        </li>
      ))}
    </ul>
  );
}
