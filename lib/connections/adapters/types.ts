/**
 * Provider-adapter framework — the single contract every Connections provider
 * implements (module 14_connections, Wave 3a).
 *
 * The adapter layer sits ON TOP of the proven OAuth framework
 * (`lib/connections/oauth-helpers.ts` + `lib/oauth/state.ts` + `lib/crypto`).
 * It does NOT reimplement crypto, state, or token storage — it standardises:
 *   - how a provider declares its connection KIND (oauth / api_key / embed / csv)
 *   - what it SYNCS into the data spine (contacts / social / reviews / nothing)
 *   - whether it is CONFIGURED (admin pasted creds in `provider_apps`) and/or
 *     ENV-ENABLED (creds live in env for adapters that read env first)
 *   - one canonical data pull: `fetchRecentContacts(ctx)` (CRM/POS/e-comm/accounting)
 *
 * EVERYTHING here is env/credential gated. With no creds an adapter reports
 * `{ available:false }` and `fetchRecentContacts` returns `[]` making ZERO
 * network calls. No paid/external API is ever hit on a default code path.
 */

/** What an adapter feeds the data spine. `null` = nothing to sync (yet). */
export type AdapterSyncKind = "contacts" | "social" | "reviews" | null;

/** How a connection is established. */
export type AdapterKind = "oauth" | "api_key" | "embed" | "csv";

/**
 * A contact normalized out of an arbitrary provider payload, ready to upsert
 * into the `Contact` directory (Step 12). `externalId` powers idempotent
 * dedupe on `(organizationId, source, externalId)`.
 */
export type NormalizedContact = {
  /** Provider's stable id for this record (customer/contact id). */
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  /** Original provider payload (kept for debugging / future enrichment). */
  raw: unknown;
};

/**
 * Everything `fetchRecentContacts` needs. The token is already decrypted by the
 * sync engine (which owns the envelope-encryption read) — adapters never touch
 * ciphertext.
 */
export type AdapterSyncCtx = {
  orgId: string;
  establishmentId: string | null;
  /** Decrypted OAuth access token (or API key) for the live connection. */
  accessToken: string;
  /** Pull window — default 30 days. */
  sinceDays: number;
  /**
   * Provider-specific connection metadata captured at connect time
   * (e.g. Shopify shop domain, Xero tenantId, Square merchant id). Read from
   * `connection.externalId` / `connection.accountLabel` by the engine.
   */
  externalId: string | null;
  accountLabel: string | null;
};

/** Availability report — why an adapter can or cannot run. */
export type AdapterAvailability = {
  available: boolean;
  /** Stable reason code when unavailable (e.g. "no_provider_app", "no_env"). */
  reason: string | null;
};

/**
 * The contract. `id` matches the `Connection.provider` string the OAuth
 * callbacks write (and the registry provider id where they line up).
 */
export type ConnectionAdapter = {
  id: string;
  kind: AdapterKind;
  syncs: AdapterSyncKind;
  /**
   * True when the admin has configured an OAuth app for this provider in
   * `provider_apps` (async — reads the DB via `loadProviderApp`).
   */
  isConfigured: () => Promise<boolean>;
  /**
   * True when adapter-specific env credentials are present. Synchronous and
   * cheap — used by the UI/sync engine to decide whether to even attempt a
   * fetch. Adapters with no env-first creds return `false` (they rely on
   * `isConfigured`).
   */
  isEnvEnabled: () => boolean;
  /**
   * Combined gate: configured OR env-enabled. The cron + sync engine call this
   * before attempting any network pull. Default impl in `defineAdapter`.
   */
  availability: () => Promise<AdapterAvailability>;
  /**
   * Pull recent contacts. MUST return `[]` (and make NO network call) when the
   * provider is unconfigured. Only providers with `syncs === "contacts"`
   * implement a real fetch; others inherit the no-op.
   */
  fetchRecentContacts: (ctx: AdapterSyncCtx) => Promise<NormalizedContact[]>;
};

/** Default sinceDays for a sync pull. */
export const DEFAULT_SINCE_DAYS = 30;

/**
 * Helper to build an adapter with sane defaults so each provider module only
 * specifies what differs. `availability` is derived from `isConfigured` +
 * `isEnvEnabled` unless overridden.
 */
export function defineAdapter(
  spec: Partial<ConnectionAdapter> & Pick<ConnectionAdapter, "id" | "kind" | "syncs">,
): ConnectionAdapter {
  const isConfigured = spec.isConfigured ?? (async () => false);
  const isEnvEnabled = spec.isEnvEnabled ?? (() => false);
  const fetchRecentContacts = spec.fetchRecentContacts ?? (async () => []);
  const availability =
    spec.availability ??
    (async (): Promise<AdapterAvailability> => {
      if (isEnvEnabled()) return { available: true, reason: null };
      if (await isConfigured()) return { available: true, reason: null };
      return { available: false, reason: "not_configured" };
    });
  return {
    id: spec.id,
    kind: spec.kind,
    syncs: spec.syncs,
    isConfigured,
    isEnvEnabled,
    availability,
    fetchRecentContacts,
  };
}
