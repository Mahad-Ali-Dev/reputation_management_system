"use client";

import { Icon } from "@/components/shell/icon";
import { tabsByGroup } from "@/lib/access/tabs";
import { inviteTeammate } from "@/lib/account/actions";
import { useMemo, useState } from "react";

const GROUPS = tabsByGroup();
const ALL_KEYS = GROUPS.flatMap((g) => g.tabs.map((t) => t.key));

/**
 * Invite-teammate form — rendered inside <InviteTeammateModal>. Email + role
 * were already here; this adds the per-invite tab access grid.
 *
 * Full access (default) sends no `tabs` fields at all — `inviteTeammate`
 * treats a missing selection as unrestricted, so existing invite behavior is
 * unchanged unless an admin deliberately opts into Custom access. Custom
 * access requires at least one tab checked: zero-selected would be
 * indistinguishable from "unrestricted" once submitted (both need to reduce
 * to the same empty list), so rather than silently upgrading a mistaken
 * empty selection to full access, the submit button just stays disabled
 * until something's picked.
 *
 * The tab grid is 2 columns and un-scrolled by design — it lives inside the
 * modal's OWN scroll container (see invite-teammate-modal.tsx), so nesting a
 * second inner scrollbar here would just be two scrollbars fighting on a
 * short viewport. Two columns is what gets all ~15 tabs to fit without
 * needing either one on a normal desktop.
 */
export function InviteTeammateForm({ onSubmitted }: { onSubmitted?: () => void }) {
  const [accessMode, setAccessMode] = useState<"full" | "custom">("full");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const canSubmit = accessMode === "full" || selected.size > 0;

  const allChecked = useMemo(() => selected.size === ALL_KEYS.length, [selected]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <form
      action={inviteTeammate}
      onSubmit={() => onSubmitted?.()}
      className="col"
      style={{ gap: 12 }}
    >
      <label className="set-field">
        <span className="set-field__label">Email</span>
        <input
          className="set-input"
          type="email"
          name="email"
          required
          maxLength={200}
          placeholder="teammate@business.com"
        />
      </label>
      <label className="set-field">
        <span className="set-field__label">Role</span>
        <select className="set-select" name="role" defaultValue="admin">
          <option value="admin">Admin · can manage data</option>
          <option value="manager">Manager · can reply + edit</option>
          <option value="viewer">Viewer · read-only</option>
          <option value="owner">Owner · full control</option>
        </select>
      </label>

      <div className="set-field">
        <span className="set-field__label">Tab access</span>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className={`set-btn set-btn--sm${accessMode === "full" ? " set-btn--primary" : ""}`}
            onClick={() => setAccessMode("full")}
            style={{ flex: 1, justifyContent: "center" }}
          >
            Full access
          </button>
          <button
            type="button"
            className={`set-btn set-btn--sm${accessMode === "custom" ? " set-btn--primary" : ""}`}
            onClick={() => setAccessMode("custom")}
            style={{ flex: 1, justifyContent: "center" }}
          >
            Custom access
          </button>
        </div>
      </div>

      {accessMode === "full" ? (
        <p className="set-field__hint" style={{ margin: 0 }}>
          Sees every tab their role allows. Switch to Custom access to limit them to specific
          tabs — useful for contractors or single-purpose teammates.
        </p>
      ) : (
        <>
          <input type="hidden" name="accessMode" value="custom" />
          <div
            style={{
              border: "1px solid var(--set-line)",
              borderRadius: 8,
              padding: "8px 12px 4px",
            }}
          >
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                padding: "0 0 8px",
                borderBottom: "1px solid var(--set-line)",
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--set-mut)" }}>
                {selected.size} of {ALL_KEYS.length} selected
              </span>
              <button
                type="button"
                onClick={() => setSelected(allChecked ? new Set() : new Set(ALL_KEYS))}
                className="set-link"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {allChecked ? "Clear all" : "Select all"}
              </button>
            </div>

            {/* `columnWidth` (not `columnCount`) lets the browser drop to a
                single column on a narrow modal instead of always forcing 2 —
                the whole point is fitting every tab without a scrollbar, on
                phone-width modals too. */}
            <div style={{ columnWidth: 210, columnGap: 20 }}>
              {GROUPS.map(({ group, tabs }) => (
                <div key={group} style={{ breakInside: "avoid", marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--set-mut-2)",
                      padding: "0 2px 3px",
                    }}
                  >
                    {group}
                  </div>
                  {tabs.map((tab) => (
                    <label
                      key={tab.key}
                      className="row"
                      style={{ gap: 8, padding: "4px 2px", cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        className="set-check"
                        name="tabs"
                        value={tab.key}
                        checked={selected.has(tab.key)}
                        onChange={() => toggle(tab.key)}
                      />
                      <Icon name={tab.icon} size={13} style={{ color: "var(--set-mut)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5 }}>{tab.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {selected.size === 0 && (
            <p className="set-field__hint" style={{ margin: 0, color: "var(--set-red, #dc2626)" }}>
              Select at least one tab, or switch back to Full access.
            </p>
          )}
        </>
      )}

      <button type="submit" className="set-btn set-btn--primary" disabled={!canSubmit}>
        <Icon name="send" size={15} className="set-btn__ic" />
        Send invitation
      </button>
      <p className="set-field__hint">
        The invite link is valid for 14 days. We&apos;ll log it for now — email delivery ships
        next release.
      </p>
    </form>
  );
}
