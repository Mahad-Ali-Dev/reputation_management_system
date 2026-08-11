/**
 * Adapter metadata OVERLAY for the Connections UI + sync engine.
 *
 * The static provider catalog (`lib/providers/registry.ts`) is a shared,
 * frozen-for-this-wave file, so module 14_connections does NOT edit it.
 * Instead this overlay augments it, self-contained, with the three pieces the
 * spec asked the registry to carry:
 *
 *   1. A combined **Meta** entry (one OAuth → Facebook Pages + Instagram).
 *   2. `legacy` markers for the standalone `facebook`/`instagram` registry
 *      entries (hidden from the new accordion; kept so old connections resolve).
 *   3. Per-provider `connType` + `syncs` hints so the UI/sync engine can branch.
 *
 * The accordion composes `registry` ∪ `META_PROVIDER`, applies `legacy` hiding,
 * and reads `connType`/`syncs` from `PROVIDER_META`. Nothing here touches the
 * registry module.
 */

import type { ProviderCategory, ProviderEntry } from "@/lib/providers/registry";
import type { AdapterKind, AdapterSyncKind } from "./types";

/** Per-provider UI/sync hints, keyed by provider id. */
export type ProviderMeta = {
  connType: AdapterKind;
  syncs: AdapterSyncKind;
  /** Hidden from the new accordion (superseded), but still resolvable. */
  legacy?: boolean;
};

/**
 * The combined Meta entry. `ready:false` until Meta App Review approves the
 * app; the OAuth route is built + env-gated. Scopes cover FB Pages + IG
 * Business so a SINGLE consent powers both the inbox (Step 9) and post creator
 * (Step 10).
 */
export const META_PROVIDER: ProviderEntry = {
  id: "meta",
  displayName: "Meta (Facebook + Instagram)",
  category: "social" as ProviderCategory,
  description:
    "One connection for Facebook Pages and Instagram Business — read comments & DMs, publish and schedule posts.",
  ready: false,
  blockerNote:
    "Requires Meta App Review (2–6 weeks). The combined OAuth flow is built — submit your app at developers.facebook.com, then paste the App ID/Secret.",
  /**
   * Split by the FEATURE each permission serves, because Meta App Review
   * requires a working screencast per permission — asking for one you can't
   * demonstrate gets the whole submission bounced.
   *
   * PUBLISHING (Post Creator — shippable today):
   *   instagram_content_publish is REQUIRED by the IG adapter's
   *   /media → /media_publish calls. It was missing, so Instagram posting would
   *   have failed with a permission error even after review passed — and adding
   *   a permission later means ANOTHER multi-week review cycle.
   *
   * INBOX (comments + DMs) — these serve the Unified Inbox, which is currently
   * behind the Coming Soon lock and therefore NOT demonstrable in a screencast.
   * Submit them with the inbox release, not before.
   */
  scopes: [
    // Publishing
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
    "business_management",
    // Inbox — re-enable when Unified Inbox ships (see LOCKED_MODULES)
    // "pages_manage_engagement",
    // "instagram_manage_comments",
    // "instagram_manage_messages",
  ],
  oauthUrl: "https://www.facebook.com/v19.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
  logoEmoji: "🟦",
  docsUrl: "https://developers.facebook.com/docs/facebook-login",
};

/**
 * connType/syncs/legacy overlay. Only providers that differ from the default
 * (oauth + no sync) need an entry; the lookup falls back to a safe default.
 */
export const PROVIDER_META: Record<string, ProviderMeta> = {
  // ── Contact-syncing providers (the data spine) ──────────────────────────
  hubspot: { connType: "oauth", syncs: "contacts" },
  mailchimp: { connType: "oauth", syncs: "contacts" },
  klaviyo: { connType: "oauth", syncs: "contacts" },
  shopify: { connType: "oauth", syncs: "contacts" },
  quickbooks: { connType: "oauth", syncs: "contacts" },
  xero: { connType: "oauth", syncs: "contacts" },
  square: { connType: "oauth", syncs: "contacts" },
  // The registry's POS id for Square is `square_pos`; the OAuth callback writes
  // `square`. Both map to the contacts adapter so the UI tile and the live
  // connection row resolve to the same behaviour.
  square_pos: { connType: "oauth", syncs: "contacts" },
  // ── Reviews ─────────────────────────────────────────────────────────────
  google_business: { connType: "oauth", syncs: "reviews" },
  // ── Social (combined Meta) ──────────────────────────────────────────────
  meta: { connType: "oauth", syncs: "social" },
  // WhatsApp connects via the manager-gated paste form (Phone Number ID +
  // permanent access token), not OAuth — `api_key` makes the UI route the
  // Connect action to /connections/whatsapp where that form lives.
  whatsapp: { connType: "api_key", syncs: "social" },
  linkedin: { connType: "oauth", syncs: "social" },
  // ── API-key paste providers (no OAuth) ──────────────────────────────────
  // These authenticate with a pasted API key (+ optional account/store id),
  // not OAuth. `connType:"api_key"` routes their Connect → the manage-page
  // paste form (the generic ApiKeyConnectPanel), exactly like WhatsApp. Their
  // field specs live in app/connections/_lib/api-key-fields.ts.
  activecampaign: { connType: "api_key", syncs: "contacts" },
  convertkit: { connType: "api_key", syncs: "contacts" },
  brevo: { connType: "api_key", syncs: "contacts" },
  omnisend: { connType: "api_key", syncs: "contacts" },
  getresponse: { connType: "api_key", syncs: "contacts" },
  squarespace: { connType: "api_key", syncs: "contacts" },
  // ── Embed / import ──────────────────────────────────────────────────────
  website_widget: { connType: "embed", syncs: null },
  csv_import: { connType: "csv", syncs: null },
  // ── New POS adapters (env-gated, no live calls by default) ──────────────
  toast: { connType: "oauth", syncs: "contacts" },
  clover: { connType: "oauth", syncs: "contacts" },
  // ── Legacy standalone social entries — hidden, replaced by `meta` ───────
  facebook: { connType: "oauth", syncs: "social", legacy: true },
  instagram: { connType: "oauth", syncs: "social", legacy: true },
};

/** Safe default for any provider not in the overlay. */
const DEFAULT_META: ProviderMeta = { connType: "oauth", syncs: null };

export function getProviderMeta(providerId: string): ProviderMeta {
  return PROVIDER_META[providerId] ?? DEFAULT_META;
}

export function isLegacyProvider(providerId: string): boolean {
  return PROVIDER_META[providerId]?.legacy === true;
}
