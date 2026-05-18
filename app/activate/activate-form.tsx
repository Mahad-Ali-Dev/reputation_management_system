"use client";

import { Icon } from "@/components/shell/icon";
import { type ActivateDeviceState, activateDevice } from "@/lib/hardware/actions";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

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
    <form action={formAction} className="col" style={{ gap: 16 }}>
      {prefilledSlug && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: "var(--pri-50, #ecfdf7)",
            border: "1px solid var(--pri-100, #cffaf0)",
            color: "var(--pri-700, #0f766e)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ display: "block", marginBottom: 2 }}>
            You&rsquo;re activating QR <code className="mono">{prefilledSlug}</code>
          </strong>
          You&rsquo;ll find the 8-character code on the card inside the package this plaque shipped
          in. Enter it below to bind the QR to your business.
        </div>
      )}

      {state.error && (
        <div
          role="alert"
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#7f1d1d",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ display: "block", marginBottom: 2 }}>
            Couldn&rsquo;t activate this code.
          </strong>
          {state.error}
        </div>
      )}

      {/* Step 1: code */}
      <label className="col" style={{ gap: 4 }}>
        <span className="lbl">
          <strong>1.</strong> Activation code
        </span>
        <input
          name="activationCode"
          required
          placeholder="XXXX - XXXX"
          autoComplete="off"
          inputMode="text"
          maxLength={10}
          style={{
            width: "100%",
            height: 48,
            padding: "0 16px",
            borderRadius: "var(--r)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontFamily: "var(--f-mono)",
            fontSize: 18,
            letterSpacing: ".18em",
            textTransform: "uppercase",
            outline: "none",
          }}
        />
        <span className="dim" style={{ fontSize: 11.5 }}>
          The 8-character code printed under the QR on your plaque. Dashes are optional.
        </span>
      </label>

      {/* Step 2: establishment */}
      <label className="col" style={{ gap: 4 }}>
        <span className="lbl">
          <strong>2.</strong> Which business is this QR for?
        </span>
        <select
          name="establishmentId"
          required
          defaultValue={establishments[0]?.id}
          style={{
            width: "100%",
            height: 42,
            padding: "0 14px",
            borderRadius: "var(--r)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontSize: 13,
            outline: "none",
          }}
        >
          {establishments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <span className="dim" style={{ fontSize: 11.5 }}>
          Need a new listing?{" "}
          <Link href="/establishments/new" style={{ color: "var(--pri)", textDecoration: "none" }}>
            Add a listing →
          </Link>
        </span>
      </label>

      {/* Step 3: Google review URL */}
      <label className="col" style={{ gap: 4 }}>
        <span className="lbl">
          <strong>3.</strong> Paste your Google review link
          <span className="dim" style={{ marginLeft: 8, fontWeight: 400, fontSize: 11.5 }}>
            Strongly recommended
          </span>
        </span>
        <input
          type="url"
          name="reviewUrl"
          placeholder="https://g.page/r/... or https://search.google.com/local/writereview?placeid=..."
          autoComplete="off"
          style={{
            width: "100%",
            height: 42,
            padding: "0 14px",
            borderRadius: "var(--r)",
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            fontSize: 13,
            fontFamily: "var(--f-mono)",
            outline: "none",
          }}
        />
        <span className="dim" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
          Where scans should land. Get it from{" "}
          <a
            href="https://business.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--pri)", textDecoration: "none" }}
          >
            Google Business Profile
          </a>{" "}
          → Customers → Reviews → <strong>Share review form</strong>. Leave blank to derive
          automatically from your business — you can always change it later via Edit on the QR card.
        </span>
      </label>

      <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <Link href="/hardware" className="btn">
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
    <button
      type="submit"
      className="btn btn--pri"
      disabled={pending}
      style={{ opacity: pending ? 0.6 : 1, cursor: pending ? "wait" : undefined }}
    >
      <Icon name="check" size={12} />
      {pending ? "Activating…" : "Configure + activate"}
    </button>
  );
}
