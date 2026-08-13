"use client";

import { Icon } from "@/components/shell/icon";
import { updateMemberRole } from "@/lib/account/actions";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ROLE_OPTIONS: Array<[string, string]> = [
  ["owner", "Owner · full control"],
  ["admin", "Admin · can manage data"],
  ["manager", "Manager · can reply + edit"],
  ["viewer", "Viewer · read-only"],
];

/**
 * "Edit role" trigger (pencil icon) + centered modal, one per team-member row.
 * Mirrors InviteTeammateModal's dialog shape (scrim, Escape/✕/backdrop close,
 * focus returns to the trigger) but only changes `role` — allowedTabs is left
 * untouched so editing a role can't accidentally wipe someone's custom tab
 * restrictions. Server-side escalation/last-owner guards live in
 * updateMemberRole; a rejection shows inline instead of crashing the bare
 * form the old remove-member button used.
 */
export function EditRoleModal({
  membershipId,
  memberName,
  currentRole,
}: {
  membershipId: string;
  memberName: string;
  currentRole: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(currentRole);
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
    setRole(currentRole);
    setError(null);
    setOpen(true);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("membershipId", membershipId);
    fd.set("role", role);
    try {
      const res = await updateMemberRole(fd);
      if (res.ok) {
        setOpen(false);
        triggerRef.current?.focus();
        router.refresh();
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="set-btable__dl"
        aria-label={`Edit ${memberName}'s role`}
        title="Edit role"
        onClick={openModal}
      >
        <Icon name="edit" size={15} />
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
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-role-title"
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
              style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}
            >
              <div>
                <h2
                  id="edit-role-title"
                  style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.015em" }}
                >
                  Edit role
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--set-mut, var(--rl-muted))" }}>
                  {memberName}
                </p>
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

            <form onSubmit={save} className="col" style={{ gap: 14 }}>
              <label className="set-field">
                <span className="set-field__label">Role</span>
                <select
                  className="set-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {ROLE_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>

              {error && (
                <p
                  role="alert"
                  style={{ margin: 0, fontSize: 12.5, color: "#dc2626", lineHeight: 1.5 }}
                >
                  {error}
                </p>
              )}

              <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="set-btn set-btn--sm" onClick={close} disabled={pending}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="set-btn set-btn--primary set-btn--sm"
                  disabled={pending || role === currentRole}
                >
                  <Icon name="check" size={13} className="set-btn__ic" />
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}
