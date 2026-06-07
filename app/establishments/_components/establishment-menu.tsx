"use client";

import { Icon } from "@/components/shell/icon";
import { disconnectGoogle } from "@/lib/establishments/actions";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Top-right "…" kebab menu + Disconnect confirmation modal for a connected
 * establishment card. Modeled on `components/cancel-subscription.tsx`: a
 * client island that opens a `role="dialog"` overlay whose <form> posts to the
 * `disconnectGoogle` server action via a hidden `establishmentId`.
 *
 * Only rendered when the establishment has an active Google connection — the
 * card shows a Connect CTA instead when not connected. The destructive
 * Disconnect is never a bare red button; it always lives behind this menu +
 * confirmation (spec acceptance: "'…' menu Disconnect requires confirmation").
 */
export function EstablishmentMenu({
  establishmentId,
  googlePlaceId,
}: {
  establishmentId: string;
  googlePlaceId: string | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click / Escape (the modal has its own scrim).
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
        aria-label="Establishment actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
        className="tb__iconbtn"
        style={{ width: 30, height: 30 }}
      >
        <Icon name="grip" size={16} />
      </button>

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 190,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)",
            boxShadow: "var(--sh-pop)",
            padding: 5,
            zIndex: 40,
          }}
        >
          <Link
            href={`/establishments/${establishmentId}`}
            role="menuitem"
            onClick={() => setMenuOpen(false)}
            className="row"
            style={menuItemStyle}
          >
            <Icon name="edit" size={13} style={{ color: "var(--rl-muted)" }} />
            Edit profile
          </Link>
          {googlePlaceId && (
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${googlePlaceId}`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="row"
              style={menuItemStyle}
            >
              <Icon name="ext" size={13} style={{ color: "var(--rl-muted)" }} />
              Open Google card
            </a>
          )}
          <div style={{ height: 1, background: "var(--line)", margin: "5px 0" }} />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
            className="row"
            style={{ ...menuItemStyle, width: "100%", color: "var(--bad)", background: "none", border: "none", cursor: "pointer" }}
          >
            <Icon name="plug" size={13} />
            Disconnect Google
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
              background: "rgba(15,23,42,.45)",
              zIndex: 80,
              border: "none",
              cursor: "default",
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Disconnect Google Business Profile"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(460px, calc(100vw - 32px))",
              background: "var(--surface)",
              borderRadius: 16,
              boxShadow: "0 30px 60px -20px rgba(15,23,42,.4)",
              zIndex: 81,
              padding: 24,
              textAlign: "left",
            }}
          >
            <div className="row" style={{ gap: 12, marginBottom: 14, alignItems: "flex-start" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--bad-soft)",
                  color: "var(--bad)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="alert" size={20} />
              </span>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    marginBottom: 4,
                  }}
                >
                  Disconnect Google Business Profile?
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "var(--rl-muted)", lineHeight: 1.55 }}>
                  Reviews already synced stay on your dashboard. New reviews stop syncing and AI
                  replies pause until you reconnect.
                </p>
              </div>
            </div>

            <form
              action={disconnectGoogle}
              className="row"
              style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}
            >
              <input type="hidden" name="establishmentId" value={establishmentId} />
              <button type="button" onClick={() => setConfirmOpen(false)} className="btn">
                Cancel
              </button>
              <button
                type="submit"
                className="btn"
                style={{ background: "var(--bad)", color: "#fff", border: "none" }}
              >
                <Icon name="plug" size={13} />
                Disconnect
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

const menuItemStyle = {
  gap: 9,
  padding: "8px 10px",
  borderRadius: 6,
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--ink-2)",
  textDecoration: "none",
  cursor: "pointer",
} as const;
