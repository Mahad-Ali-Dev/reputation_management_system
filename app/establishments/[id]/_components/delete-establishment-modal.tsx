"use client";

/**
 * "Delete establishment" trigger + confirmation modal.
 *
 * The bare `<form action={deleteEstablishment}><button>Delete</button></form>`
 * this replaces let one misclick permanently soft-delete a business. Mirrors
 * `DisconnectDialog`'s shape (overlay, focus, Escape-to-close, useFormStatus
 * pending state) — the actual delete stays a server action passed in as
 * `action`, so all DB work stays server-side.
 */

import { Icon } from "@/components/shell/icon";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--danger btn--sm" disabled={pending}>
      <Icon name="trash" size={11} />
      {pending ? "Deleting…" : "Delete establishment"}
    </button>
  );
}

export function DeleteEstablishmentModal({
  establishmentName,
  action,
}: {
  establishmentName: string;
  action: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

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

  return (
    <>
      <button type="button" className="btn btn--danger btn--sm" onClick={() => setOpen(true)}>
        <Icon name="trash" size={11} />
        Delete establishment
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-est-title"
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
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="ds-card"
            style={{ width: "min(440px, 100%)", boxShadow: "0 24px 60px -20px rgba(11, 13, 14, 0.4)" }}
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
                    id="delete-est-title"
                    style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-0.015em", margin: 0, color: "var(--ink)" }}
                  >
                    Delete {establishmentName}?
                  </h2>
                </div>
              </div>

              <p style={{ marginTop: 16, fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)" }}>
                Soft-deletes the record. Reviews remain attached. You have 30 days to undo via
                support.
              </p>

              <div className="row" style={{ marginTop: 22, justifyContent: "flex-end", gap: 8 }}>
                <button type="button" ref={closeRef} className="btn" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <form action={action}>
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
