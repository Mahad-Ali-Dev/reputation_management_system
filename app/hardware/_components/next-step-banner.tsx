import { Icon, type IconName } from "@/components/shell/icon";
import { upgradeHref } from "@/lib/billing/upgrade-href";
import { pickBannerVariant } from "@/lib/hardware/queries";
import Link from "next/link";

/**
 * Module 04 — the contextual next-step banner.
 *
 *  - Pro  : green gradient, "All devices connected! Next: Train your AI →"
 *           → /ai/training (the real AI knowledge-base route).
 *  - Free : gold→violet gradient, "Unlock AI-Powered Review Management"
 *           + "Upgrade to Pro" → /subscription?feature=ai_autopilot.
 *
 * This is a page-LOCAL presentational branch, not a gate — it never hides the
 * device list (everyone can view their devices). The Free/Pro decision is made
 * server-side by the page (via the canonical `orgHasFeature`/entitlements) and
 * passed in as `isPro`, so this component stays purely presentational. The
 * actual Pro padlock affordance is the Wave-0 `ProGate` primitive, reused
 * elsewhere — we deliberately do not build a second gate here.
 *
 * Render only when the org has >= 1 connected device (the page decides) — the
 * empty state has its own CTA.
 */
export function NextStepBanner({ isPro }: { isPro: boolean }) {
  const variant = pickBannerVariant(isPro);

  if (variant === "pro") {
    return (
      <Banner
        gradient="linear-gradient(135deg, var(--ok) 0%, #0d9488 100%)"
        icon="sparkle"
        eyebrow="All devices connected"
        title="Your scans are flowing — now teach the AI to reply"
        body="Train your AI on your business so it can draft on-brand responses to every review you collect."
        cta={
          <Link
            href="/ai/training"
            className="btn"
            style={{
              background: "#fff",
              color: "#047857",
              border: "none",
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Train your AI
            <Icon name="arrowR" size={13} />
          </Link>
        }
      />
    );
  }

  return (
    <Banner
      gradient="linear-gradient(135deg, var(--gold) 0%, #7c3aed 100%)"
      icon="lock"
      eyebrow="Pro feature"
      title="Unlock AI-Powered Review Management"
      body="Upgrade to Pro to let AI monitor every scan-driven review and draft replies for you automatically."
      cta={
        <Link
          href={upgradeHref("ai_autopilot")}
          className="btn"
          style={{
            background: "#fff",
            color: "#b45309",
            border: "none",
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={13} />
          Upgrade to Pro
        </Link>
      }
    />
  );
}

function Banner({
  gradient,
  icon,
  eyebrow,
  title,
  body,
  cta,
}: {
  gradient: string;
  icon: IconName;
  eyebrow: string;
  title: string;
  body: string;
  cta: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: gradient,
        borderRadius: "var(--r-md)",
        padding: "18px 20px",
        marginBottom: 18,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        boxShadow: "0 10px 30px -12px rgba(11,13,14,.45)",
      }}
    >
      <span
        aria-hidden
        style={{
          display: "grid",
          placeItems: "center",
          width: 44,
          height: 44,
          flex: "0 0 44px",
          borderRadius: 12,
          background: "rgba(255,255,255,.2)",
          color: "#fff",
        }}
      >
        <Icon name={icon} size={22} />
      </span>
      <div style={{ minWidth: 220, flex: 1 }}>
        <div
          className="mono"
          style={{
            fontSize: 10,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            opacity: 0.85,
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em", marginTop: 3 }}>
          {title}
        </div>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.5, opacity: 0.92 }}>{body}</p>
      </div>
      {cta}
    </div>
  );
}
