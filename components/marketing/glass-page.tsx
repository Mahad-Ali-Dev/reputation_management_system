/**
 * Glass marketing page frame, shared by /about, /customers, /press and
 * /contact (and the same look as /legal and the landing page):
 *
 *   GlassPage    landing nav + glass canvas + marketing footer
 *   PageHero     the rounded brand-blue hero box (eyebrow, title, sub, extras)
 *   PageSection  centred content column with consistent vertical rhythm
 *   SectionTitle eyebrow pill + heading + optional sub
 *   PageCta      closing blue band with a call to action
 */

import { MarketingFooter } from "@/components/landing/marketing-shell";
import { LandingNav } from "@/components/landing/repulabs-landing";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export const G = {
  ink: "#0b1220",
  ink2: "#283449",
  mute: "#5b6473",
  mute2: "#8a93a6",
  pri: "#2563eb",
  tint: "rgba(37,99,235,.1)",
  fill: "rgba(244,247,252,.85)",
  heroBg: "linear-gradient(168deg,#3b82f6 0%,#2563eb 46%,#1e3a8a 100%)",
  iconBg: "linear-gradient(160deg,#3b82f6,#1d4ed8)",
} as const;

export function GlassPage({ children }: { children: ReactNode }) {
  return (
    <main
      className="glass-theme glass-canvas min-h-screen overflow-x-clip"
      data-glass-mode="light"
      style={{ color: G.ink, fontFamily: "var(--f-ui)" }}
    >
      <LandingNav linkBase="/" />
      {children}
      <MarketingFooter />
    </main>
  );
}

export function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11.5px] font-semibold uppercase"
      style={{
        borderColor: onDark ? "rgba(255,255,255,.28)" : "rgba(37,99,235,.18)",
        background: onDark ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.7)",
        color: onDark ? "#ffffff" : G.pri,
        letterSpacing: ".12em",
        fontFamily: "var(--f-mono)",
      }}
    >
      {children}
    </span>
  );
}

export function PageHero({
  eyebrow,
  icon,
  title,
  description,
  children,
}: {
  eyebrow: string;
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Extras under the description: buttons, chips, a switcher. */
  children?: ReactNode;
}) {
  return (
    <section className="px-2.5 pt-2.5 sm:px-4">
      <div
        className="relative mx-auto overflow-hidden rounded-[30px] sm:rounded-[40px]"
        style={{ maxWidth: 1400, background: G.heroBg }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(900px 440px at 50% -8%, rgba(255,255,255,.34), transparent 60%)",
          }}
        />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-5 pb-14 pt-14 text-center sm:pb-16 sm:pt-[72px]">
          <Eyebrow onDark>
            {icon}
            {eyebrow}
          </Eyebrow>
          <h1
            className="mt-6 text-white"
            style={{
              fontSize: "clamp(34px, 5.6vw, 58px)",
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
              fontWeight: 700,
            }}
          >
            {title}
          </h1>
          {description && (
            <p
              className="mt-5 max-w-2xl text-[17px] leading-relaxed"
              style={{ color: "rgba(255,255,255,.82)" }}
            >
              {description}
            </p>
          )}
          {children && (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{children}</div>
          )}
        </div>
      </div>
    </section>
  );
}

/** White pill button for the blue hero. */
export function HeroButton({
  href,
  children,
  ghost = false,
}: { href: string; children: ReactNode; ghost?: boolean }) {
  const external = href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:");
  const cls =
    "inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-transform active:translate-y-px";
  const style = ghost
    ? {
        color: "#ffffff",
        background: "rgba(255,255,255,.12)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.28)",
      }
    : { color: G.pri, background: "#ffffff", boxShadow: "0 10px 24px -12px rgba(0,0,0,.45)" };
  return external ? (
    <a href={href} className={cls} style={style}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  );
}

export function PageSection({
  children,
  width = 1120,
  className = "",
  id,
}: {
  children: ReactNode;
  width?: number;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`mx-auto w-full px-5 py-16 sm:px-6 sm:py-20 ${className}`}
      style={{ maxWidth: width }}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  sub,
  center = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  center?: boolean;
}) {
  return (
    <div
      className={`flex max-w-2xl flex-col gap-3 ${center ? "mx-auto items-center text-center" : "items-start"}`}
    >
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        style={{
          fontSize: "clamp(26px, 3.6vw, 38px)",
          lineHeight: 1.1,
          letterSpacing: "-0.03em",
          fontWeight: 700,
        }}
      >
        {title}
      </h2>
      {sub && <p style={{ fontSize: 16.5, lineHeight: 1.6, color: G.mute }}>{sub}</p>}
    </div>
  );
}

/** Gradient icon tile used on cards. */
export function IconTile({ children, size = 44 }: { children: ReactNode; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[14px] text-white"
      style={{
        width: size,
        height: size,
        background: G.iconBg,
        boxShadow: "0 10px 22px -12px rgba(37,99,235,.8)",
      }}
    >
      {children}
    </span>
  );
}

/** Small mono label above a value. */
export function MonoLabel({ children, color = G.mute2 }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="text-[11px] font-semibold uppercase"
      style={{ color, letterSpacing: ".12em", fontFamily: "var(--f-mono)" }}
    >
      {children}
    </span>
  );
}

export function PageCta({
  title,
  sub,
  primary,
  secondary,
}: {
  title: ReactNode;
  sub?: ReactNode;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-5 pb-20 sm:px-6">
      <div
        className="relative overflow-hidden rounded-[30px] px-6 py-12 text-center sm:px-12 sm:py-14"
        style={{ background: G.heroBg }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(700px 300px at 50% -20%, rgba(255,255,255,.3), transparent 60%)",
          }}
        />
        <div className="relative">
          <h2
            className="mx-auto max-w-2xl text-white"
            style={{
              fontSize: "clamp(26px, 3.6vw, 38px)",
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              fontWeight: 700,
            }}
          >
            {title}
          </h2>
          {sub && (
            <p
              className="mx-auto mt-3 max-w-xl text-[16px] leading-relaxed"
              style={{ color: "rgba(255,255,255,.8)" }}
            >
              {sub}
            </p>
          )}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <HeroButton href={primary.href}>
              {primary.label} <ArrowRight size={15} />
            </HeroButton>
            {secondary && (
              <HeroButton href={secondary.href} ghost>
                {secondary.label}
              </HeroButton>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
