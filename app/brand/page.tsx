import { MarketingShell, StubHero } from "@/components/landing/marketing-shell";
import { Download } from "lucide-react";
import Image from "next/image";

export const dynamic = "force-static";

export const metadata = {
  title: "Brand assets · Repulabs",
  description: "Logos, color palette, typography, and usage guidelines for the Repulabs brand.",
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

const COLORS = [
  { name: "Ink", hex: "#0B0D0E", role: "Primary text + dark surfaces" },
  { name: "Primary", hex: "#2563EB", role: "CTAs, accents, brand wordmark" },
  { name: "Mint 50", hex: "#ECFDF7", role: "Success backgrounds + pill chips" },
  { name: "Surface", hex: "#FFFFFF", role: "Cards, panels" },
  { name: "Surface 2", hex: "#FAFBF8", role: "Page backgrounds" },
  { name: "Line", hex: "#ECEEEA", role: "Borders, dividers" },
];

export default function BrandPage() {
  return (
    <MarketingShell>
      <StubHero
        kicker="Brand assets"
        title="The Repulabs brand kit."
        description="Use freely in editorial, partner, and integration contexts. Don't recolor the wordmark or place it on backgrounds with less than 4.5:1 contrast."
      />

      <section className="mx-auto max-w-[1080px] px-6 py-16">
        <h2
          style={{
            fontSize: "clamp(22px, 3vw, 30px)",
            fontWeight: 600,
            letterSpacing: "-0.025em",
          }}
        >
          Logo
        </h2>
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          <div
            className="rounded-2xl p-12 text-center"
            style={{ background: C.surface, border: `1px solid ${C.line}` }}
          >
            <Image
              src="/favicon.png"
              alt="Repulabs mark"
              width={140}
              height={140}
              style={{ display: "inline-block", borderRadius: 28 }}
              priority
            />
            <div
              className="mt-4"
              style={{
                fontSize: 11,
                color: C.mute,
                fontFamily: "var(--f-mono)",
                letterSpacing: ".12em",
                fontWeight: 600,
              }}
            >
              MARK · 1254×1254 PNG
            </div>
            <a
              href="/favicon.png"
              download
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: C.line, color: C.ink2, textDecoration: "none" }}
            >
              <Download size={11} />
              Download PNG
            </a>
          </div>

          <div
            className="rounded-2xl p-12 text-center"
            style={{ background: C.ink, border: `1px solid ${C.ink}` }}
          >
            <Image
              src="/favicon.png"
              alt="Repulabs mark"
              width={140}
              height={140}
              style={{ display: "inline-block", borderRadius: 28 }}
            />
            <div
              className="mt-4"
              style={{
                fontSize: 11,
                color: "#9aa1ad",
                fontFamily: "var(--f-mono)",
                letterSpacing: ".12em",
                fontWeight: 600,
              }}
            >
              MARK ON DARK · USE WITH CARE
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1080px] px-6 pb-16">
        <h2
          style={{
            fontSize: "clamp(22px, 3vw, 30px)",
            fontWeight: 600,
            letterSpacing: "-0.025em",
          }}
        >
          Color palette
        </h2>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {COLORS.map((c) => (
            <div
              key={c.hex}
              className="rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${C.line}` }}
            >
              <div style={{ background: c.hex, height: 92, borderBottom: `1px solid ${C.line}` }} />
              <div style={{ padding: "14px 16px 16px", background: C.surface }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    color: C.ink,
                  }}
                >
                  {c.name}
                </div>
                <div
                  className="mt-1"
                  style={{
                    fontSize: 11.5,
                    color: C.mute,
                    fontFamily: "var(--f-mono)",
                  }}
                >
                  {c.hex}
                </div>
                <div className="mt-2" style={{ fontSize: 11.5, color: C.mute }}>
                  {c.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        style={{ background: C.surface2, borderTop: `1px solid ${C.line}` }}
        className="border-b"
      >
        <div className="mx-auto max-w-[760px] px-6 py-16">
          <h2
            style={{
              fontSize: "clamp(22px, 3vw, 30px)",
              fontWeight: 600,
              letterSpacing: "-0.025em",
            }}
          >
            Usage guidelines
          </h2>
          <ul className="mt-6 space-y-3" style={{ fontSize: 14, color: C.ink2, lineHeight: 1.65 }}>
            <li>
              ✅ Use the wordmark with the favicon to its left, lockup gap set to ~22% of mark
              height (handled automatically by the <code>{`<Logo>`}</code> component in our
              codebase).
            </li>
            <li>
              ✅ Use the wordmark in original color (ink with the &ldquo;labs&rdquo; suffix in brand
              primary blue) on light backgrounds with 4.5:1+ contrast.
            </li>
            <li>
              ❌ Don&rsquo;t rotate, skew, recolor, outline, or apply effects to the mark or
              wordmark.
            </li>
            <li>
              ❌ Don&rsquo;t place the wordmark over busy imagery or backgrounds that drop the
              contrast ratio below 4.5:1.
            </li>
            <li>
              ❌ Don&rsquo;t imply endorsement use of brand assets does not signal partnership
              unless explicitly authorized.
            </li>
          </ul>
        </div>
      </section>
    </MarketingShell>
  );
}
