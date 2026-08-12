"use client";

import { Icon } from "@/components/shell/icon";
import { useEffect, useRef, useState } from "react";
import { InviteTeammateForm } from "./invite-teammate-form";

/**
 * "Invite teammate" trigger + centered modal.
 *
 * Replaces the old <details>/<summary> side popover (anchored to the button,
 * off to the right) — a dropdown reads fine for 2 fields, but the tab-access
 * grid needs real width and height to lay out without scrolling, which a
 * corner popover can't give it. This is a real dialog: centered, scrim
 * behind it, Escape/backdrop-click/✕ all close it, and focus stays trapped
 * to the dialog while it's open (native <dialog>-style expectations, done by
 * hand since the form needs client state for the Full/Custom toggle anyway).
 */
export function InviteTeammateModal() {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    // Lock page scroll while the modal is open, like the disconnect/delete
    // confirm dialogs elsewhere in settings.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function close() {
    setOpen(false);
    // Return focus to the trigger — keeps keyboard/screen-reader users
    // oriented instead of dropping focus back to <body>.
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="set-btn set-btn--primary set-btn--sm"
        onClick={() => setOpen(true)}
      >
        <Icon name="plus" size={13} className="set-btn__ic" />
        Invite teammate
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,.45)",
              zIndex: 80,
              border: "none",
              cursor: "default",
            }}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-teammate-title"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(560px, calc(100vw - 32px))",
              maxHeight: "calc(100vh - 64px)",
              overflowY: "auto",
              background: "var(--set-card, #fff)",
              borderRadius: 16,
              boxShadow: "0 30px 60px -20px rgba(15,23,42,.4)",
              zIndex: 81,
              padding: 24,
              textAlign: "left",
            }}
          >
            <div
              className="row"
              style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}
            >
              <div>
                <h2
                  id="invite-teammate-title"
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    color: "var(--ink)",
                  }}
                >
                  Invite teammate
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--set-mut, var(--rl-muted))" }}>
                  They&rsquo;ll get an email with a link to join this workspace.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="set-btable__dl"
                style={{ flexShrink: 0 }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <InviteTeammateForm onSubmitted={close} />
          </div>
        </>
      )}
    </>
  );
}
