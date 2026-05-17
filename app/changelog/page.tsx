import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";

export const dynamic = "force-static";

export const metadata = {
  title: "Changelog · Repulabs",
  description: "Every release, every breaking change, every shipped improvement — annotated.",
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
  warn: "var(--warn, #f59e0b)",
  ok: "var(--ok, #10b981)",
};

type Tag = "new" | "improved" | "fixed" | "security";

const TAG_STYLES: Record<Tag, { bg: string; fg: string; label: string }> = {
  new: { bg: C.pri50, fg: C.pri, label: "NEW" },
  improved: { bg: "#fef3c7", fg: "#92400e", label: "IMPROVED" },
  fixed: { bg: "#dcfce7", fg: "#166534", label: "FIXED" },
  security: { bg: "#fee2e2", fg: "#991b1b", label: "SECURITY" },
};

const RELEASES: Array<{
  version: string;
  date: string;
  items: Array<{ tag: Tag; title: string; body: string }>;
}> = [
  {
    version: "v2.0.4",
    date: "May 17, 2026",
    items: [
      {
        tag: "new",
        title: "QR plaque factory pipeline",
        body: "Admin batch ZIP generation with manifest CSV + high-res PNG + scalable SVG for every device. Activation codes are SHA-256 hashed at insert and never recoverable from the DB.",
      },
      {
        tag: "security",
        title: "Open-redirect interstitial on /r/{slug}",
        body: "QR destinations outside the Google review host allowlist now route through a confirmation page. Prevents repulabs.com from being used as a first-hop phishing laundromat.",
      },
      {
        tag: "improved",
        title: "Mobile-responsive dashboard",
        body: "Grid layouts collapse cleanly under 960px and 640px. Page header stacks vertically on phones. Content padding shrinks 36px → 14px on narrow viewports.",
      },
    ],
  },
  {
    version: "v2.0.3",
    date: "May 14, 2026",
    items: [
      {
        tag: "new",
        title: "AI phone receptionist 2.0",
        body: "Real-time voice clone (5-minute training sample), after-hours call routing, post-call outcome tagging, and a 200-min/mo allowance on Pro.",
      },
      {
        tag: "improved",
        title: "Dispute service queue",
        body: "Premium dispute resolution drafted by a real human, signed off by AI for tone, and submitted within 4 hours. 87% removal rate on ToS-violating Google reviews.",
      },
    ],
  },
  {
    version: "v2.0.2",
    date: "May 03, 2026",
    items: [
      {
        tag: "new",
        title: "Survey coupon codes",
        body: "Reward survey completers with a one-time coupon code, generated per-respondent and trackable to Stripe redemption.",
      },
      {
        tag: "fixed",
        title: "OAuth token refresh race condition",
        body: "Connection refresh tokens were briefly reused under concurrent invocations. Tightened with row-level locking on connections table.",
      },
    ],
  },
  {
    version: "v2.0.1",
    date: "Apr 22, 2026",
    items: [
      {
        tag: "new",
        title: "Bulk outreach with CSV upload",
        body: "Upload up to 5,000 recipients with name + phone + email; dedupe against your suppress list; schedule send rate to stay under provider rate limits.",
      },
      {
        tag: "improved",
        title: "AI reply training UI",
        body: "Train the voice model with three docs and 10 approved replies. New diff view shows how each new draft compares to your past replies.",
      },
    ],
  },
];

export default function ChangelogPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="Changelog"
        title="Every release, annotated."
        description="We ship every Tuesday and Thursday. Breaking changes are flagged 14 days in advance via webhook + dashboard banner."
      />

      <section className="mx-auto max-w-[860px] px-6 py-20">
        {RELEASES.map((r, i) => (
          <div key={r.version} className={i === 0 ? "" : "mt-14"}>
            <div className="flex items-baseline justify-between">
              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                }}
              >
                {r.version}
              </h2>
              <span
                style={{
                  fontSize: 12,
                  color: C.mute,
                  fontFamily: "var(--f-mono)",
                  letterSpacing: ".08em",
                }}
              >
                {r.date.toUpperCase()}
              </span>
            </div>
            <div className="mt-6 space-y-4">
              {r.items.map((it) => (
                <div
                  key={it.title}
                  className="rounded-2xl p-6"
                  style={{ background: C.surface, border: `1px solid ${C.line}` }}
                >
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                    style={{
                      fontFamily: "var(--f-mono)",
                      letterSpacing: ".08em",
                      background: TAG_STYLES[it.tag].bg,
                      color: TAG_STYLES[it.tag].fg,
                    }}
                  >
                    {TAG_STYLES[it.tag].label}
                  </span>
                  <h3
                    className="mt-3"
                    style={{
                      fontSize: 17,
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {it.title}
                  </h3>
                  <p className="mt-2" style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
                    {it.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </MarketingShell>
  );
}
