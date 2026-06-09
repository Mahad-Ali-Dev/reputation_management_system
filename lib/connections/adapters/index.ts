/**
 * Adapter registry — the central map the cron + sync engine iterate.
 *
 * `getAdapter(provider)` resolves EVERY provider string (registry ids + the
 * connection-row provider values the OAuth callbacks write, e.g. `square`,
 * `meta`) to a concrete adapter, falling back to a no-op so iteration is always
 * safe (no missing-mapping crash). The no-op returns `[]` and makes no calls.
 *
 * The set of contact-syncing adapters is small and explicit; everything else is
 * a no-op until its adapter lands. This is the single place to register a new
 * provider sync.
 */

import { cloverAdapter } from "./clover";
import { hubspotAdapter } from "./hubspot";
import { metaAdapter } from "./meta";
import { makeNoopAdapter } from "./noop";
import { quickbooksAdapter } from "./quickbooks";
import { salesforceAdapter } from "./salesforce";
import { shopifyAdapter } from "./shopify";
import { squareAdapter } from "./square";
import { toastAdapter } from "./toast";
import type { ConnectionAdapter } from "./types";
import { wixAdapter } from "./wix";
import { woocommerceAdapter } from "./woocommerce";
import { xeroAdapter } from "./xero";
import { zohoAdapter } from "./zoho";

/**
 * Explicit adapter table. Keys are the provider strings used either by the
 * registry tile id OR the `Connection.provider` written by a callback. Both
 * `square` (callback) and `square_pos` (registry tile) point at the same Square
 * adapter so the UI tile and the live row resolve identically.
 */
const ADAPTERS: Record<string, ConnectionAdapter> = {
  hubspot: hubspotAdapter,
  salesforce: salesforceAdapter,
  zoho: zohoAdapter,
  shopify: shopifyAdapter,
  wix: wixAdapter,
  woocommerce: woocommerceAdapter,
  quickbooks: quickbooksAdapter,
  xero: xeroAdapter,
  square: squareAdapter,
  square_pos: squareAdapter,
  meta: metaAdapter,
  toast: toastAdapter,
  toast_pos: toastAdapter,
  clover: cloverAdapter,
  clover_pos: cloverAdapter,
};

/** Memoize no-op adapters per provider so identity is stable across calls. */
const noopCache = new Map<string, ConnectionAdapter>();

/**
 * Resolve a provider to its adapter. Never returns null — unknown providers get
 * a no-op so the cron can iterate the entire registry safely.
 */
export function getAdapter(provider: string): ConnectionAdapter {
  const direct = ADAPTERS[provider];
  if (direct) return direct;
  let noop = noopCache.get(provider);
  if (!noop) {
    noop = makeNoopAdapter(provider);
    noopCache.set(provider, noop);
  }
  return noop;
}

/** The provider ids that have a real (non-noop) adapter registered. */
export function registeredAdapterIds(): string[] {
  return Object.keys(ADAPTERS);
}

/** True when a provider has a real adapter (not the no-op fallback). */
export function hasRealAdapter(provider: string): boolean {
  return provider in ADAPTERS;
}

export type { ConnectionAdapter } from "./types";
