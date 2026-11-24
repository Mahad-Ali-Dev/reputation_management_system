"use client";

import { DOC_GUIDES } from "@/components/marketing/docs/guides";
import { G, MonoLabel } from "@/components/marketing/glass-page";
import { ArrowLeft, ArrowRight, Mail } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Guides match on the last URL segment ("quickstart"), so this also works
 *  when the guide is rendered under another path. */
const lastSeg = (p: string | null) => (p ?? "").split("/").filter(Boolean).at(-1) ?? "";

/** Guide list for the docs sidebar; the current guide is read from the URL. */
export function DocsGuideNav() {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-4">
      <div className="glass-surface rounded-[22px] p-4">
        <div className="px-2 pb-2 pt-1">
          <MonoLabel>Guides</MonoLabel>
        </div>
        <nav className="flex flex-col gap-0.5">
          {DOC_GUIDES.map((g) => {
            const on = lastSeg(pathname) === lastSeg(g.href);
            return (
              <Link
                key={g.href}
                href={g.href}
                aria-current={on ? "page" : undefined}
                className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[14px] transition-colors hover:bg-white/70"
                style={
                  on
                    ? { background: "rgba(37,99,235,.09)", color: G.pri, fontWeight: 600 }
                    : { color: G.mute }
                }
              >
                <g.Icon size={15} />
                {g.title}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="glass-surface rounded-[22px] p-5">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl text-white"
          style={{ background: G.iconBg }}
        >
          <Mail size={18} />
        </span>
        <p className="mt-3 text-[15px] font-semibold">Stuck on a step?</p>
        <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: G.mute }}>
          Email us and a real person will help.
        </p>
        <a
          href="mailto:info@repulabs.com"
          className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold"
          style={{ color: G.pri }}
        >
          info@repulabs.com <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}

/** Previous / next guide cards under the article. */
export function DocsPrevNext() {
  const pathname = usePathname();
  const i = DOC_GUIDES.findIndex((g) => lastSeg(g.href) === lastSeg(pathname));
  if (i < 0) return null;
  const prev = DOC_GUIDES[i - 1];
  const next = DOC_GUIDES[i + 1];
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="glass-surface glass-surface--hover group rounded-[22px] p-5"
        >
          <span
            className="inline-flex items-center gap-1.5 text-[12.5px]"
            style={{ color: G.mute }}
          >
            <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />{" "}
            Previous
          </span>
          <span className="mt-1 block text-[16px] font-semibold">{prev.title}</span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next && (
        <Link
          href={next.href}
          className="glass-surface glass-surface--hover group rounded-[22px] p-5 text-right"
        >
          <span
            className="inline-flex items-center gap-1.5 text-[12.5px]"
            style={{ color: G.mute }}
          >
            Next{" "}
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="mt-1 block text-[16px] font-semibold">{next.title}</span>
        </Link>
      )}
    </div>
  );
}
