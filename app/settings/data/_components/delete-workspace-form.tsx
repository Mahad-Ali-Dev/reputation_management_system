"use client";

import { Icon } from "@/components/shell/icon";
import { deleteAccount } from "@/lib/account/actions";
import { useState } from "react";

/**
 * Type-to-confirm delete form. The "Delete this workspace" button stays disabled
 * until the typed text matches the workspace name (same trim+lowercase compare
 * the server does), so a typo can't reach `deleteAccount`'s mismatch `throw` —
 * which, on a bare form, surfaced as a production crash page instead of a
 * message. On a real match the server soft-deletes and signs the owner out to
 * /login (expected — the workspace no longer exists).
 */
export function DeleteWorkspaceForm({ orgName }: { orgName: string }) {
  const [confirm, setConfirm] = useState("");
  const matches = confirm.trim().toLowerCase() === orgName.trim().toLowerCase();

  return (
    <form action={deleteAccount} style={{ marginTop: 18 }}>
      <label htmlFor="confirm" className="set-field__label" style={{ fontWeight: 600 }}>
        Type <strong>{orgName}</strong> to confirm
      </label>
      <input
        id="confirm"
        name="confirm"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder={orgName}
        autoComplete="off"
        className="set-input set-input--danger"
        style={{ marginTop: 8 }}
      />
      <div className="set-actions">
        <button type="submit" className="set-btn set-btn--danger" disabled={!matches}>
          <Icon name="trash" size={16} className="set-btn__ic" />
          Delete this workspace
        </button>
      </div>
    </form>
  );
}
