"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { type ActivateDeviceState, activateDevice } from "@/lib/hardware/actions";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Module 04 — the reusable 3-step Connect Device modal (the spec's headline
 * artifact; the same shape recurs in Connections, Step 15).
 *
 * Renders a "+ Add Device" trigger and, on open, a centered dialog (modeled on
 * `components/cancel-subscription.tsx`) with three labeled steps:
 *   1. Select Your Business   — <select name="establishmentId">
 *   2. Enter Your Device Code  — <input name="activationCode"> (5-char code)
 *   3. Platform               — Google pre-selected; others disabled "soon"
 * plus a full-width "Connect Device" submit and a subtle "Watch setup video".
 *
 * It WRAPS the existing `activateDevice` server action via `useActionState`
 * (the action keeps its 2-arg `(prevState, formData)` signature — changing it
 * would break /activate). All three fields live in ONE <form> and stay mounted
 * across steps so a submit always carries `establishmentId` + `activationCode`;
 * only the active step's panel is visible. The action's inline `{ error }`
 * renders under the form; on success the action `redirect()`s to
 * /hardware?activated=… and the new card appears.
 *
 * Platform note: the activation flow only computes a Google review URL, so
 * Google is the single live target. Non-Google platforms render disabled
 * ("coming soon") and are NOT wired — matching reality, not faking choice.
 */

const initialState: ActivateDeviceState = { error: null };

const SETUP_VIDEO_URL = process.env.NEXT_PUBLIC_SETUP_VIDEO_URL ?? null;

type Platform = { key: string; label: string; icon: IconName };
const PLATFORMS: Platform[] = [
  { key: "google", label: "Google", icon: "google" },
  { key: "facebook", label: "Facebook", icon: "fb" },
  { key: "yelp", label: "Yelp", icon: "star" },
  { key: "tripadvisor", label: "Tripadvisor", icon: "pin" },
];

