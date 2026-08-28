"use client";

import { Icon } from "@/components/shell/icon";
import { type CreateAirbnbListingState, createAirbnbListing } from "@/lib/establishments/actions";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Airbnb-listing onboarding form.
 *
 * Why a client component:
 *   - Inline field-level errors via `useActionState` (the server action
 *     returns `{ error, fieldErrors }` instead of throwing).
 *   - Live "Airbnb listing id detected: 12345" feedback as the host pastes
 *     the URL — small but reassuring confirmation that we'll be able to
 *     match incoming reviews to this listing.
 *   - Submit button shows pending state via `useFormStatus`.
 */

const initialState: CreateAirbnbListingState = { error: null };

export function AirbnbListingForm() {
  const [state, formAction] = useActionState(createAirbnbListing, initialState);

  return (
    <form action={formAction} className="col" style={{ gap: 16 }}>
      {state.error && (
        <div role="alert" style={errorBoxStyle}>
          <strong style={{ display: "block", marginBottom: 2 }}>
            Couldn&rsquo;t save this listing.
          </strong>
          {state.error}
        </div>
      )}

      {/* Listing name — keep simple, matches what the host calls the place */}
      <Field
        label="1. Listing name"
        name="name"
        placeholder="Cliff House"
        hint="Whatever you call this property in conversation. Shown to guests on the welcome card."
        required
        fieldError={state.fieldErrors?.name}
      />

      {/* Listing URL — the only required Airbnb-specific field */}
      <Field
        label="2. Airbnb listing URL"
        name="airbnb_listing_url"
        placeholder="https://www.airbnb.com/rooms/12345678"
        hint="Paste the URL from your browser when viewing your listing. We auto-detect the listing ID for review matching."
        type="url"
        required
        fieldError={state.fieldErrors?.airbnbListingUrl}
      />

      {/* Direct booking URL (optional) */}
      <Field
        label="3. Direct-booking URL (optional)"
        name="direct_booking_url"
        placeholder="https://your-site.com/book or your Hospitable link"
        hint="Shown to returning guests as a 'book directly next time' option. Leave blank if you want guests to only see Airbnb."
        type="url"
        fieldError={state.fieldErrors?.directBookingUrl}
      />

      {/* House rules */}
      <FieldTextarea
        label="4. House rules (optional)"
        name="house_rules"
        placeholder="No shoes inside, checkout by 10 AM, dogs welcome please brush off sand from the beach before coming in."
        hint="Shown to guests when they tap the welcome card on arrival."
        rows={4}
        fieldError={state.fieldErrors?.houseRules}
      />

      {/* WiFi — two fields side-by-side */}
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--ink-2)",
            marginBottom: 6,
          }}
        >
          5. WiFi (optional)
        </legend>
        <p
          style={{
            fontSize: 11.5,
            color: "var(--rl-muted)",
            margin: "0 0 10px",
            lineHeight: 1.55,
          }}
        >
          Stored encrypted at rest (AES-256-GCM). Used for the optional WiFi NFC card if you
          don&rsquo;t plan to issue one, leave blank.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)",
            gap: 10,
          }}
        >
          <label className="col" style={{ gap: 4 }}>
            <span className="lbl">SSID</span>
            <input
              name="wifi_ssid"
              type="text"
              autoComplete="off"
              placeholder="HouseGuest"
              style={inputStyle}
            />
          </label>
          <label className="col" style={{ gap: 4 }}>
            <span className="lbl">Password</span>
            <input
              name="wifi_password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              style={inputStyle}
            />
          </label>
        </div>
        {state.fieldErrors?.wifiPassword === "encryption_failed" && (
          <div style={{ ...errorBoxStyle, marginTop: 10 }}>
            We couldn&rsquo;t securely store the WiFi password (server-side crypto issue). Leave it
            blank for now you can add it later from the listing&rsquo;s edit page.
          </div>
        )}
      </fieldset>

      {/* Hidden timezone — use the browser's. Could be improved with a picker. */}
      <input type="hidden" name="timezone" value="UTC" />

      <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <Link href="/establishments" className="btn">
          Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  placeholder,
  hint,
  type = "text",
  required,
  fieldError,
}: {
  label: string;
  name: string;
  placeholder?: string;
  hint?: string;
  type?: string;
  required?: boolean;
  fieldError?: string;
}) {
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="lbl">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        style={{
          ...inputStyle,
          borderColor: fieldError ? "#fca5a5" : undefined,
        }}
      />
      {fieldError ? (
        <span style={{ fontSize: 11.5, color: "#b91c1c" }}>{fieldError}</span>
      ) : hint ? (
        <span className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function FieldTextarea({
  label,
  name,
  placeholder,
  hint,
  rows = 3,
  fieldError,
}: {
  label: string;
  name: string;
  placeholder?: string;
  hint?: string;
  rows?: number;
  fieldError?: string;
}) {
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="lbl">{label}</span>
      <textarea
        name={name}
        placeholder={placeholder}
        rows={rows}
        style={{
          ...inputStyle,
          height: "auto",
          padding: "10px 12px",
          resize: "vertical",
          fontFamily: "inherit",
          borderColor: fieldError ? "#fca5a5" : undefined,
        }}
      />
      {fieldError ? (
        <span style={{ fontSize: 11.5, color: "#b91c1c" }}>{fieldError}</span>
      ) : hint ? (
        <span className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn--pri"
      disabled={pending}
      style={{ opacity: pending ? 0.6 : 1, cursor: pending ? "wait" : undefined }}
    >
      <Icon name="check" size={12} />
      {pending ? "Creating…" : "Create listing"}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 14px",
  borderRadius: "var(--r, 10px)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 13.5,
  outline: "none",
  boxSizing: "border-box",
};

const errorBoxStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 10,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#7f1d1d",
  fontSize: 13,
  lineHeight: 1.55,
};
