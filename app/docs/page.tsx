import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { ArrowRight, BookOpen, Code, Layers, Phone, QrCode, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "Documentation · Repulabs",
  description:
    "Get up and running with Repulabs in 10 minutes. Setup guides, integration walkthroughs, and the full API reference.",
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

const SECTIONS = [
  {
    icon: <Zap size={18} />,
    title: "Quickstart",
    blurb:
      "Sign up, connect Google Business Profile, send your first review request in under 10 minutes.",
    href: "/docs/quickstart",
  },
  {
    icon: <Layers size={18} />,
    title: "Concepts",
    blurb:
      "Organizations, establishments, devices, brand voice the mental model the rest of the docs assumes.",
    href: "/docs/concepts",
  },
  {
    icon: <Sparkles size={18} />,
    title: "AI reply training",
    blurb:
      "Train the assistant on your brand voice with three short documents and a handful of approved replies.",
    href: "/docs/ai-training",
  },
  {
    icon: <QrCode size={18} />,
    title: "QR plaques",
    blurb: "Order, activate, and configure hardware plaques. Includes the factory ZIP workflow.",
    href: "/docs/hardware",
  },
  {
    icon: <Phone size={18} />,
    title: "AI phone receptionist",
    blurb: "Twilio setup, voice clone training, after-hours routing, and outcome tagging.",
    href: "/docs/phone",
  },
  {
    icon: <Code size={18} />,
    title: "API reference",
    blurb:
      "Programmatic access to reviews, requests, devices, and AI replies. OAuth + bearer token auth.",
    href: "/docs/api",
  },
];

export default function DocsPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="Documentation"
        title="From zero to running reputation on autopilot in one cup of coffee."
        description="Practical, copy-pasteable, no fluff. Every guide has a working code sample at the bottom."
        actions={
          <Link
            href="/docs/api"
            className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium"
            style={{ background: C.ink, color: "#fff" }}
          >
            Start the 10-minute quickstart
            <ArrowRight size={14} />
          </Link>
        }
      />

      <section className="mx-auto max-w-[1280px] px-6 py-20">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-2xl p-7 transition-all hover:-translate-y-0.5"
              style={{
                background: C.surface,
                border: `1px solid ${C.line}`,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div
                className="grid h-10 w-10 place-items-center rounded-xl"
                style={{ background: C.pri50, color: C.pri }}
              >
                {s.icon}
              </div>
              <h3
                className="mt-4"
                style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}
              >
                {s.title}
              </h3>
              <p className="mt-2" style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
                {s.blurb}
              </p>
              <span
                className="mt-4 inline-flex items-center gap-1 text-[13px]"
                style={{ color: C.pri }}
              >
                Read guide
                <ArrowRight size={12} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section
        style={{ background: C.surface2, borderTop: `1px solid ${C.line}` }}
        className="border-b"
      >
        <div className="mx-auto max-w-[760px] px-6 py-20">
          <div
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: C.pri50, color: C.pri }}
          >
            <BookOpen size={18} />
          </div>
          <h2
            className="mt-4"
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 600,
              letterSpacing: "-0.025em",
            }}
          >
            Stuck? Three options.
          </h2>
          <ol className="mt-6 space-y-4" style={{ fontSize: 15, color: C.ink2, lineHeight: 1.65 }}>
            <li>
              <strong>1. Search the docs</strong> use the search bar (cmd+K) at the top. Indexed
              hourly.
            </li>
            <li>
              <strong>2. Ask the chatbot</strong> bottom-right of every page. Pulls answers from
              the docs, the changelog, and our public Q&amp;A.
            </li>
            <li>
              <strong>3. Email a human</strong> at{" "}
              <a href="mailto:info@repulabs.com" style={{ color: C.pri }}>
                info@repulabs.com
              </a>{" "}
              median first response 3 business hours.
            </li>
          </ol>
        </div>
      </section>
    </MarketingShell>
  );
}
