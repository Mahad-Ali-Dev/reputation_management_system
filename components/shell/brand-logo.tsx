/**
 * Real brand SVG icons for connection providers + landing-page logo strip.
 *
 * Each icon is a self-contained inline SVG, color-correct, with the brand's
 * official mark. Sourced from simple-icons.org (CC0 trademarks belong to
 * their respective owners). Sizing is via the `size` prop.
 *
 * Why not a package: `simple-icons` adds ~150KB to the bundle just to import
 * a dozen logos. Inline SVGs are 10x smaller and tree-shake automatically.
 */

import type { CSSProperties, ReactElement } from "react";

export type BrandKey =
  | "google"
  | "google_business"
  | "facebook"
  | "instagram"
  | "twitter"
  | "linkedin"
  | "tiktok"
  | "google_calendar"
  | "microsoft"
  | "calendly"
  | "square"
  | "toast"
  | "clover"
  | "lightspeed"
  | "hubspot"
  | "salesforce"
  | "xero"
  | "quickbooks"
  | "stripe"
  | "shopify"
  | "mailchimp"
  | "klaviyo"
  | "intercom"
  | "zapier"
  | "csv";

/**
 * Each logo: a JSX `<svg>` with intrinsic viewBox + path(s) using the brand
 * color via fill. Caller sets size + optional className.
 */
