"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/**
 * `<ConnectionGate>` (00_foundation §A6) — connection-aware control wrapper.
 *
 * Wraps a control (button/form/panel) and, when the required channel/provider is
 * NOT linked, renders it visually disabled with a "Connect {label} →" tooltip +
 * inline note linking to `/connections#<provider>`. When connected, renders the
 * children untouched.
 *
 * Server-authoritative (same pattern as `<ProGate>`): `isConnected` is computed
 * by a server parent via `lib/connections/status.ts#getConnectedProviders`. The
 * client gate NEVER queries connection state itself — it only presents the
 * decision it was handed. (Server actions/routes behind a connection-gated
 * action must still verify the connection themselves; this is presentation.)
 *
 * `AiAssistPanel.enabled/disabledReason` (§A4.7) are designed to feed straight
 * from this — `connectionDisabledReason(...)` builds that `{label, href}` shape.
 */

/** Default human-readable provider names for the tooltip / inline note. */
const PROVIDER_LABELS: Record<string, string> = {
  google_business: "Google Business",
  google: "Google",
  meta: "Facebook",
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X",
  twitter: "X",
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  square: "Square",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  quickbooks: "QuickBooks",
  xero: "Xero",
  mailchimp: "Mailchimp",
  klaviyo: "Klaviyo",
};

/** Human name for a provider key (falls back to a Title-cased key). */
export function providerLabel(provider: string, override?: string): string {
  if (override) return override;
  return (
    PROVIDER_LABELS[provider] ??
    provider
      .split(/[_-]/)
      .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ")
  );
}

/** Canonical connect deep-link for a provider (the Connections page anchor). */
export function connectHrefFor(provider: string): string {
  return `/connections#${encodeURIComponent(provider)}`;
}

/**
 * Build the `{ label, href }` reason shape consumed by
 * `AiAssistPanel.disabledReason` so an AI action that needs a channel is gated
 * with the same copy + link as a `<ConnectionGate>`.
 */
export function connectionDisabledReason(
  provider: string,
  opts?: { label?: string; connectHref?: string },
): { label: string; href: string } {
  const name = providerLabel(provider, opts?.label);
  return {
    label: `Connect ${name}`,
    href: opts?.connectHref ?? connectHrefFor(provider),
  };
}

export function ConnectionGate({
  required,
  isConnected,
  children,
  connectHref,
  label,
  mode = "disable",
}: {
  /** Provider key, e.g. "meta", "google_business". Matches `Connection.provider`. */
  required: string;
  /** Computed server-side from `getConnectedProviders` (no client query). */
  isConnected: boolean;
  /** The control (button/form/panel) to gate. */
  children: ReactNode;
  /** Where "Connect X →" links. Default `/connections#<required>`. */
  connectHref?: string;
  /** Human provider name for the tooltip ("Facebook"). Defaults from `required`. */
  label?: string;
  /**
   * `"disable"` (default): render children visually disabled + a connect note.
   * `"hide"`: render only the connect prompt (children dropped).
   */
  mode?: "disable" | "hide";
}) {
  // Connected → pass through untouched.
  if (isConnected) return <>{children}</>;

  const name = providerLabel(required, label);
  const href = connectHref ?? connectHrefFor(required);
  const tooltip = `Connect ${name} →`;

  const connectLink = (
    <Link
      href={href}
      className="btn btn--xs"
      style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
      title={tooltip}
    >
      <Icon name="plug" size={12} />
      Connect {name}
      <Icon name="arrowR" size={12} aria-hidden />
    </Link>
  );

  if (mode === "hide") {
    return <div className="connection-gate connection-gate--hide">{connectLink}</div>;
  }

  // Disable mode: dim + block the children, overlay an accessible connect note.
  const disabledWrapStyle: CSSProperties = {
    opacity: 0.5,
    pointerEvents: "none",
    userSelect: "none",
    filter: "grayscale(0.4)",
  };

  return (
    <div
      className="connection-gate"
      style={{ display: "inline-flex", flexDirection: "column", gap: 6 }}
      title={tooltip}
    >
      <div aria-disabled inert style={disabledWrapStyle}>
        {children}
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11.5,
          color: "var(--rl-muted)",
        }}
      >
        <Icon name="plug" size={12} style={{ color: "var(--rl-muted-2)" }} />
        <span>
          {name} isn’t connected.{" "}
          <Link href={href} style={{ color: "var(--pri)", fontWeight: 500 }} title={tooltip}>
            Connect {name} →
          </Link>
        </span>
      </div>
    </div>
  );
}
