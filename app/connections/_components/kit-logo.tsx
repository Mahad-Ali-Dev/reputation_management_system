/**
 * Kit brand-logo resolver (Connections redesign).
 *
 * Maps a provider id → the REAL delivered kit brand SVG asset under
 * `public/assets/repulabs/connections/`. These are the high-fidelity marks
 * shipped in the design kit (brand-accurate colour). Providers the kit didn't
 * ship a mark for fall back to the shared inline `<BrandLogo>` (simple-icons).
 *
 * Server-safe (renders a plain <img> or the server-safe BrandLogo) — usable
 * from both the RSC page and the client islands.
 */

import { BrandLogo } from "@/components/shell/brand-logo";
import type { CSSProperties } from "react";

/** provider id (registry ∪ overlay ∪ raw connection string) → kit asset file. */
const KIT_ASSET: Record<string, string> = {
  hubspot: "hubspot.svg",
  salesforce: "salesforce.svg",
  zoho: "zoho.svg",
  shopify: "shopify.svg",
  quickbooks: "quickbooks.svg",
  xero: "xero.svg",
  mailchimp: "mailchimp.svg",
  klaviyo: "klaviyo.svg",
  brevo: "brevo.svg",
  convertkit: "convertkit.svg",
  omnisend: "omnisend.svg",
  squarespace: "squarespace.svg",
  google_business: "google.svg",
  google: "google.svg",
  meta: "meta.svg",
  csv_import: "csv.svg",
};

const BASE = "/assets/repulabs/connections/";

export function KitLogo({
  provider,
  size = 22,
  alt = "",
  style,
}: {
  provider: string;
  size?: number;
  alt?: string;
  style?: CSSProperties;
}) {
  const asset = KIT_ASSET[provider];
  if (asset) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${BASE}${asset}`}
        alt={alt}
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: "contain", ...style }}
        aria-hidden={alt === "" ? true : undefined}
      />
    );
  }
  // Fall back to the shared inline brand marks (Meta/Google/Square/etc.).
  return <BrandLogo provider={provider} size={size} style={style} />;
}

/** True when the kit ships a dedicated mark for this provider. */
export function hasKitLogo(provider: string): boolean {
  return provider in KIT_ASSET;
}