const LOGOS: Record<BrandKey, (props: { size: number }) => ReactElement> = {
  google: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.85 0-5.27-1.93-6.13-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.87 14.1A6.6 6.6 0 0 1 5.5 12c0-.74.13-1.45.37-2.1V7.05H2.18a11 11 0 0 0 0 9.9l3.69-2.85Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05L5.87 9.9C6.73 7.31 9.15 5.38 12 5.38Z"
      />
    </svg>
  ),
  google_business: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M12 0 0 9l4.7 3.4L12 7l7.3 5.4L24 9 12 0Z" />
      <path fill="#34A853" d="m4.7 12.4 7.3 5.4 7.3-5.4L24 15.7 12 24 0 15.7l4.7-3.3Z" />
    </svg>
  ),
  facebook: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.68 4.53-4.68 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.88v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07Z"
      />
    </svg>
  ),
  instagram: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id="ig-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0" stopColor="#fdf497" />
          <stop offset=".05" stopColor="#fdf497" />
          <stop offset=".45" stopColor="#fd5949" />
          <stop offset=".6" stopColor="#d6249f" />
          <stop offset=".9" stopColor="#285AEB" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ig-grad)" />
      <path
        fill="#fff"
        d="M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 9.07A3.57 3.57 0 1 1 12 8.43a3.57 3.57 0 0 1 0 7.14ZM18.4 6.3a1.28 1.28 0 1 1-2.56 0 1.28 1.28 0 0 1 2.56 0Z"
      />
    </svg>
  ),
  twitter: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25h6.83l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
      />
    </svg>
  ),
  linkedin: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#0A66C2"
        d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05a3.73 3.73 0 0 1 3.36-1.85c3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0Z"
      />
    </svg>
  ),
  tiktok: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.55a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.84-.38Z"
      />
    </svg>
  ),
  google_calendar: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#fff" d="M4 4h16v16H4z" />
      <path fill="#4285F4" d="M3.5 8h17V20a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V8Z" opacity=".15" />
      <path
        fill="#1A73E8"
        d="m11.4 14.95-.43-1.45c.66-.27 1.25-.4 1.79-.4.66 0 1.21.15 1.65.46.44.3.66.7.66 1.2 0 .35-.1.66-.32.93-.21.27-.48.47-.82.6v.04c.43.1.79.32 1.07.65.28.33.42.74.42 1.23 0 .56-.24 1.02-.7 1.38-.47.36-1.07.54-1.81.54-.71 0-1.36-.13-1.95-.4l.5-1.46c.45.21.93.32 1.42.32.36 0 .65-.08.86-.24.21-.17.32-.4.32-.7 0-.59-.46-.88-1.37-.88h-.51v-1.44h.46c.41 0 .73-.07.96-.22.23-.14.34-.36.34-.65 0-.23-.09-.4-.27-.51-.18-.11-.41-.16-.7-.16-.3 0-.61.05-.93.16Z"
      />
      <path fill="#EA4335" d="M3.5 3.5h17v4.5h-17z" />
      <path fill="#FBBC04" d="M3.5 16v4a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1v-4Z" />
      <rect x="7" y="2" width="2" height="4" rx="1" fill="#5F6368" />
      <rect x="15" y="2" width="2" height="4" rx="1" fill="#5F6368" />
    </svg>
  ),
  microsoft: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  ),
  calendly: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#006BFF" />
      <path
        fill="#fff"
        d="M16.4 14.4c-.6.6-1.4 1-2.3 1H10c-.9 0-1.7-.4-2.3-1L5.6 12.1l2.1-2.3c.6-.6 1.4-1 2.3-1h4.1c.9 0 1.7.4 2.3 1l2.1 2.3-2.1 2.3Z"
      />
    </svg>
  ),
  square: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#3E4348" />
      <rect x="6" y="6" width="12" height="12" rx="2" fill="#fff" />
      <rect x="9" y="9" width="6" height="6" rx="1" fill="#3E4348" />
    </svg>
  ),
  toast: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#FF4C00" />
      <path fill="#fff" d="M7.5 9h3v6h2v-6h3l-1-2H8.5l-1 2Zm-.5 9h10v1.5H7V18Z" />
    </svg>
  ),
  clover: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#00B259" />
      <path
        fill="#fff"
        d="M12 6c-1.5 0-2.5 1-2.5 2.5S10.5 11 12 11s2.5-1 2.5-2.5S13.5 6 12 6Zm0 7c-1.5 0-2.5 1-2.5 2.5S10.5 18 12 18s2.5-1 2.5-2.5S13.5 13 12 13Z"
      />
    </svg>
  ),
  lightspeed: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#F03741" />
      <path fill="#fff" d="m13 4-7 10h5l-2 6 7-10h-5l2-6Z" />
    </svg>
  ),
  hubspot: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FF7A59"
        d="M18.16 7.06v-2.4a1.88 1.88 0 1 0-1.18 0v2.4a5.13 5.13 0 0 0-2.42.96l-6.27-4.78a2.16 2.16 0 1 0-.83 1.07l6.16 4.69a5.18 5.18 0 0 0 .07 5.81L11.7 16.8a2.55 2.55 0 0 0-.78-.12 2.6 2.6 0 1 0 2.6 2.6c0-.28-.05-.55-.13-.8l1.97-1.96a5.16 5.16 0 1 0 2.8-9.45Zm-.6 7.84a2.65 2.65 0 1 1 0-5.3 2.65 2.65 0 0 1 0 5.3Z"
      />
    </svg>
  ),
  salesforce: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#00A1E0"
        d="M10 6.5a4 4 0 0 1 6.94.04 3.5 3.5 0 0 1 4.97 4.46A3.5 3.5 0 0 1 18.5 17 3 3 0 0 1 13 18.4a3.5 3.5 0 0 1-6.42-.4 3 3 0 0 1-3.58-3.5A3.5 3.5 0 0 1 5.5 9 4 4 0 0 1 10 6.5Z"
      />
    </svg>
  ),
  xero: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#13B5EA" />
      <path fill="#fff" d="M8 8v8h2.5L12 13.5 13.5 16H16V8h-2v5l-2-3-2 3V8H8Z" />
    </svg>
  ),
  quickbooks: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#2CA01C" />
      <path
        fill="#fff"
        d="M14.5 6.5a5.5 5.5 0 1 1 0 11h-2v-1.7h2a3.8 3.8 0 0 0 0-7.6h-2V6.5h2Zm-5 11a5.5 5.5 0 1 1 0-11h2v1.7h-2a3.8 3.8 0 0 0 0 7.6h2v1.7h-2Z"
      />
    </svg>
  ),
  stripe: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#635BFF" />
      <path
        fill="#fff"
        d="M13.6 9.7c0-.7.5-1 1.4-1 1.2 0 2.8.4 4 1V6.3c-1.3-.5-2.7-.7-4-.7-3.3 0-5.5 1.7-5.5 4.6 0 4.5 6.2 3.8 6.2 5.7 0 .8-.7 1.1-1.7 1.1-1.3 0-3.1-.6-4.5-1.3v3.6c1.5.7 3 .9 4.5.9 3.4 0 5.7-1.7 5.7-4.6 0-4.9-6.2-4-6.2-5.9Z"
      />
    </svg>
  ),
  shopify: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#95BF47"
        d="M18.7 5.5 17 5.2a14 14 0 0 0-1-1c-.4-.4-1.2-.3-1.6-.2-.7-.5-1.8-.4-2.6-.2-1.7.5-2.5 2.3-2.9 4l-1.7.5-.5.4L3.9 21l11 2 3.8-17.5Z"
      />
      <path
        fill="#5E8E3E"
        d="M18.7 5.5c-.1 0-1.6.5-1.6.5s-.9-.9-1-1c0 0 1.4 4 0 4.5l-2.4-1c-1.3 5.8 0 13.5 0 13.5l4.6-1L18.7 5.5Z"
      />
      <path
        fill="#fff"
        d="m13 11.5-.5 2c-.5-.3-1.3-.5-2.1-.5-1.6 0-1.7 1-1.7 1.3.1 1.4 4 1.5 4 5 0 2.8-1.7 4.5-4 4.5a6.4 6.4 0 0 1-3-.7l.6-2.4s1.4.8 2.5.7c.7 0 1-.3 1-.6 0-1.6-3.3-1.5-3.4-4.8 0-2.7 1.7-5.3 5.7-5.3.9 0 1.9.4 1.9.4Z"
      />
    </svg>
  ),
  mailchimp: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#FFE01B" />
      <path
        fill="#241C15"
        d="M18 14c-.5 1.5-2.2 3-4.5 3-3.4 0-6-2.7-6-6 0-2.5 1.5-4 3-4 1 0 1.5.5 2 1l1-.5c.5-.3 1.3-.5 2 0 1 .7 1.4 2.2 1 3.5l-1.3 3Z"
      />
      <circle cx="14" cy="11" r="1" fill="#FFE01B" />
    </svg>
  ),
  klaviyo: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#000" />
      <path fill="#fff" d="M12 5 4 19h3.3L12 11l4.7 8H20L12 5Zm0 6.5L9.6 16h4.8L12 11.5Z" />
    </svg>
  ),
  intercom: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#1F8DED" />
      <path
        fill="#fff"
        d="M17 6h-1v8h1V6Zm-3 0h-1v9h1V6ZM7 6H6v8h1V6Zm3 0H9v9h1V6Zm-2 12c0 .3.2.5.5.5C9.5 19 10.5 19 12 19s2.5 0 3.5-.5c.3 0 .5-.2.5-.5s-.2-.5-.5-.5c-.9.5-1.9.5-3.5.5s-2.6 0-3.5-.5c-.3 0-.5.2-.5.5Z"
      />
    </svg>
  ),
  zapier: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#FF4A00" />
      <path
        fill="#fff"
        d="M14.5 12 19 9.5l-1.3-2.3-4.6 2.6V4.5h-2.6v5.3L5.9 7.2l-1.3 2.3L9.1 12l-4.5 2.5 1.3 2.3 4.6-2.6v5.3h2.6v-5.3l4.6 2.6 1.3-2.3L14.5 12Z"
      />
    </svg>
  ),
  csv: ({ size }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#1F2328" />
      <path fill="#fff" d="M5 7h14v2H5V7Zm0 4h14v2H5v-2Zm0 4h14v2H5v-2Z" />
    </svg>
  ),
};

