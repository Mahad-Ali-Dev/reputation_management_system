"use client";

/**
 * Generic API-key connect panel (client island) — Module 14_connections.
 *
 * A single reusable credential form that renders whatever fields a provider's
 * api_key spec declares (most providers need one API key; some need an extra
 * account/store/data-center id). It generalises the original WhatsApp-only
 * paste panel: WhatsApp is now just the two-field (phone_number_id + token)
 * case of the same component.
 *
 * The operator pastes their credentials; the `action` server action
 * (`connectApiKeyProvider`) validates, envelope-encrypts the secret, and
 * persists a `Connection(provider, externalId?)` row exactly like WhatsApp did.
 *
 * RSC SAFETY: this is the only place form state lives. It receives ONLY plain,
 * JSON-safe props from the server page (the field spec + connected flag + error
 * code) and posts to a server action — no Prisma rows or Dates cross the
 * boundary. Secret fields are password inputs; their values are sent once to
 * the action and never round-tripped back to the client.
 */

import { Icon } from "@/components/shell/icon";
import { useFormStatus } from "react-dom";
import type { ApiKeyField } from "../../_lib/api-key-fields";

/** The JSON-safe spec the server page hands to this panel. */
export type ApiKeyPanelSpec = {
  provider: string;
  displayName: string;
  blurb: string;
  fields: ApiKeyField[];
};

/**
 * Map an `?error=` code from the action redirect to a friendly message.
 * The action redirects with `?error=field:<name>` for a specific field (the
 * spec's `invalidMessage` is the authoritative copy, so we re-resolve it here),
 * `?error=not_configured` when the provider CHECK rejects the row, or a generic
 * fallback. Keeping WhatsApp's legacy codes mapped preserves its messaging.
 */
function errorMessage(spec: ApiKeyPanelSpec, code: string | null): string | null {
  if (!code) return null;

  if (code.startsWith("field:")) {
    const fieldName = code.slice("field:".length);
    const field = spec.fields.find((f) => f.name === fieldName);
    if (field?.invalidMessage) return field.invalidMessage;
    if (field) return `Check the ${field.label} and try again.`;
  }

  switch (code) {
    case "not_configured":
    case "whatsapp_not_configured":
      return `Couldn't save the connection ${spec.displayName} isn't enabled on this database yet. Contact your administrator.`;
    // Legacy WhatsApp-specific codes (kept so old links still read well).
    case "invalid_phone_number_id":
      return spec.fields.find((f) => f.name === "phoneNumberId")?.invalidMessage ?? null;
    case "invalid_token":
      return spec.fields.find((f) => f.name === "accessToken")?.invalidMessage ?? null;
    default:
      return `Couldn't connect ${spec.displayName}. Double-check your credentials and try again.`;
  }
}

function SubmitButton({ label, reconnect }: { label: string; reconnect: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--pri" disabled={pending}>
      <Icon name={reconnect ? "refresh" : "plug"} size={13} />
      {pending ? (reconnect ? "Updating…" : "Connecting…") : reconnect ? "Update credentials" : label}
    </button>
  );
}

function Field({ field }: { field: ApiKeyField }) {
  const id = `apikey-${field.name}`;
  return (
    <div className="col" style={{ gap: 6 }}>
      <label htmlFor={id} style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
        {field.label}
      </label>
      <input
        id={id}
        name={field.name}
        type={field.type}
        inputMode={field.inputMode}
        autoComplete="off"
        required={field.required !== false}
        minLength={field.minLength}
        placeholder={field.placeholder}
        className="input"
        style={field.mono ? { fontFamily: "var(--mono, monospace)" } : undefined}
      />
      {field.hint && (
        <span className="dim" style={{ fontSize: 11 }}>
          {field.hint}
        </span>
      )}
    </div>
  );
}

export function ApiKeyConnectPanel({
  spec,
  action,
  connected,
  errorCode,
}: {
  spec: ApiKeyPanelSpec;
  action: (formData: FormData) => void | Promise<void>;
  connected: boolean;
  errorCode: string | null;
}) {
  const err = errorMessage(spec, errorCode);
  const connectLabel = `Connect ${spec.displayName}`;

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div className="row" style={{ gap: 12 }}>
          <span
            aria-hidden="true"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "var(--pri-50)",
              color: "var(--pri)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon name="plug" size={14} />
          </span>
          <div>
            <h3 className="ds-card__title">
              {connected ? `Update ${spec.displayName} credentials` : `Connect ${spec.displayName}`}
            </h3>
            <div className="ds-card__sub">{spec.blurb}</div>
          </div>
        </div>
      </div>

      <div className="ds-card__body" style={{ padding: 18 }}>
        {err && (
          <div
            className="row"
            style={{
              gap: 8,
              marginBottom: 14,
              padding: "10px 12px",
              borderRadius: 9,
              border: "1px solid var(--bad-soft, #fecaca)",
              background: "var(--bad-soft, #fef2f2)",
              color: "var(--bad)",
              fontSize: 12.5,
              alignItems: "flex-start",
            }}
          >
            <Icon name="alert" size={14} />
            <span style={{ minWidth: 0, wordBreak: "break-word" }}>{err}</span>
          </div>
        )}

        <form action={action} className="col" style={{ gap: 14 }}>
          {/* The action reads `provider` from the form and validates it against
              the known api_key spec registry before building any redirect. */}
          <input type="hidden" name="provider" value={spec.provider} />
          {spec.fields.map((field) => (
            <Field key={field.name} field={field} />
          ))}

          <div className="row" style={{ gap: 10, marginTop: 2 }}>
            <SubmitButton label={connectLabel} reconnect={connected} />
          </div>
        </form>
      </div>
    </div>
  );
}
