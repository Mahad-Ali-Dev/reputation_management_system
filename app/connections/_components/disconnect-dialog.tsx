"use client";

/**
 * Disconnect confirmation modal (client island).
 *
 * Acceptance criterion (verbatim from spec): the disconnect flow must warn
 * "This will stop automatic customer syncing." — rendered below, prominently.
 *
 * Pure presentational + local open state; the actual mutation is the
 * `disconnectConnection` server action passed in as `action` (so all DB work
 * stays server-side). Opened by a trigger button rendered by the caller; this
 * component owns the overlay, focus, Escape-to-close, and the submitting state.
 */

import { Icon } from "@/components/shell/icon";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** The exact warning the spec mandates — exported so a test can assert it. */
export const DISCONNECT_WARNING = "This will stop automatic customer syncing.";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn"
      disabled={pending}
      style={{
        background: "var(--bad)",
        borderColor: "var(--bad)",
        color: "#fff",
        boxShadow: "0 4px 12px -2px rgba(220, 38, 38, 0.35)",
      }}
    >
      {pending ? (
        <>
          <Icon name="refresh" size={13} />
          Disconnecting…
        </>
      ) : (
        <>
          <Icon name="plug" size={13} />
          Disconnect
        </>
      )}
    </button>
  );
}

export function DisconnectDialog({
  connectionId,
  providerLabel,
  accountLabel,
  action,
  /** Optional custom trigger classes; defaults to a small ghost danger button. */
  triggerClassName = "btn btn--xs btn--ghost btn--danger",
  triggerLabel = "Disconnect",
}: {
  connectionId: string;
  providerLabel: string;
  accountLabel: string | null;
  action: (formData: FormData) => void | Promise<void>;
  triggerClassName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape-to-close + focus the dismiss control on open + lock body scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const label = providerLabel || "this connection";

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`disc-title-${connectionId}`}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(11, 13, 14, 0.45)",
            backdropFilter: "blur(2px)",
          }}
          onMouseDown={(e) => {
            // Click on the scrim (not the card) closes.
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="ds-card"
            style={{
              width: "min(440px, 100%)",
              boxShadow: "0 24px 60px -20px rgba(11, 13, 14, 0.4)",
            }}
          >
            <div className="ds-card__body" style={{ padding: 22 }}>
              <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    flexShrink: 0,
                    borderRadius: 10,
                    background: "var(--bad-soft)",
                    color: "var(--bad)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon name="alert" size={20} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2
                    id={`disc-title-${connectionId}`}
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      letterSpacing: "-0.015em",
                      margin: 0,
                      color: "var(--ink)",
                    }}
                  >
                    Disconnect {label}?
                  </h2>
                  {accountLabel && (
                    <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                      {accountLabel}
                    </div>
                  )}
                </div>
              </div>

              <p
                style={{
                  marginTop: 16,
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--ink-2)",
                }}
              >
                {DISCONNECT_WARNING} Existing data already pulled into your contacts stays but new
                customers from {label} will no longer flow in, and any review requests that rely on
                this connection will pause.
              </p>

              <div className="row" style={{ marginTop: 22, justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  ref={closeRef}
                  className="btn"
                  onClick={() => setOpen(false)}
                >
                  Keep connected
                </button>
                <form action={action}>
                  <input type="hidden" name="connectionId" value={connectionId} />
                  <SubmitButton />
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
