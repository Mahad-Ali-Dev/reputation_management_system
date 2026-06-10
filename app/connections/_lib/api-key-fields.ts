/**
 * API-key connection field specs — the per-provider credential blueprint that
 * drives the generic `ApiKeyConnectPanel` (the UI) and `connectApiKeyProvider`
 * (the server action).
 *
 * Background: a handful of registry providers authenticate with a pasted API
 * key / store id rather than OAuth (ActiveCampaign, ConvertKit, Brevo,
 * Omnisend, Squarespace, …). WhatsApp pioneered the "manager pastes
 * credentials" pattern; this module GENERALISES it so every such provider is
 * connectable from a single reusable form.
 *
 * IMPORTANT: this is a PLAIN module — NOT `"use server"`. It is imported by both
 * the server page/action and the `"use client"` panel, so it must contain only
 * pure data + pure functions (no DB, no secrets, no async server work). The
 * field VALUES a user types never live here; only the field *shape* does.
 *
 * The set of provider ids with a spec here IS the source of truth for which
 * registry providers are "api_key" connectable. The Connections UI marks these
 * providers `connType:"api_key"` (lib/connections/adapters/meta-overlay.ts) so
 * the accordion routes their Connect → this manage-page form, exactly like
 * WhatsApp.
 */

/** A single credential input the form renders. */
export type ApiKeyField = {
  /** FormData key + input name (e.g. "apiKey", "accountId"). */
  name: string;
  /** Visible label. */
  label: string;
  /** `password` masks the value (secrets); `text` for non-secret ids. */
  type: "text" | "password";
  /** Placeholder shown in the empty input. */
  placeholder?: string;
  /** Helper text under the input. */
  hint?: string;
  /** Render the value in a monospace font (ids/keys read better mono). */
  mono?: boolean;
  /** `inputMode` hint for on-screen keyboards (e.g. "numeric"). */
  inputMode?: "text" | "numeric";
  /** Minimum trimmed length to accept (default 1). */
  minLength?: number;
  /** Optional stricter pattern the trimmed value must fully match. */
  pattern?: RegExp;
  /** Friendly message shown when this field fails validation. */
  invalidMessage?: string;
  /** Whether the field is required (default true). */
  required?: boolean;
};

/** The full connect blueprint for one api_key provider. */
export type ApiKeyProviderSpec = {
  /** Registry provider id (Connection.provider). */
  provider: string;
  /** Human name, shown in the panel heading + button. */
  displayName: string;
  /** One-line instruction under the panel heading. */
  blurb: string;
  /** Ordered credential fields the user must paste. */
  fields: ApiKeyField[];
  /** OAuth-equivalent scope strings recorded on the saved connection. */
  scopes: string[];
  /**
   * Which field name holds the connection's natural key (externalId) — the
   * stable per-account id the webhook/sync resolves by (e.g. WhatsApp's
   * phone_number_id, a Squarespace/store account id). When omitted, the
   * connection has no external natural key and we dedupe on (org, provider).
   */
  externalIdField?: string;
  /**
   * Which field name holds the SECRET token persisted (envelope-encrypted).
   * Defaults to "apiKey".
   */
  tokenField?: string;
};

/** Generic single-API-key blueprint shared by most email/CRM/e-comm providers. */
function singleApiKeySpec(
  provider: string,
  displayName: string,
  opts?: { hint?: string; scopes?: string[] },
): ApiKeyProviderSpec {
  return {
    provider,
    displayName,
    blurb: `Paste your ${displayName} API key. It's stored encrypted and used only to sync your customers.`,
    fields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        placeholder: `Your ${displayName} API key`,
        hint:
          opts?.hint ??
          "Stored encrypted at rest. Create a key with read access in your account settings.",
        minLength: 8,
        invalidMessage: "Paste a valid API key from your account settings (at least 8 characters).",
      },
    ],
    scopes: opts?.scopes ?? ["contacts:read"],
    tokenField: "apiKey",
  };
}

/**
 * The registry of api_key connect specs, keyed by provider id.
 *
 * WhatsApp is the special two-field case (phone_number_id + token). The rest
 * follow the generic single-key blueprint; a couple carry an extra account/
 * store/data-center id field.
 */