export function ConnectDeviceModal({
  establishments,
  triggerClassName = "btn btn--pri",
  triggerLabel = "Add Device",
}: {
  establishments: Array<{ id: string; name: string }>;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [state, formAction] = useActionState(activateDevice, initialState);

  // Reset to step 1 each time the modal opens so it always starts clean.
  useEffect(() => {
    if (open) setStep(1);
  }, [open]);

  // Esc closes the dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const noBusinesses = establishments.length === 0;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        <Icon name="plus" size={13} />
        {triggerLabel}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(11,13,14,.45)",
              zIndex: 80,
              border: "none",
              cursor: "default",
            }}
          />
          <div
            role="dialog"
            aria-label="Connect a device"
            aria-modal="true"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(520px, calc(100vw - 32px))",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              background: "var(--surface)",
              borderRadius: 16,
              boxShadow: "0 30px 60px -20px rgba(11,13,14,.4)",
              zIndex: 81,
              padding: 24,
            }}
          >
            <Header step={step} onClose={() => setOpen(false)} />

            {noBusinesses ? (
              <NoBusinessNotice />
            ) : (
              <form action={formAction} className="col" style={{ gap: 16, marginTop: 18 }}>
                {state.error && (
                  <div
                    role="alert"
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      background: "var(--bad-soft)",
                      border: "1px solid #fecaca",
                      color: "#7f1d1d",
                      fontSize: 12.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {state.error}
                  </div>
                )}

                {/* Step 1 — Business. Always mounted; hidden when not active. */}
                <StepPanel active={step === 1} n={1} title="Select Your Business">
                  <select
                    name="establishmentId"
                    required
                    defaultValue={establishments[0]?.id}
                    style={fieldStyle}
                  >
                    {establishments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <Helper>
                    Scans from this device will route to this business&rsquo;s review page.
                  </Helper>
                </StepPanel>

                {/* Step 2 — Device code. */}
                <StepPanel active={step === 2} n={2} title="Enter Your Device Code">
                  <input
                    name="activationCode"
                    required
                    placeholder="XXXXX"
                    autoComplete="off"
                    inputMode="text"
                    maxLength={12}
                    style={{
                      ...fieldStyle,
                      height: 48,
                      fontFamily: "var(--f-mono)",
                      fontSize: 18,
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                    }}
                  />
                  <Helper>Find this on the card inside your package.</Helper>
                </StepPanel>

                {/* Step 3 — Platform (Google pre-selected). */}
                <StepPanel active={step === 3} n={3} title="Choose Review Platform">
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    {PLATFORMS.map((p) => {
                      const isGoogle = p.key === "google";
                      return (
                        <span
                          key={p.key}
                          aria-disabled={!isGoogle}
                          title={isGoogle ? "Selected" : "Coming soon"}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            height: 38,
                            padding: "0 14px",
                            borderRadius: "var(--r-pill)",
                            fontSize: 13,
                            fontWeight: 500,
                            border: isGoogle
                              ? "1.5px solid var(--pri)"
                              : "1px solid var(--line)",
                            background: isGoogle ? "var(--pri-50)" : "var(--surface)",
                            color: isGoogle ? "var(--pri)" : "var(--rl-muted)",
                            opacity: isGoogle ? 1 : 0.6,
                            cursor: isGoogle ? "default" : "not-allowed",
                          }}
                        >
                          <Icon name={p.icon} size={15} />
                          {p.label}
                          {isGoogle ? (
                            <Icon name="check" size={13} />
                          ) : (
                            <span style={{ fontSize: 9.5, opacity: 0.8 }}>soon</span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                  <Helper>
                    Google is live today. We&rsquo;ll add more platforms here as they come online.
                  </Helper>
                </StepPanel>

                {/* Nav + submit */}
                {step < 3 ? (
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
                    {step > 1 ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setStep((s) => s - 1)}
                      >
                        <Icon name="chevL" size={12} />
                        Back
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      className="btn btn--pri"
                      onClick={() => setStep((s) => s + 1)}
                    >
                      Continue
                      <Icon name="chevR" size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="col" style={{ gap: 12, marginTop: 4 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setStep((s) => s - 1)}
                      >
                        <Icon name="chevL" size={12} />
                        Back
                      </button>
                      <ConnectButton />
                    </div>
                    <WatchVideoLink />
                  </div>
                )}
              </form>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Header({ step, onClose }: { step: number; onClose: () => void }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", justifyContent: "space-between" }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            marginBottom: 6,
          }}
        >
          Connect a device
        </h2>
        <div className="row" style={{ gap: 6 }}>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              aria-hidden
              style={{
                height: 4,
                width: 28,
                borderRadius: 999,
                background: n <= step ? "var(--pri)" : "var(--line)",
              }}
            />
          ))}
          <span className="mono dim" style={{ fontSize: 10.5, marginLeft: 4 }}>
            STEP {step} OF 3
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="btn btn--ghost btn--xs"
        style={{ width: 28, height: 28, padding: 0, justifyContent: "center" }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

function StepPanel({
  active,
  n,
  title,
  children,
}: {
  active: boolean;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  // Keep mounted (so the field always submits) but visually hide inactive steps.
  return (
    <div style={{ display: active ? "block" : "none" }}>
      <label className="col" style={{ gap: 6 }}>
        <span className="lbl" style={{ fontSize: 13, fontWeight: 500 }}>
          <strong style={{ color: "var(--pri)" }}>{n}.</strong> {title}
        </span>
        {children}
      </label>
    </div>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return (
    <span className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
      {children}
    </span>
  );
}

function NoBusinessNotice() {
  return (
    <div className="col" style={{ gap: 14, marginTop: 18 }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--rl-muted)", lineHeight: 1.55 }}>
        Add a business first — a device has to point its scans at one of your listings.
      </p>
      <Link
        href="/establishments/new"
        className="btn btn--pri"
        style={{ alignSelf: "flex-start" }}
      >
        <Icon name="plus" size={13} />
        Add a business
      </Link>
    </div>
  );
}

function ConnectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn--pri"
      disabled={pending}
      style={{
        flex: 1,
        justifyContent: "center",
        opacity: pending ? 0.6 : 1,
        cursor: pending ? "wait" : undefined,
      }}
    >
      <Icon name="check" size={13} />
      {pending ? "Connecting…" : "Connect Device"}
    </button>
  );
}

function WatchVideoLink() {
  const enabled = !!SETUP_VIDEO_URL;
  const common = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    fontSize: 12,
    color: enabled ? "var(--pri)" : "var(--rl-muted)",
    textDecoration: "none",
  } as const;
  if (enabled) {
    return (
      <a href={SETUP_VIDEO_URL} target="_blank" rel="noopener noreferrer" style={common}>
        <Icon name="play" size={12} />
        Watch setup video
      </a>
    );
  }
  return (
    <span aria-disabled style={{ ...common, cursor: "not-allowed", opacity: 0.7 }}>
      <Icon name="play" size={12} />
      Watch setup video
    </span>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  padding: "0 14px",
  borderRadius: "var(--r)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontSize: 13,
  outline: "none",
};
