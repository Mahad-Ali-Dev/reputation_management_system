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
import { ArrowUpRight, Download, Mail, Megaphone } from "lucide-react";

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
    title: "Repulabs #1 Product of the Day for reputation automation",
    date: "January 2026",
  },
];

const FACTS: Array<[string, string]> = [
  ["Headquarters", "Melbourne, Australia"],
  ["Active locations", "2,400+"],
  ["Countries", "14"],
  ["Media contact", "info@repulabs.com"],
];

const KIT = [
  "Logos in SVG and PNG",
  "Brand colour hex codes",
  "Product screenshots",
  "Founder headshots",
  "200-word company description",
];

export function PressView() {
  return (
    <GlassPage>
      <PageHero
        eyebrow="Press"
        icon={<Megaphone size={13} strokeWidth={2.2} />}
        title="Everything you need to write about Repulabs."
        description="Press kit, founder bios, product screenshots and a logo pack, all under permissive terms for editorial use."
      >
        <HeroButton href="/brand">
          <Download size={15} /> Download press kit
        </HeroButton>
        <HeroButton href="mailto:info@repulabs.com" ghost>
          Contact media team
        </HeroButton>
      </PageHero>

      <PageSection>
        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="glass-surface glass-surface--raised flex flex-col rounded-[26px] p-7 sm:p-8">
            <IconTile>
              <Download size={19} />
            </IconTile>
            <h2 className="mt-5 text-[24px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
              Press kit
            </h2>
            <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: G.mute }}>
              The full package, ready to drop into a story.
            </p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {KIT.map((k) => (
                <li
                  key={k}
                  className="rounded-[14px] px-4 py-3 text-[14px] font-medium"
                  style={{ background: G.fill }}
                >
                  {k}
                </li>
              ))}
            </ul>
            <a
              href="/brand"
              className="mt-6 inline-flex h-11 w-max items-center gap-2 rounded-full px-5 text-[14px] font-semibold text-white"
              style={{ background: G.pri, boxShadow: "0 12px 24px -12px rgba(37,99,235,.9)" }}
            >
              Download press kit <ArrowUpRight size={15} />
            </a>
          </div>

          <div className="flex flex-col gap-5">
            <div className="glass-surface glass-surface--raised rounded-[26px] p-7 sm:p-8">
              <IconTile>
                <Mail size={19} />
              </IconTile>
              <h2 className="mt-5 text-[24px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
                Media contact
              </h2>
              <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: G.mute }}>
                For interview requests, expert commentary or briefing materials. We respond within
                24 hours on business days.
              </p>
              <a
                href="mailto:info@repulabs.com"
                className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold"
                style={{ color: G.pri }}
              >
                info@repulabs.com <ArrowUpRight size={15} />
              </a>
            </div>

            <div className="glass-surface rounded-[26px] p-6 sm:p-7">
              <MonoLabel>Fast facts</MonoLabel>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {FACTS.map(([k, v]) => (
                  <div key={k} className="rounded-[14px] px-4 py-3" style={{ background: G.fill }}>
                    <dt className="text-[12px]" style={{ color: G.mute }}>
                      {k}
                    </dt>
                    <dd className="mt-0.5 truncate text-[15px] font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </PageSection>

      <PageSection className="!pt-0" width={1120}>
        <SectionTitle eyebrow="In the news" title="Recent coverage" />
        <div className="mt-8 flex flex-col gap-3">
          {COVERAGE.map((c) => (
            <div
              key={c.title}
              className="glass-surface glass-surface--hover group flex items-center gap-4 rounded-[22px] p-4 sm:p-5"
            >
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] text-[15px] font-bold"
                style={{ background: G.tint, color: G.pri }}
              >
                {c.outlet.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <MonoLabel color={G.pri}>
                  {c.outlet} · {c.date}
                </MonoLabel>
                <div
                  className="mt-1 text-[16.5px] font-semibold leading-snug"
                  style={{ letterSpacing: "-0.015em" }}
                >
                  {c.title}
                </div>
              </div>
              <span
                className="hidden h-10 w-10 shrink-0 place-items-center rounded-full transition-transform group-hover:-rotate-45 sm:grid"
                style={{
                  background: "#ffffff",
                  color: G.pri,
                  boxShadow: "0 6px 16px -8px rgba(16,24,40,.3)",
                }}
              >
                <ArrowUpRight size={16} />
              </span>
            </div>
          ))}
        </div>
      </PageSection>
    </GlassPage>
  );
}
