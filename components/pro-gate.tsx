"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { FeatureKey } from "@/lib/billing/feature-access";

/**
 * `<ProGate>` + the shared padlock / upgrade-CTA UI (A3).
 *
 * The gold padlock, the "FREE PLAN" badge, the upgrade card, and the
 * `/subscription?feature=<key>` route helper all live here so the sidebar
 * padlock, the `TabBar` locked tabs, and `<ProGateServer>`'s default fallback
 * all read as ONE product. `<ProGate>` itself is the client overlay used to wrap
 * a Pro feature when the entitlement was decided server-side.
 *
 * IMPORTANT: this is presentation only. `hasAccess` is computed by a server
 * parent that already ran `orgHasFeature` — the client gate NEVER fetches
 * entitlement itself (keeps the decision server-authoritative and avoids
 * leaking gated data). Every paid server action / API route behind the feature
 * must still call `assertEntitled(orgId)`.
 */

/** Canonical upgrade route for any locked affordance. */
export function upgradeHref(feature?: FeatureKey | string): string {
  return feature ? `/subscription?feature=${encodeURIComponent(feature)}` : "/subscription";
}

/** Per-feature default copy for the lock card heading + blurb. */
const FEATURE_COPY: Record<FeatureKey, { title: string; description: string }> = {
  ai_autopilot: {
    title: "Reputation Autopilot",
    description: "Let AI monitor, draft, and escalate across your reputation — on a Pro plan.",
  },
  competitor_intel: {
    title: "Competitor Insights",
    description: "Track competitors and benchmark your local presence with a Pro plan.",
  },
  image_creatives: {
    title: "AI Image Creatives",
    description: "Generate on-brand post images with AI — available on Pro.",
  },
  advanced_inbox: {
    title: "Advanced Inbox",
    description: "Moderation, SMS handoff, and AI triage are part of Pro.",
  },
  surveys_insights: {
    title: "Survey Insights",
    description: "Turn survey responses into AI-summarized themes with a Pro plan.",
  },
  rank_tracking: {
    title: "Rank Tracking",
    description: "Track keyword ranks for your locations — upgrade to Pro.",
  },
};

function copyFor(feature: FeatureKey, title?: string, description?: string) {
  const base = FEATURE_COPY[feature];
  return {
    title: title ?? base?.title ?? "Pro feature",
    description:
      description ?? base?.description ?? "This feature is available on a Pro plan.",
  };
}

/**
 * Small "FREE PLAN" pill — the same affordance shown next to locked nav items
 * and on the lock card. Reuses the `.chip` design-system class with a gold tint.
 */
export function FreePlanBadge({ style }: { style?: CSSProperties }) {
  return (
    <span
      className="chip"
      style={{
        height: 18,
        padding: "0 7px",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: "var(--warn-soft)",
        color: "var(--warn)",
        ...style,
      }}
    >
      Free plan
    </span>
  );
}

/**
 * The gold padlock used by the sidebar + locked TabBar tabs. Standalone so a
 * locked affordance is visually identical everywhere.
 */
export function LockIcon({ size = 13, style }: { size?: number; style?: CSSProperties }) {
  return <Icon name="lock" size={size} style={{ color: "var(--gold)", ...style }} title="Pro feature" />;
}

/**
 * The upgrade card — the centered lock affordance for an overlay and the
 * default `<ProGateServer>` fallback. Server components can render this too
 * (it's a presentational client component with no client-only state).
 */
export function UpgradeCard({
  feature,
  title,
  description,
  compact,
}: {
  feature: FeatureKey;
  title?: string;
  description?: string;
  /** Tighter padding for use inside an overlay. */
  compact?: boolean;
}) {
  const c = copyFor(feature, title, description);
  return (
    <div
      className="ds-card"
      style={{
        maxWidth: 360,
        textAlign: "center",
        padding: compact ? "20px 22px" : "28px 26px",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: static brand SVG illustration */}
      <img
        src="/assets/repulabs/illustrations/upgrade.svg"
        alt=""
        aria-hidden="true"
        width={compact ? 96 : 128}
        height={compact ? 64 : 85}
        style={{
          display: "block",
          width: "100%",
          maxWidth: compact ? 96 : 128,
          height: "auto",
          margin: "0 auto 12px",
        }}
      />
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
        <FreePlanBadge />
      </div>
      <h3
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.015em",
          color: "var(--ink)",
        }}
      >
        {c.title}
      </h3>
      <p
        style={{
          margin: "6px 0 16px",
          fontSize: 12.5,
          lineHeight: 1.55,
          color: "var(--rl-muted)",
        }}
      >
        {c.description}
      </p>
      <Link href={upgradeHref(feature)} className="btn btn--accent btn--sm" style={{ display: "inline-flex" }}>
        <Icon name="sparkle" size={12} />
        Upgrade to Pro
      </Link>
    </div>
  );
}

export function ProGate({
  feature,
  hasAccess,
  children,
  mode = "overlay",
  title,
  description,
}: {
  feature: FeatureKey;
  /** Computed by the server parent (no client secret). */
  hasAccess: boolean;
  /** The real feature UI. */
  children: ReactNode;
  /**
   * `"overlay"` (default): blur the children behind a centered lock card.
   * `"replace"`: drop the children entirely and show only the lock card.
   */
  mode?: "overlay" | "replace";
  title?: string;
  description?: string;
}) {
  if (hasAccess) return <>{children}</>;

  if (mode === "replace") {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "32px 16px" }}>
        <UpgradeCard feature={feature} title={title} description={description} />
      </div>
    );
  }

  // Overlay: render the real UI (dimmed, non-interactive) with a lock card on top.
  return (
    <div style={{ position: "relative" }}>
      <div
        aria-hidden
        inert
        style={{
          filter: "blur(3px)",
          opacity: 0.55,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <UpgradeCard feature={feature} title={title} description={description} compact />
      </div>
    </div>
  );
}
