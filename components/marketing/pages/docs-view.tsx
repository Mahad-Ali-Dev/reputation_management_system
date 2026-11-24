import { DOC_GUIDES } from "@/components/marketing/docs/guides";
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
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Calendar,
  Clock,
  Mail,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";

const HELP = [
  {
    Icon: Mail,
    title: "Email a human",
    body: "info@repulabs.com. Median first response is 3 business hours.",
    href: "mailto:info@repulabs.com",
    cta: "Send an email",
  },
  {
    Icon: Calendar,
    title: "Book a walkthrough",
    body: "A 20-minute call with example data for a business like yours.",
    href: "https://cal.com/repulabs/demo",
    cta: "Pick a time",
  },
  {
    Icon: MessageCircle,
    title: "Contact page",
    body: "Sales, support, security and partnerships, all routed to the right person.",
    href: "/contact",
    cta: "Get in touch",
  },
];

export function DocsView() {
  const [first, ...rest] = DOC_GUIDES;
  return (
    <GlassPage>
      <PageHero
        eyebrow="Documentation"
        icon={<BookOpen size={13} strokeWidth={2.2} />}
        title="From zero to running reputation on autopilot in one cup of coffee."
        description="Practical, step-by-step guides with no fluff. Start with the quickstart, then dip into whatever you need."
      >
        <HeroButton href="/docs/quickstart">
          Start the 10-minute quickstart <ArrowRight size={15} />
        </HeroButton>
        <HeroButton href="mailto:info@repulabs.com" ghost>
          Ask a question
        </HeroButton>
      </PageHero>

      <PageSection>
        <SectionTitle eyebrow="Guides" title="Pick up where you are" />
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {first && (
            <Link
              href={first.href}
              className="group relative flex flex-col overflow-hidden rounded-[26px] p-7 text-white sm:p-8 md:col-span-2"
              style={{ background: G.heroBg }}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(600px 280px at 85% -20%, rgba(255,255,255,.3), transparent 60%)",
                }}
              />
              <div className="relative flex items-center justify-between gap-3">
                <span
                  className="grid h-12 w-12 place-items-center rounded-[14px]"
                  style={{ background: "rgba(255,255,255,.16)" }}
                >
                  <first.Icon size={22} />
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold"
                  style={{ background: "rgba(255,255,255,.16)" }}
                >
                  <Clock size={13} /> About 10 minutes
                </span>
              </div>
              <span className="relative mt-6">
                <MonoLabel color="rgba(255,255,255,.7)">Start here</MonoLabel>
              </span>
              <h3
                className="relative mt-1 text-[28px] font-semibold"
                style={{ letterSpacing: "-0.02em" }}
              >
                {first.title}
              </h3>
              <p
                className="relative mt-2 max-w-md text-[15.5px] leading-relaxed"
                style={{ color: "rgba(255,255,255,.82)" }}
              >
                {first.blurb}
              </p>
              <span
                className="relative mt-7 inline-flex h-11 w-max items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold"
                style={{ color: G.pri }}
              >
                Read the quickstart
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          )}

          {rest.map((g) => (
            <Link
              key={g.href}
              href={g.href}
              className="glass-surface glass-surface--hover group flex flex-col rounded-[26px] p-7"
            >
              <IconTile>
                <g.Icon size={20} />
              </IconTile>
              <h3 className="mt-5 text-[19px] font-semibold" style={{ letterSpacing: "-0.015em" }}>
                {g.title}
              </h3>
              <p className="mt-2 flex-1 text-[14.5px] leading-relaxed" style={{ color: G.mute }}>
                {g.blurb}
              </p>
              <span
                className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-semibold"
                style={{ color: G.pri }}
              >
                Read guide{" "}
                <ArrowRight
                  size={14}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          ))}
        </div>
      </PageSection>

      <PageSection className="!pt-0">
        <SectionTitle eyebrow="Help" title="Stuck? Talk to a real person." />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {HELP.map(({ Icon, title, body, href, cta }) => {
            const external = href.startsWith("http");
            return (
              <a
                key={title}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noopener noreferrer" : undefined}
                className="glass-surface glass-surface--hover group flex flex-col rounded-[22px] p-6"
              >
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl"
                  style={{ background: G.tint, color: G.pri }}
                >
                  <Icon size={18} />
                </span>
                <span className="mt-4 text-[16.5px] font-semibold">{title}</span>
                <span className="mt-1 flex-1 text-[14px] leading-relaxed" style={{ color: G.mute }}>
                  {body}
                </span>
                <span
                  className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold"
                  style={{ color: G.pri }}
                >
                  {cta}{" "}
                  <ArrowUpRight size={14} className="transition-transform group-hover:-rotate-45" />
                </span>
              </a>
            );
          })}
        </div>
      </PageSection>
    </GlassPage>
  );
}
