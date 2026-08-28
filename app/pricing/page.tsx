import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import {
  PLAN_FEATURES,
  PLAN_META,
  PRO_PRICE_AUD,
  type PlanKey,
  TRIAL_DAYS,
} from "@/lib/billing/plans";
import { ArrowRight, Check, Minus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-static";

export const metadata = {
  title: "Pricing · Repulabs",
  description: `Simple per-location pricing. Start free, or go Pro for AI-drafted replies, unlimited review requests and the AI phone receptionist. ${TRIAL_DAYS}-day free trial, cancel anytime.`,
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

const ORDER: PlanKey[] = ["standard", "pro", "scale"];

/** Where each tier's CTA goes. Scale is a sales conversation, not self-serve. */
const CTA: Record<PlanKey, { label: string; href: string }> = {
  standard: { label: "Start free", href: "/signup" },
  pro: { label: `Start ${TRIAL_DAYS}-day free trial`, href: "/signup" },
  scale: { label: "Talk to sales", href: "/contact" },
};

const FAQ: Array<[string, string]> = [
  [
    "Is the trial really free?",
    `Yes ${TRIAL_DAYS} days of Pro with no charge. We ask for a card so your workspace keeps running when the trial ends, and you can cancel before then without being billed.`,
  ],
  [
    "What counts as a location?",
    "One physical business address one Google Business Profile. If you run three cafés, that's three locations. Each gets its own reviews, devices and brand voice, all under one login.",
  ],
  [
    "Can I change plans later?",
    "Any time. Upgrades apply immediately; downgrades take effect at the end of the billing period. Nothing is locked in there's no contract on Standard or Pro.",
  ],
  [
    "Do I need to buy hardware?",
    "No. The QR and NFC cards, plaques and stands are optional they just make it far easier for customers to leave a review on the spot. The software works with or without them.",
  ],
  [
    "What happens to my data if I cancel?",
    "Your reviews and contacts stay exportable, and we delete your data on request. Disconnecting an integration revokes our access to it immediately.",
  ],
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="Pricing"
        title="One price per location. No setup fees, no contracts."
        description={`Start on Standard for free, or try everything on Pro for ${TRIAL_DAYS} days. Cancel any time.`}
        actions={
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-medium"
            style={{ background: C.ink, color: "#fff" }}
          >
            Start {TRIAL_DAYS}-day free trial
            <ArrowRight size={14} />
          </Link>
        }
      />

      {/* ---- plan cards ---- */}
      <section className="mx-auto max-w-[1120px] px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {ORDER.map((key) => {
            const meta = PLAN_META[key];
            const featured = key === "pro";
            return (
              <div
                key={key}
                className="relative flex flex-col rounded-2xl p-7"
                style={{
                  background: featured ? C.surface : C.surface2,
                  border: `1px solid ${featured ? C.pri : C.line}`,
                  boxShadow: featured ? "0 24px 50px -30px rgba(37,99,235,.45)" : "none",
                }}
              >
                {featured && (
                  <span
                    className="absolute -top-3 left-7 rounded-full px-3 py-1 text-[11px] font-medium"
                    style={{ background: C.pri, color: "#fff" }}
                  >
                    Most popular
                  </span>
                )}

                <h2 className="text-[15px] font-medium" style={{ color: C.ink }}>
                  {meta.name}
                </h2>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span
                    className="text-[38px] font-medium leading-none tracking-tight"
                    style={{ color: C.ink }}
                  >
                    {meta.price}
                  </span>
                  {meta.price.startsWith("A$") && (
                    <span className="text-[14px]" style={{ color: C.mute }}>
                      /mo
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[12.5px]" style={{ color: C.mute }}>
                  {meta.period}
                </p>
                <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: C.ink2 }}>
                  {meta.blurb}
                </p>

                <Link
                  href={CTA[key].href}
                  className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-3 text-[14px] font-medium"
                  style={
                    featured
                      ? { background: C.pri, color: "#fff" }
                      : { background: "transparent", color: C.ink, border: `1px solid ${C.line}` }
                  }
                >
                  {CTA[key].label}
                </Link>

                {key === "pro" && (
                  <p className="mt-2.5 text-center text-[11.5px]" style={{ color: C.mute }}>
                    {TRIAL_DAYS} days free, then A${PRO_PRICE_AUD}/mo. Cancel any time.
                  </p>
                )}

                <ul className="mt-7 flex flex-col gap-2.5">
                  {key === "pro" && (
                    <li className="mb-1 text-[12px] font-medium" style={{ color: C.ink }}>
                      Everything in Standard, plus:
                    </li>
                  )}
                  {PLAN_FEATURES[key].map(([label, included]) => (
                    <li key={label} className="flex items-start gap-2.5 text-[13.5px]">
                      {included ? (
                        <Check
                          size={15}
                          strokeWidth={2.4}
                          style={{ color: C.pri, marginTop: 2, flex: "0 0 15px" }}
                        />
                      ) : (
                        <Minus
                          size={15}
                          style={{ color: C.mute, marginTop: 2, flex: "0 0 15px" }}
                        />
                      )}
                      <span style={{ color: included ? C.ink2 : C.mute }}>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[12.5px]" style={{ color: C.mute }}>
          Prices in AUD, excluding GST. Hardware (QR cards, plaques and stands) is sold separately.
        </p>
      </section>

      {/* ---- FAQ ---- */}
      <section style={{ background: C.surface2, borderTop: `1px solid ${C.line}` }}>
        <div className="mx-auto max-w-[820px] px-6 py-20">
          <h2
            className="text-center text-[26px] font-medium tracking-tight"
            style={{ color: C.ink }}
          >
            Pricing questions
          </h2>
          <div className="mt-10 flex flex-col gap-3">
            {FAQ.map(([q, a]) => (
              <details
                key={q}
                className="rounded-xl px-5 py-4"
                style={{ background: C.surface, border: `1px solid ${C.line}` }}
              >
                <summary
                  className="cursor-pointer list-none text-[15px] font-medium"
                  style={{ color: C.ink }}
                >
                  {q}
                </summary>
                <p className="mt-3 text-[14px] leading-relaxed" style={{ color: C.mute }}>
                  {a}
                </p>
              </details>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium"
              style={{ background: C.ink, color: "#fff" }}
            >
              Start your {TRIAL_DAYS}-day free trial
              <ArrowRight size={14} />
            </Link>
            <p className="mt-3 text-[12.5px]" style={{ color: C.mute }}>
              Questions first?{" "}
              <Link href="/contact" style={{ color: C.pri }}>
                Talk to us
              </Link>
            </p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
