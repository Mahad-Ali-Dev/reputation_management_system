"use client";

import { Avatar } from "@/components/shell/avatar";
import { Icon } from "@/components/shell/icon";
import type { Workspace } from "@/lib/auth/active-org";
import { switchOrg } from "@/lib/auth/active-org-actions";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
};

/** Deterministic per-workspace tone so the same org always gets the same
 *  color across renders/sessions (matches the team-roles table convention). */
function toneFor(index: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return ((index % 7) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

/**
 * Header workspace switcher — top-left of the topbar, always visible.
 *
 * A user ends up in more than one workspace by accepting a team invite (see
 * lib/auth/active-org.ts for why that's the common case, not an edge case).
 * Each row posts to the `switchOrg` server action, which validates membership
 * and sets the active-org cookie — no client-side org state to keep in sync.
 *
 * Renders even for a single-workspace user: the trigger still opens, but the
 * panel shows an explicit "only workspace" state with an invite CTA instead
 * of a switch list, so the control is never a dead end.
 */
export function WorkspaceSwitcher({ workspaces }: { workspaces: Workspace[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeIndex = workspaces.findIndex((w) => w.isActive);
  const active = activeIndex >= 0 ? workspaces[activeIndex] : workspaces[0];
  const hasOthers = workspaces.length > 1;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!active) return null;

  return (
    <div ref={wrapRef} className="tb__wswrap">
      <button
        type="button"
        className="tb__ws"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${active.name}${hasOthers ? " — switch workspace" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar name={active.name} size={20} tone={toneFor(Math.max(activeIndex, 0))} />
        <span className="tb__ws-name">{active.name}</span>
        <Icon
          name="chevD"
          size={11}
          style={{
            color: "var(--rl-muted)",
            flex: "0 0 auto",
            transform: open ? "rotate(180deg)" : undefined,
            transition: "transform .15s",
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Workspaces"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 272,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)",
            boxShadow: "var(--sh-pop)",
            padding: 5,
            zIndex: 60,
          }}
        >
          <div
            style={{
              padding: "6px 8px 4px",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--rl-muted-2)",
            }}
          >
            Your workspaces
          </div>

          {workspaces.map((w, i) => (
            <form key={w.orgId} action={switchOrg} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="orgId" value={w.orgId} />
              <button
                type="submit"
                role="menuitemradio"
                aria-checked={w.isActive}
                disabled={w.isActive}
                className="row"
                style={{
                  gap: 10,
                  width: "100%",
                  padding: "8px",
                  borderRadius: 6,
                  textAlign: "left",
                  background: w.isActive ? "var(--pri-50)" : "none",
                  border: "none",
                  cursor: w.isActive ? "default" : "pointer",
                }}
              >
                <Avatar name={w.name} size={28} tone={toneFor(i)} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--ink)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {w.name}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--rl-muted)" }}>
                    {ROLE_LABELS[w.role] ?? w.role}
                  </span>
                </span>
                {w.isActive && <Icon name="check" size={14} style={{ color: "var(--pri)" }} />}
              </button>
            </form>
          ))}

          {!hasOthers && (
            <div
              style={{
                marginTop: 4,
                padding: "12px 10px 10px",
                borderTop: "1px solid var(--line)",
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--rl-muted)", lineHeight: 1.5 }}>
                This is your only workspace. Invite teammates, or accept an invite to another
                workspace, and it'll show up here.
              </p>
              <Link
                href="/settings/team"
                onClick={() => setOpen(false)}
                className="row"
                style={{
                  justifyContent: "center",
                  gap: 6,
                  marginTop: 10,
                  padding: "7px 10px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--pri)",
                  background: "var(--pri-50)",
                  textDecoration: "none",
                }}
              >
                <Icon name="plus" size={12} />
                Invite teammates
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
