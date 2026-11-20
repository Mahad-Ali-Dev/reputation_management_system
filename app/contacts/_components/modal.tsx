"use client";

import { Icon } from "@/components/shell/icon";
import { BodyPortal } from "@/components/ui/body-portal";
import { useEffect, useRef } from "react";

/**
 * Lightweight modal overlay for the Contacts module (client).
 *
 * No shared Dialog primitive exists in this codebase, so this is a small,
 * self-contained, accessible overlay matching the v3 design system (`.ds-card`,
 * tokens). Closes on Escape + backdrop click; locks body scroll while open;
 * moves focus to the panel on open. Used by Add Contact + Bulk Request dialogs.
 */

export function Modal({
  title,
  onClose,
  width = 480,
  children,
}: {
  title: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Track the latest onClose in a ref so the mount effect below never re-runs
  // because of it. Parents pass a fresh closure every render, and with
  // `[onClose]` as a dep the effect re-ran — and re-stole focus to the panel —
  // on EVERY keystroke inside the dialog (bug 008 in the June 2026 assessment:
  // Add Contact inputs lost focus after each character).
  const onCloseRef = useRef(onClose);
  // The panel mounts a tick late (portal), so focus it once when it attaches.
  const focusedRef = useRef(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  // Portalled to <body>: the frosted (backdrop-filter) cards that host the
  // triggers would otherwise trap this fixed overlay inside the card.
  return (
    <BodyPortal>
      <div
        role="presentation"
        className="cd-modal"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          background: "rgba(28,28,30,0.26)",
          backdropFilter: "blur(10px) saturate(140%)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "6vh 16px 16px",
          overflowY: "auto",
        }}
      >
        <div
          ref={(el) => {
            panelRef.current = el;
            if (el && !focusedRef.current) {
              focusedRef.current = true;
              el.focus();
            }
          }}
          tabIndex={-1}
          // biome-ignore lint/a11y/useSemanticElements: custom overlay; a native <dialog> needs showModal() wiring.
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="ds-card cd-modal__panel"
          style={{ width: "100%", maxWidth: width, outline: "none" }}
        >
          <div className="ds-card__head">
            <h3 className="ds-card__title">{title}</h3>
            <button
              type="button"
              className="btn btn--ghost btn--xs"
              onClick={onClose}
              aria-label="Close"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </BodyPortal>
  );
}
