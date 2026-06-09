"use client";

/**
 * WhatsApp Business connect panel (client island) — Module 09.
 *
 * The operator pastes their WhatsApp Cloud API **Phone Number ID** and a
 * **permanent / system-user access token**; the `connectWhatsApp` server action
 * persists a `Connection(provider:"whatsapp", externalId=phone_number_id)` with
 * the token envelope-encrypted, which is exactly the row the WhatsApp webhook
 * (org lookup by phone_number_id) and the send path consume.
 *
 * RSC SAFETY: this is the only place form state lives. It receives ONLY plain
 * props from the server page and posts to a server action — no Prisma rows or
 * Dates cross the boundary. The token field is a password input; the value is
 * sent once to the action and never round-tripped back to the client.
 */

import { Icon } from "@/components/shell/icon";
import { useFormStatus } from "react-dom";

/** Map an `?error=` code from the action redirect to a friendly message. */
function errorMessage(code: string | null): string | null {
  switch (code) {
    case null:
      return null;
    case "invalid_phone_number_id":
      return "That Phone Number ID doesn't look right — it should be the numeric ID from Meta's WhatsApp Manager (not the phone number itself).";
    case "invalid_token":
      return "Paste a valid access token. Use a permanent System User token so the connection doesn't expire.";
    case "whatsapp_not_configured":
      return "Couldn't save the connection — the WhatsApp provider isn't enabled on this database yet. Contact your administrator.";
    default:
      return "Couldn't connect WhatsApp. Double-check the Phone Number ID and token, then try again.";
  }
}

function SubmitButton({ reconnect }: { reconnect: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--pri" disabled={pending}>
      <Icon name={reconnect ? "refresh" : "plug"} size={13} />
      {pending
        ? reconnect
          ? "Updating…"
          : "Connecting…"
        : reconnect
          ? "Update token"
          : "Connect WhatsApp"}
    </button>
  );
}

export function WhatsAppConnectPanel({
  action,
  connected,
  errorCode,
}: {
  action: (formData: FormData) => void | Promise<void>;
  connected: boolean;
  errorCode: string | null;
}) {
  const err = errorMessage(errorCode);

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
              {connected ? "Update WhatsApp credentials" : "Connect a WhatsApp number"}
            </h3>
            <div className="ds-card__sub">
              Paste your WhatsApp Cloud API Phone Number ID and a permanent access token.
            </div>
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
          <div className="col" style={{ gap: 6 }}>
            <label
              htmlFor="wa-phone-number-id"
              style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}
            >
              Phone Number ID
            </label>
            <input
              id="wa-phone-number-id"
              name="phoneNumberId"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              required
              placeholder="e.g. 109876543210987"
              className="input"
              style={{ fontFamily: "var(--mono, monospace)" }}
            />
            <span className="dim" style={{ fontSize: 11 }}>
              WhatsApp Manager → API Setup → "Phone number ID" (a numeric id, not the phone number).
            </span>
          </div>

          <div className="col" style={{ gap: 6 }}>
            <label
              htmlFor="wa-access-token"
              style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}
            >
              Access token
            </label>
            <input
              id="wa-access-token"
              name="accessToken"
              type="password"
              autoComplete="off"
              required
              placeholder="Permanent System User token"
              className="input"
            />
            <span className="dim" style={{ fontSize: 11 }}>
              Stored encrypted at rest. Use a permanent System User token so the connection never
              expires.
            </span>
          </div>

          <div className="row" style={{ gap: 10, marginTop: 2 }}>
            <SubmitButton reconnect={connected} />
          </div>
        </form>
      </div>
    </div>
  );
}
