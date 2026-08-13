"use client";

import { Icon } from "@/components/shell/icon";
import { removeMember } from "@/lib/account/actions";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * "Remove member" trigger (trash icon) + confirm dialog, one per team-member
 * row. Removing someone's access is destructive and immediate (no undo), so
 * unlike the old bare `<form action={removeMember}>` button this requires an
 * explicit confirm click. Mirrors EditRoleModal's dialog shape.
 */
export function RemoveMemberModal({
  membershipId,
  memberName,
}: {
  membershipId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  function openModal() {
    setError(null);
    setOpen(true);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function confirmRemove() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("membershipId", membershipId);
    try {
      const res = await removeMember(fd);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
        setPending(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member.");
      setPending(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="set-btable__dl"
        aria-label={`Remove ${memberName}`}
        title="Remove member"
        onClick={openModal}
      >
        <Icon name="trash" size={15} />
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
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-member-title"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(420px, calc(100vw - 32px))",
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
              style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}
            >
              <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "#fef2f2",
                    color: "#dc2626",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  <Icon name="alert" size={17} />
                </span>
                <h2
                  id="remove-member-title"
                  style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em", paddingTop: 6 }}
                >
                  Remove teammate?
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="set-btable__dl"
                style={{ flexShrink: 0 }}
                disabled={pending}
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            <p style={{ margin: "0 0 18px", fontSize: 13.5, color: "var(--set-mut, var(--rl-muted))", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--set-ink-2, var(--ink))" }}>{memberName}</strong> will
              immediately lose access to this workspace. This can&rsquo;t be undone — they&rsquo;d
              need a new invitation to rejoin.
            </p>

            {error && (
              <p role="alert" style={{ margin: "0 0 14px", fontSize: 12.5, color: "#dc2626", lineHeight: 1.5 }}>
                {error}
              </p>
            )}

            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="set-btn set-btn--sm" onClick={close} disabled={pending}>
                Cancel
              </button>
              <button
                type="button"
                className="set-btn set-btn--sm"
                style={{ background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}
                onClick={confirmRemove}
                disabled={pending}
              >
                <Icon name="trash" size={13} className="set-btn__ic" />
                {pending ? "Removing…" : "Remove member"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
