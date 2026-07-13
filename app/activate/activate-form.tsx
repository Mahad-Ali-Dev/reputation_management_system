"use client";

import { Icon } from "@/components/shell/icon";
import { type ActivateDeviceState, activateDevice } from "@/lib/hardware/actions";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import "./activate.css";

/**
 * Activation form (client component).
 *
 * Why client + useActionState: when the user enters a wrong code, the server
 * action returns `{ error }` instead of throwing. We render the error inline
 * above the form — much friendlier than the default `error.tsx` page that
 * blank-slates whatever they were doing.
 *
 * Inputs match the previous server-rendered version exactly so visual
 * regression is zero.
 */

const initialState: ActivateDeviceState = { error: null };

export function ActivateForm({
  establishments,
  prefilledSlug,
}: {
  establishments: Array<{ id: string; name: string }>;
  prefilledSlug?: string | null;
}) {
  const [state, formAction] = useActionState(activateDevice, initialState);

  return (
    <form action={formAction} className="af">
      {/* The scanned QR's unique slug — this is what binds activation to the
          exact device (the printed code alone can't; see activateDevice). */}
      {prefilledSlug && <input type="hidden" name="slug" value={prefilledSlug} />}
      {prefilledSlug && (
        <div className="af-banner">
          <strong>
            You&rsquo;re activating QR <code>{prefilledSlug}</code>
          </strong>
          You&rsquo;ll find the 5-character code on the card inside the package this plaque shipped
          in. Enter it below to bind the QR to your business.
        </div>
      )}

      {state.error && (
        <div role="alert" className="af-error">
          <strong>Couldn&rsquo;t activate this code.</strong>
          {state.error}
        </div>
      )}

      {/* Step 1: code */}
      <label className="af-field">
        <span className="af-label">
          <span className="af-num">1</span> Activation code
        </span>
        <input
          name="activationCode"
          required
          placeholder="XXXXX"
          autoComplete="off"
          inputMode="text"
          maxLength={5}
          className="af-input af-input--code"
        />
        <span className="af-hint">The 5-character code printed under the QR on your plaque.</span>
      </label>

      {/* Step 2: establishment */}
      <label className="af-field">
        <span className="af-label">
          <span className="af-num">2</span> Which business is this QR for?
        </span>
        <select
          name="establishmentId"
          required
          defaultValue={establishments[0]?.id}
          className="af-select"
        >
          {establishments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <span className="af-hint">
          Need a new listing?{" "}
          <Link href="/establishments/new">Add a listing →</Link>
        </span>
      </label>

      {/* Step 3: Google review URL */}
      <label className="af-field">
        <span className="af-label">
          <span className="af-num">3</span> Paste your Google review link
          <span className="af-opt">Strongly recommended</span>
        </span>
        <input
          type="url"
          name="reviewUrl"
          placeholder="https://g.page/r/... or https://search.google.com/local/writereview?placeid=..."
          autoComplete="off"
          className="af-input af-input--url"
        />
        <span className="af-hint">
          Where scans should land. Get it from{" "}
          <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer">
            Google Business Profile
          </a>{" "}
          → Customers → Reviews → <strong>Share review form</strong>. Leave blank to derive
          automatically from your business — you can always change it later via Edit on the QR card.
        </span>
      </label>

      <div className="af-actions">
        <Link href="/hardware" className="af-cancel">
          Cancel
        </Link>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="af-submit" disabled={pending}>
      <Icon name="check" size={13} />
      {pending ? "Activating…" : "Configure + activate"}
    </button>
  );
}
