"use client";

import { Icon } from "@/components/shell/icon";
import { deleteDevice } from "@/lib/hardware/actions";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Module 04 — the per-card "…" (Edit / Delete) kebab.
 *
 * Repackages the device's existing Edit route + Delete server action into the
 * spec's overflow menu (replacing the old inline button row). Nothing new
 * server-side:
 *   - Edit   → Link to /hardware/edit/[deviceId] (the existing edit page).
 *   - Delete → a small confirm dialog (mirrors `components/cancel-subscription.tsx`)
 *              whose <form action={deleteDevice}> posts a hidden deviceId to the
 *              existing soft-delete action.
 *
 * No `dots`/`more` glyph exists in the icon set, so the trigger uses a literal
 * "⋯" so the affordance is unmistakable (per the plan's icon-gap note).
 */
export function DeviceCardMenu({
  deviceId,
  deviceLabel,
}: {
  deviceId: string;
  /** Human label shown in the delete confirm ("Delete the Wall Plaque?"). */
  deviceLabel: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside-click / Esc. The confirm dialog has its own
  // full-screen overlay so it doesn't need this.
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Device options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        className="btn btn--ghost btn--xs"
        style={{
          width: 30,
          height: 30,
          padding: 0,
          justifyContent: "center",
          fontSize: 18,
          lineHeight: 1,
          color: "var(--rl-muted)",
        }}
      >
        <span aria-hidden>⋯</span>
      </button>

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 30,
            minWidth: 150,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            boxShadow: "0 16px 40px -16px rgba(11,13,14,.35)",
            padding: 5,
          }}
        >
          <Link
            href={`/hardware/edit/${deviceId}`}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            style={menuItemStyle}
            className="dev-menu-item"
          >
            <Icon name="edit" size={13} />
            Edit
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
            style={{ ...menuItemStyle, color: "var(--bad)", width: "100%", textAlign: "left" }}
            className="dev-menu-item"
          >
            <Icon name="trash" size={13} />
            Delete
          </button>
        </div>
      )}

      {confirmOpen && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setConfirmOpen(false)}
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
            aria-label={`Delete ${deviceLabel}`}
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(440px, calc(100vw - 32px))",
              background: "var(--surface)",
              borderRadius: 16,
              boxShadow: "0 30px 60px -20px rgba(11,13,14,.4)",
              zIndex: 81,
              padding: 24,
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "-0.015em",
                marginBottom: 6,
              }}
            >
              Delete {deviceLabel}?
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: "var(--rl-muted)",
                lineHeight: 1.55,
              }}
            >
              This moves the device to Trash. Scans stop routing to your review page, but you have 30
              days to restore it before it&rsquo;s permanently removed.
            </p>

            <form
              action={deleteDevice}
              className="row"
              style={{ justifyContent: "flex-end", gap: 8, marginTop: 18 }}
            >
              <input type="hidden" name="deviceId" value={deviceId} />
              <button type="button" onClick={() => setConfirmOpen(false)} className="btn">
                Keep device
              </button>
              <button
                type="submit"
                className="btn"
                style={{ background: "var(--bad)", color: "#fff", border: "none" }}
              >
                <Icon name="trash" size={12} />
                Delete device
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 7,
  fontSize: 13,
  color: "var(--ink)",
  textDecoration: "none",
  background: "transparent",
  border: "none",
  cursor: "pointer",
};
