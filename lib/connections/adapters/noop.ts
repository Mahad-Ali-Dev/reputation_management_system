/**
 * No-op default adapter.
 *
 * Most of the ~60-provider registry has no contact-sync implementation yet.
 * `getAdapter` returns a no-op for any provider without a dedicated module so
 * the cron can iterate EVERY provider safely: `fetchRecentContacts` returns
 * `[]`, `syncs` is `null`, and no network call is ever made.
 */

import { type ConnectionAdapter, defineAdapter } from "./types";

export function makeNoopAdapter(id: string): ConnectionAdapter {
  return defineAdapter({
    id,
    kind: "oauth",
    syncs: null,
    isConfigured: async () => false,
    isEnvEnabled: () => false,
    fetchRecentContacts: async () => [],
  });
}
