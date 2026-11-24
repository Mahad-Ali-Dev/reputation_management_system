import {
  G,
  GlassPage,
  HeroButton,
  IconTile,
  MonoLabel,
  PageHero,
  PageSection,
  SectionTitle,
} from "@/components/marketing/glass-page";
import {
  ArrowUpRight,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  Handshake,
  Headset,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Phone,
  ShieldCheck,
  Siren,
} from "lucide-react";

const CONTACT_EMAIL = "info@repulabs.com";
const CONTACT_PHONE = "+61 413 345 555";

const TOPICS = [
  { Icon: DollarSign, label: "Sales & demos" },
  { Icon: Headset, label: "Support" },
  { Icon: ShieldCheck, label: "Security" },
  { Icon: Handshake, label: "Partnerships" },
  { Icon: Megaphone, label: "Press" },
];

const INFO = [
  {
    Icon: Clock,
    label: "Sales + support",
    value: "Mon–Fri · 8am–8pm AEST",
    sub: "24-hour SLA on email",
  },
  {
    Icon: Siren,
    label: "Engineering on-call",
    value: "24/7",
    sub: "For status-page-impacting incidents",
  },
  {
    Icon: MapPin,
    label: "Headquarters",
    value: "Level 3, 530 Collins St",
    sub: "Melbourne VIC 3000",
  },
  { Icon: Building2, label: "ABN", value: "98 765 432 109" },
];

export function ContactView() {
  return (
    <GlassPage>
      <PageHero
        eyebrow="Contact"
        icon={<MessageCircle size={13} strokeWidth={2.2} />}
        title="Tell us what you need. We’ll route you to the right human."
        description="Median first-response time is 3 hours on business days, never more than 24 hours. Real humans, no chatbot maze."
      >
        <HeroButton href={`mailto:${CONTACT_EMAIL}`}>
          <Mail size={15} /> {CONTACT_EMAIL}
        </HeroButton>
        <HeroButton href={`tel:${CONTACT_PHONE.replace(/\s+/g, "")}`} ghost>
          <Phone size={15} /> {CONTACT_PHONE}
        </HeroButton>
      </PageHero>

      <PageSection>
        <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          {/* One inbox for everything: sales, support, security, partnerships and
              press land in the same place and get routed to the right person. */}
          <div className="glass-surface glass-surface--raised rounded-[26px] p-7 sm:p-9">
            <IconTile size={52}>
              <Mail size={22} />
            </IconTile>
            <h2 className="mt-5 text-[26px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
              One address, real humans
            </h2>
            <p className="mt-2 max-w-[48ch] text-[15px] leading-relaxed" style={{ color: G.mute }}>
              Sales, support, security, partnerships, press: it all comes to the same inbox and we
              route it to the right person fast. No maze of aliases to guess between.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="flex items-center gap-3 rounded-[18px] p-4 text-white"
                style={{ background: G.pri, boxShadow: "0 14px 28px -14px rgba(37,99,235,.9)" }}
              >
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl"
                  style={{ background: "rgba(255,255,255,.18)" }}
                >
                  <Mail size={18} />
                </span>
                <span>
                  <span className="block text-[12px]" style={{ color: "rgba(255,255,255,.75)" }}>
                    Email
                  </span>
                  <span className="block text-[15.5px] font-semibold">{CONTACT_EMAIL}</span>
                </span>
              </a>
              <a
                href={`tel:${CONTACT_PHONE.replace(/\s+/g, "")}`}
                className="flex items-center gap-3 rounded-[18px] p-4"
                style={{ background: G.fill }}
              >
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl"
                  style={{ background: G.tint, color: G.pri }}
                >
                  <Phone size={18} />
                </span>
                <span>
                  <span className="block text-[12px]" style={{ color: G.mute }}>
                    Phone
                  </span>
                  <span className="block text-[15.5px] font-semibold">{CONTACT_PHONE}</span>
                </span>
              </a>
            </div>

            <div className="mt-6">
              <MonoLabel>We can help with</MonoLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {TOPICS.map(({ Icon, label }) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium"
                    style={{ background: G.fill, color: G.ink2 }}
                  >
                    <Icon size={14} style={{ color: G.pri }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* demo card */}
          <a
            href="https://cal.com/repulabs/demo"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex flex-col overflow-hidden rounded-[26px] p-7 text-white sm:p-9"
            style={{ background: G.heroBg }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(500px 260px at 80% -10%, rgba(255,255,255,.28), transparent 60%)",
              }}
            />
            <span
              className="relative grid h-[52px] w-[52px] place-items-center rounded-[16px]"
              style={{ background: "rgba(255,255,255,.16)" }}
            >
              <Calendar size={22} />
            </span>
            <span className="relative mt-5">
              <MonoLabel color="rgba(255,255,255,.7)">Demo</MonoLabel>
            </span>
            <span
              className="relative mt-1 text-[26px] font-semibold leading-tight"
              style={{ letterSpacing: "-0.02em" }}
            >
              Book a 20-min walkthrough
            </span>
            <span
              className="relative mt-3 text-[15px] leading-relaxed"
              style={{ color: "rgba(255,255,255,.8)" }}
            >
              See the platform live. We’ll bring example data for a business like yours.
            </span>
            <span
              className="relative mt-auto inline-flex h-11 w-max items-center gap-2 rounded-full bg-white px-5 pt-0 text-[14px] font-semibold"
              style={{ color: G.pri, marginTop: 28 }}
            >
              Pick a time{" "}
              <ArrowUpRight size={15} className="transition-transform group-hover:-rotate-45" />
            </span>
          </a>
        </div>
      </PageSection>

      <PageSection className="!pt-0" width={1120}>
        <SectionTitle eyebrow="Office hours" title="When and where to find us" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INFO.map(({ Icon, label, value, sub }) => (
            <div key={label} className="glass-surface rounded-[22px] p-5">
              <span
                className="grid h-10 w-10 place-items-center rounded-xl"
                style={{ background: G.tint, color: G.pri }}
              >
                <Icon size={18} />
              </span>
              <div className="mt-4">
                <MonoLabel>{label}</MonoLabel>
              </div>
              <div className="mt-1 text-[16.5px] font-semibold leading-snug">{value}</div>
              {sub && (
                <div className="mt-0.5 text-[13px] leading-snug" style={{ color: G.mute }}>
                  {sub}
                </div>
              )}
            </div>
          ))}
        </div>
      </PageSection>
    </GlassPage>
  );
}
