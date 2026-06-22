"use client";

import { Icon } from "@/components/shell/icon";
import { deleteDevice } from "@/lib/hardware/actions";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * My Devices kit — the per-row Action cell: an Edit (pencil) link + a Delete
 * (trash) button shown as two small square outline buttons, matching the
 * "Active state" mockup (which shows pencil + trash icons, not an overflow
 * kebab).
 *
 * Wiring is unchanged from the prior kebab:
 *   - Edit   → Link to /hardware/edit/[deviceId] (existing edit page).
 *   - Delete → confirm dialog → <form action={deleteDevice}> soft-delete.
 */
export function DeviceRowActions({
  deviceId,
  deviceLabel,
}: {
  deviceId: string;
  deviceLabel: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  return (
    <div className="md-rowact">
      <Link
        href={`/hardware/edit/${deviceId}`}
        className="md-iconbtn"
        aria-label={`Edit ${deviceLabel}`}
        title="Edit device"
      >
        <Icon name="edit" size={14} />
      </Link>
      <button
        type="button"
        className="md-iconbtn md-iconbtn--bad"
        aria-label={`Delete ${deviceLabel}`}
        title="Delete device"
        onClick={() => setConfirmOpen(true)}
      >
        <Icon name="trash" size={14} />
      </button>

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
              textAlign: "left",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.015em",
                marginBottom: 6,
              }}
            >
              Delete {deviceLabel}?
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--rl-muted)", lineHeight: 1.55 }}>
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
