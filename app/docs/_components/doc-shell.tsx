import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type React from "react";

/**
 * Shared chrome for a single documentation article.
 *
 * The /docs index links to six guides; this keeps them visually identical
 * without copying the shell into every file. Content-only pages import
 * DocShell + the small primitives below.
 */

export const C = {
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbf8)",
  ink: "var(--ink, #0B0D0E)",
  ink2: "var(--ink-2, #1e2225)",
  mute: "var(--rl-muted, #61697a)",
  line: "var(--line, #eceeea)",
  pri: "var(--pri, #2563EB)",
  pri50: "var(--pri-50, #ECFDF7)",
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
    <MarketingShell>
      <StubHero kicker={kicker} title={title} description={description} />
      <article className="mx-auto max-w-[760px] px-6 py-16">
        {children}
        <div className="mt-16 border-t pt-6" style={{ borderColor: C.line }}>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-[14px]"
            style={{ color: C.pri }}
          >
            <ArrowLeft size={14} />
            All documentation
          </Link>
        </div>
      </article>
    </MarketingShell>
  );
}

/** A numbered step in a walkthrough. */
export function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9 flex gap-4">
      <span
        className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[12.5px] font-medium"
        style={{ background: C.pri, color: "#fff" }}
      >
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-[17px] font-medium" style={{ color: C.ink }}>
          {title}
        </h2>
        <div
          className="mt-2 flex flex-col gap-3 text-[14.5px] leading-relaxed"
          style={{ color: C.ink2 }}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/** A titled prose block (for reference-style pages rather than walkthroughs). */
export function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="text-[17px] font-medium" style={{ color: C.ink }}>
        {title}
      </h2>
      <div
        className="mt-2 flex flex-col gap-3 text-[14.5px] leading-relaxed"
        style={{ color: C.ink2 }}
      >
        {children}
      </div>
    </section>
  );
}

/** Aside for gotchas and things that bite people. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-xl px-4 py-3 text-[13.5px] leading-relaxed"
      style={{ background: C.surface2, border: `1px solid ${C.line}`, color: C.ink2 }}
    >
      {children}
    </p>
  );
}

/** Inline path/code token. */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="rounded px-1.5 py-0.5 text-[13px]"
      style={{ background: C.surface2, border: `1px solid ${C.line}`, color: C.ink }}
    >
      {children}
    </code>
  );
}

/** Simple bulleted list with consistent spacing. */
export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1.5 pl-5">
      {items.map((it, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static content lists
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
