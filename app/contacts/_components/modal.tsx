"use client";

import { Icon } from "@/components/shell/icon";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(11,13,14,0.42)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "6vh 16px 16px",
        overflowY: "auto",
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="ds-card"
        style={{ width: "100%", maxWidth: width, outline: "none", background: "var(--surface)" }}
      >
        <div className="ds-card__head">
          <h3 className="ds-card__title">{title}</h3>
          <button type="button" className="btn btn--ghost btn--xs" onClick={onClose} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
