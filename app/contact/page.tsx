import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { Calendar, HelpCircle, Mail, MessageSquare, Phone, Shield } from "lucide-react";

export const dynamic = "force-static";

export const metadata = {
  title: "Contact · Repulabs",
  description:
    "Reach Repulabs for sales, support, partnerships, or press. Real humans, fast replies.",
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

export default function ContactPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="Contact"
        title="Tell us what you need. We&rsquo;ll route you to the right human."
        description="Median first-response time is 3 hours during business days, never more than 24 hours. Real humans, no chatbot maze."
      />

      <section className="mx-auto max-w-[1080px] px-6 py-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <ContactCard
            icon={<Mail size={20} />}
            label="Sales"
            email="sales@repulabs.com"
            note="Pricing, demos, multi-location plans. Reply within 4 business hours."
          />
          <ContactCard
            icon={<HelpCircle size={20} />}
            label="Support"
            email="help@repulabs.com"
            note="Existing customers, billing, technical issues. Priority queue for Pro customers."
          />
          <ContactCard
            icon={<Shield size={20} />}
            label="Security"
            email="security@repulabs.com"
            note="Responsible disclosure, security questionnaires, SOC 2 reports."
          />
          <ContactCard
            icon={<MessageSquare size={20} />}
            label="Partnerships"
            email="partners@repulabs.com"
            note="Agencies, integrations, resellers. We pay generous rev-share."
          />
          <ContactCard
            icon={<Phone size={20} />}
            label="Press"
            email="press@repulabs.com"
            note="Media inquiries, interviews, founder availability. Press kit at /press."
          />
          <ContactCard
            icon={<Calendar size={20} />}
            label="Demo"
            href="https://cal.com/repulabs/demo"
            label2="Book a 20-min walkthrough"
            note="See the platform live. We&rsquo;ll bring example data for a business like yours."
          />
        </div>
      </section>

      <section
        style={{ background: C.surface2, borderTop: `1px solid ${C.line}` }}
        className="border-b"
      >
        <div className="mx-auto max-w-[760px] px-6 py-20">
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Office hours
          </h2>
          <div
            className="mt-6 rounded-2xl p-7"
            style={{ background: C.surface, border: `1px solid ${C.line}` }}
          >
            <Row label="Sales + support" value="Mon–Fri · 8am–8pm AEST · 24-hour SLA on email" />
            <Row label="Engineering on-call" value="24/7 for status-page-impacting incidents" />
            <Row label="Headquarters" value="Level 3, 530 Collins St, Melbourne VIC 3000" />
            <Row label="ABN" value="98 765 432 109" last />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function ContactCard({
  icon,
  label,
  label2,
  email,
  href,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  label2?: string;
  email?: string;
  href?: string;
  note: string;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: C.surface, border: `1px solid ${C.line}` }}
    >
      <div
        className="grid h-10 w-10 place-items-center rounded-xl"
        style={{ background: C.pri50, color: C.pri }}
      >
        {icon}
      </div>
      <div
        className="mt-4 text-[11px]"
        style={{
          color: C.mute,
          fontFamily: "var(--f-mono)",
          letterSpacing: ".12em",
          fontWeight: 600,
        }}
      >
        {label.toUpperCase()}
      </div>
      <a
        href={email ? `mailto:${email}` : href}
        target={href ? "_blank" : undefined}
        rel={href ? "noopener noreferrer" : undefined}
        className="mt-1 block"
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: C.ink,
          textDecoration: "none",
        }}
      >
        {email ?? label2}
      </a>
      <p className="mt-3" style={{ fontSize: 13, color: C.mute, lineHeight: 1.55 }}>
        {note}
      </p>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className="flex flex-wrap items-baseline justify-between gap-2"
      style={{
        paddingTop: 14,
        paddingBottom: 14,
        borderBottom: last ? undefined : `1px solid ${C.line}`,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: C.mute,
          fontFamily: "var(--f-mono)",
          letterSpacing: ".12em",
          fontWeight: 600,
        }}
      >
        {label.toUpperCase()}
      </span>
      <span style={{ fontSize: 14, color: C.ink2, textAlign: "right" }}>{value}</span>
    </div>
  );
}