export const API_KEY_SPECS = {
  // ── WhatsApp Business (Cloud API) — phone number id + permanent token ─────
  whatsapp: {
    provider: "whatsapp",
    displayName: "WhatsApp Business",
    blurb:
      "Paste your WhatsApp Cloud API Phone Number ID and a permanent access token.",
    fields: [
      {
        name: "phoneNumberId",
        label: "Phone Number ID",
        type: "text",
        placeholder: "e.g. 109876543210987",
        hint:
          'WhatsApp Manager → API Setup → "Phone number ID" (a numeric id, not the phone number).',
        mono: true,
        inputMode: "numeric",
        pattern: /^\d{6,20}$/,
        invalidMessage:
          "That Phone Number ID doesn't look right — it should be the numeric ID from Meta's WhatsApp Manager (not the phone number itself).",
      },
      {
        name: "accessToken",
        label: "Access token",
        type: "password",
        placeholder: "Permanent System User token",
        hint:
          "Stored encrypted at rest. Use a permanent System User token so the connection never expires.",
        minLength: 20,
        invalidMessage:
          "Paste a valid access token. Use a permanent System User token so the connection doesn't expire.",
      },
    ],
    scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
    externalIdField: "phoneNumberId",
    tokenField: "accessToken",
  },

  // ── Email marketing — single API key ─────────────────────────────────────
  activecampaign: {
    provider: "activecampaign",
    displayName: "ActiveCampaign",
    blurb:
      "Paste your ActiveCampaign API URL's account name and API key. Both are in Settings → Developer.",
    fields: [
      {
        name: "accountId",
        label: "Account name",
        type: "text",
        placeholder: "e.g. youraccount (from youraccount.api-us1.com)",
        hint: "The subdomain in your API URL — Settings → Developer → API Access.",
        mono: true,
        minLength: 2,
        invalidMessage: "Enter your ActiveCampaign account name (the subdomain in your API URL).",
      },
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "Your ActiveCampaign API key",
        hint: "Stored encrypted at rest. Settings → Developer → API Access → Key.",
        minLength: 8,
        invalidMessage: "Paste a valid API key from Settings → Developer.",
      },
    ],
    scopes: ["contacts:read"],
    externalIdField: "accountId",
    tokenField: "apiKey",
  },
  convertkit: singleApiKeySpec("convertkit", "ConvertKit", {
    hint: "Stored encrypted at rest. Account Settings → Advanced → API Secret.",
  }),
  brevo: singleApiKeySpec("brevo", "Brevo", {
    hint: "Stored encrypted at rest. SMTP & API → API Keys → create a v3 key.",
  }),
  omnisend: singleApiKeySpec("omnisend", "Omnisend", {
    hint: "Stored encrypted at rest. Store settings → Integrations → API keys.",
  }),
  getresponse: singleApiKeySpec("getresponse", "GetResponse", {
    hint: "Stored encrypted at rest. Account → Integrations & API → API.",
  }),

  // ── E-commerce — single API key / store token ────────────────────────────
  squarespace: {
    provider: "squarespace",
    displayName: "Squarespace",
    blurb: "Paste a Squarespace Commerce API key with Orders read access.",
    fields: [
      {
        name: "apiKey",
        label: "API key",
        type: "password",
        placeholder: "Your Squarespace API key",
        hint:
          "Stored encrypted at rest. Settings → Advanced → Developer API Keys (grant Orders: Read).",
        minLength: 8,
        invalidMessage: "Paste a valid API key from Settings → Advanced → Developer API Keys.",
      },
    ],
    scopes: ["orders:read", "customers:read"],
    tokenField: "apiKey",
  },
} satisfies Record<string, ApiKeyProviderSpec>;

/** Provider ids that connect via the api_key paste form. */
export const API_KEY_PROVIDER_IDS = Object.keys(API_KEY_SPECS);

/** Look up a provider's api_key spec (null if it isn't an api_key provider). */
export function getApiKeySpec(provider: string): ApiKeyProviderSpec | null {
  return (API_KEY_SPECS as Record<string, ApiKeyProviderSpec>)[provider] ?? null;
}

/** True when a provider connects via the api_key paste form. */
export function isApiKeyProvider(provider: string): boolean {
  return provider in API_KEY_SPECS;
}

/** Validation outcome for a submitted field-set. */
export type ApiKeyValidation =
  | {
      ok: true;
      /** Trimmed values keyed by field name. */
      values: Record<string, string>;
      /** The natural key (externalId) or null when the spec has none. */
      externalId: string | null;
      /** The secret token value (the field flagged `tokenField`). */
      token: string;
    }
  | { ok: false; field: string; message: string };

/**
 * Validate a raw `name → value` map against a provider's field spec. Pure +
 * synchronous so it runs identically on the server (the action) — the client
 * relies on native `required`/`pattern` for UX, the server is authoritative.
 *
 * Returns trimmed values plus the derived `externalId` + `token` so the action
 * doesn't re-encode the spec.
 */
export function validateApiKeyFields(
  spec: ApiKeyProviderSpec,
  raw: Record<string, string | undefined>,
): ApiKeyValidation {
  const values: Record<string, string> = {};

  for (const field of spec.fields) {
    const value = String(raw[field.name] ?? "").trim();
    const required = field.required !== false;

    if (!value) {
      if (required) {
        return {
          ok: false,
          field: field.name,
          message: field.invalidMessage ?? `${field.label} is required.`,
        };
      }
      values[field.name] = "";
      continue;
    }

    if (field.minLength != null && value.length < field.minLength) {
      return {
        ok: false,
        field: field.name,
        message: field.invalidMessage ?? `${field.label} is too short.`,
      };
    }
    if (field.pattern && !field.pattern.test(value)) {
      return {
        ok: false,
        field: field.name,
        message: field.invalidMessage ?? `${field.label} doesn't look right.`,
      };
    }
    values[field.name] = value;
  }

  const tokenField = spec.tokenField ?? "apiKey";
  const token = values[tokenField] ?? "";
  if (!token) {
    return {
      ok: false,
      field: tokenField,
      message: "An API key is required.",
    };
  }

  const externalId = spec.externalIdField ? (values[spec.externalIdField] ?? null) : null;

  return { ok: true, values, externalId, token };
}

/**
 * A friendly default account label for a freshly-saved api_key connection when
 * no live probe is available (most providers have none). WhatsApp overrides
 * this with a Graph probe in its action.
 */
export function defaultAccountLabel(spec: ApiKeyProviderSpec, externalId: string | null): string {
  if (externalId) return `${spec.displayName} ${externalId}`;
  return spec.displayName;
}