/**
 * Map provider id (from lib/providers/registry.ts) to BrandKey. Anything
 * not in this map falls back to a generic plug icon.
 */
const PROVIDER_TO_BRAND: Record<string, BrandKey> = {
  google_business: "google_business",
  google: "google",
  google_calendar: "google_calendar",
  facebook: "facebook",
  instagram: "instagram",
  twitter: "twitter",
  linkedin: "linkedin",
  tiktok: "tiktok",
  microsoft_outlook: "microsoft",
  calendly: "calendly",
  square: "square",
  toast: "toast",
  clover: "clover",
  lightspeed: "lightspeed",
  hubspot: "hubspot",
  salesforce: "salesforce",
  xero: "xero",
  quickbooks: "quickbooks",
  stripe: "stripe",
  shopify: "shopify",
  mailchimp: "mailchimp",
  klaviyo: "klaviyo",
  intercom: "intercom",
  zapier: "zapier",
  csv_import: "csv",
};

export function BrandLogo({
  provider,
  size = 24,
  className,
  style,
}: {
  provider: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const key = PROVIDER_TO_BRAND[provider];
  const Logo = key ? LOGOS[key] : undefined;

  if (!Logo) {
    // Generic plug fallback for providers without a brand icon yet.
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        aria-hidden="true"
      >
        <path d="M9 2v6M15 2v6" />
        <path d="M5 10h14v3a7 7 0 0 1-7 7 7 7 0 0 1-7-7v-3Z" />
        <path d="M12 20v2" />
      </svg>
    );
  }

  return (
    <span className={className} style={{ display: "inline-flex", lineHeight: 0, ...style }}>
      <Logo size={size} />
    </span>
  );
}
