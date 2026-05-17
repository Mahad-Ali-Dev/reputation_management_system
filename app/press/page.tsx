import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { ArrowUpRight, Download, Mail } from "lucide-react";

export const dynamic = "force-static";

export const metadata = {
  title: "Press · Repulabs",
  description: "Press kit, media contacts, and recent coverage for Repulabs.",
};

const C = {
  surface: "var(--surface, #ffffff)",
  surface2: "var(--surface-2, #fafbf8)",
  ink: "var(--ink, #0B0D0E)",
  ink2: "var(--ink-2, #1e2225)",
  mute: "var(--rl-muted, #61697a)",
  line: "var(--line, #eceeea)",
  pri: "var(--pri, #2563EB)",
  pri50: "var(--pri-50, #ECFDF7)",
};

const COVERAGE = [
  {
    outlet: "SmartCompany",
    title: "Melbourne SaaS Repulabs hits 2,400 SMB customers on a single hire",
    date: "April 2026",
  },
  {
    outlet: "AFR Boss",
    title: "How AI phone receptionists are quietly becoming standard in trades",
    date: "March 2026",
  },
  {
    outlet: "ProductHunt",
    title: "Repulabs — #1 Product of the Day for reputation automation",
    date: "January 2026",
  },
];

export default function PressPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="Press"
        title="Everything you need to write about Repulabs."
        description="Press kit, founder bios, product screenshots, and a logo pack — all under permissive terms for editorial use."
      />

      <section className="mx-auto max-w-[1080px] px-6 py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div
            className="rounded-2xl p-8"
            style={{ background: C.surface, border: `1px solid ${C.line}` }}
          >
            <div
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: C.pri50, color: C.pri }}
            >
              <Download size={18} />
            </div>
            <h2
              className="mt-4"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              Press kit
            </h2>
            <p className="mt-2" style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
              The full package — logos in SVG and PNG, brand color hex codes, screenshots of the
              product, founder headshots, and a 200-word company description.
            </p>
            <a
              href="/brand"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium"
              style={{ background: C.ink, color: "#fff" }}
            >
              Download press kit
              <ArrowUpRight size={13} />
            </a>
          </div>

          <div
            className="rounded-2xl p-8"
            style={{ background: C.surface, border: `1px solid ${C.line}` }}
          >
            <div
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: C.pri50, color: C.pri }}
            >
              <Mail size={18} />
            </div>
            <h2
              className="mt-4"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              Media contact
            </h2>
            <p className="mt-2" style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
              For interview requests, expert commentary, or briefing materials. We respond within 24
              hours on business days.
            </p>
            <a
              href="mailto:press@repulabs.com"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium"
              style={{ border: `1px solid ${C.line}`, background: C.surface }}
            >
              press@repulabs.com
              <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </section>

      <section
        style={{ background: C.surface2, borderTop: `1px solid ${C.line}` }}
        className="border-b"
      >
        <div className="mx-auto max-w-[1080px] px-6 py-20">
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 600,
              letterSpacing: "-0.025em",
            }}
          >
            Recent coverage
          </h2>
          <div className="mt-8 space-y-3">
            {COVERAGE.map((c) => (
              <div
                key={c.title}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4"
                style={{ background: C.surface, border: `1px solid ${C.line}` }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.pri,
                      fontFamily: "var(--f-mono)",
                      letterSpacing: ".12em",
                      fontWeight: 600,
                    }}
                  >
                    {c.outlet.toUpperCase()} · {c.date.toUpperCase()}
                  </div>
                  <div
                    className="mt-1"
                    style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em" }}
                  >
                    {c.title}
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1 text-[12.5px]"
                  style={{ color: C.mute }}
                >
                  Read article
                  <ArrowUpRight size={13} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
