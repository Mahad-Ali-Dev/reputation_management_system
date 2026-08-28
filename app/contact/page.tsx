import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import {
  Building2,
  Calendar,
  Clock,
  DollarSign,
  Handshake,
  Headset,
  Mail,
  MapPin,
  Megaphone,
  Phone,
  ShieldCheck,
  Siren,
} from "lucide-react";

export const dynamic = "force-static";

export const metadata = {
  title: "Contact · Repulabs",
  description: "Reach Repulabs for anything sales, support, security, partnerships, press. One inbox, real humans, fast replies.",
};

const CONTACT_EMAIL = "info@repulabs.com";
const CONTACT_PHONE = "+61 413 345 555";

const TOPICS = [
  { icon: <DollarSign size={13} />, label: "Sales & demos" },
  { icon: <Headset size={13} />, label: "Support" },
  { icon: <ShieldCheck size={13} />, label: "Security" },
  { icon: <Handshake size={13} />, label: "Partnerships" },
  { icon: <Megaphone size={13} />, label: "Press" },
];

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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* One inbox for everything — sales, support, security, partnerships,
              press all land in the same place and get routed to the right
              person, so there's one real address instead of five stub aliases. */}
          <div
            className="rounded-2xl p-8 sm:p-10"
            style={{ background: C.surface, border: `1px solid ${C.line}` }}
          >
            <div
              className="grid h-12 w-12 place-items-center rounded-2xl"
              style={{ background: C.pri50, color: C.pri }}
            >
              <Mail size={22} />
            </div>
            <h2
              className="mt-5"
              style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: C.ink }}
            >
              Email us one address, real humans
            </h2>
            <p className="mt-2 max-w-[46ch]" style={{ fontSize: 14, color: C.mute, lineHeight: 1.6 }}>
              Sales, support, security, partnerships, press it all comes to the same inbox and
              we route it to the right person fast. No maze of aliases to guess between.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 transition-opacity hover:opacity-90"
                style={{ background: C.pri, color: "#fff", fontSize: 16, fontWeight: 600 }}
              >
                <Mail size={17} />
                {CONTACT_EMAIL}
              </a>
              <a
                href={`tel:${CONTACT_PHONE.replace(/\s+/g, "")}`}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3 transition-colors hover:bg-[var(--surface-2,_#fafbf8)]"
                style={{ border: `1px solid ${C.line}`, color: C.ink, fontSize: 16, fontWeight: 600 }}
              >
                <Phone size={17} style={{ color: C.pri }} />
                {CONTACT_PHONE}
              </a>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <span
                  key={t.label}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: C.surface2, border: `1px solid ${C.line}`, color: C.ink2 }}
                >
                  <span style={{ color: C.pri }}>{t.icon}</span>
                  {t.label}
                </span>
              ))}
            </div>
          </div>

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
        <div className="mx-auto max-w-[820px] px-6 py-20">
          <h2
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Office hours
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoTile
              icon={<Clock size={18} />}
              label="Sales + support"
              value="Mon–Fri · 8am–8pm AEST"
              sub="24-hour SLA on email"
            />
            <InfoTile
              icon={<Siren size={18} />}
              label="Engineering on-call"
              value="24/7"
              sub="for status-page-impacting incidents"
            />
            <InfoTile
              icon={<MapPin size={18} />}
              label="Headquarters"
              value="Level 3, 530 Collins St"
              sub="Melbourne VIC 3000"
            />
            <InfoTile icon={<Building2 size={18} />} label="ABN" value="98 765 432 109" />
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

function InfoTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="flex items-start gap-4 rounded-2xl p-5"
      style={{ background: C.surface, border: `1px solid ${C.line}` }}
    >
      <div
        className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl"
        style={{ background: C.pri50, color: C.pri }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div
          style={{
            fontSize: 11,
            color: C.mute,
            fontFamily: "var(--f-mono)",
            letterSpacing: ".12em",
            fontWeight: 600,
          }}
        >
          {label.toUpperCase()}
        </div>
        <div className="mt-1.5" style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>
          {value}
        </div>
        {sub && (
          <div className="mt-0.5" style={{ fontSize: 13, color: C.mute, lineHeight: 1.5 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}
