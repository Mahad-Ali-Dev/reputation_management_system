"use client";

import { Icon } from "@/components/shell/icon";
import { setAutoReply5Star } from "@/lib/auto-reply/toggle";
import Link from "next/link";
import { useFormStatus } from "react-dom";

/**
 * "Auto-Reply to 5-Star Reviews" toggle (Module 06).
 *
 * A single org-wide switch backed by the managed 5★ `AutoReplyRule`
 * (`lib/auto-reply/toggle.ts`). Posts an AI reply to clean 5★ reviews after a
 * randomized 2–4h delay so the cadence reads as human. Compliance: the toggle
 * NEVER exposes auto-posting for ≤4★ — those always wait for a human.
 *
 * The form submits the DESIRED next state via a hidden `enable` flag (computed
 * `!enabled`); the server action upserts/flips the managed rule. Power users
 * get a "Manage all rules" link to the full rules surface.
 */
export function AutoReplyToggle({ enabled }: { enabled: boolean }) {
  return (
    <div
      className="ds-card"
      style={{
        padding: 16,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "grid",
          placeItems: "center",
          background: enabled ? "var(--pri-50, #eff6ff)" : "var(--surface-2, #f1f5f9)",
          color: enabled ? "var(--pri, #2563eb)" : "var(--rl-muted, #64748b)",
          flexShrink: 0,
        }}
      >
        <Icon name="sparkle" size={18} />
      </div>

      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
          Auto-Reply to 5-Star Reviews
        </div>
        <p className="dim" style={{ fontSize: 12, margin: "2px 0 0", lineHeight: 1.5 }}>
          Posts an AI reply to 5★ reviews after a randomized 2–4h delay, so it reads as human.{" "}
          <Link href="/reviews/auto-reply" style={{ color: "var(--pri, #2563eb)", fontWeight: 500 }}>
            Manage all rules →
          </Link>
        </p>
      </div>

      <form action={setAutoReply5Star} style={{ flexShrink: 0 }}>
        <input type="hidden" name="enable" value={(!enabled).toString()} />
        <ToggleSwitch enabled={enabled} />
      </form>
    </div>
  );
}

function ToggleSwitch({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  // Optimistic: while submitting, paint the switch in its target state.
  const on = pending ? !enabled : enabled;
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={on}
      aria-label="Toggle auto-reply to 5-star reviews"
      disabled={pending}
      title={on ? "Turn off 5★ auto-reply" : "Turn on 5★ auto-reply"}
      style={{
        position: "relative",
        width: 46,
        height: 26,
        borderRadius: 999,
        border: "none",
        cursor: pending ? "wait" : "pointer",
        background: on ? "var(--pri, #2563eb)" : "var(--line, #cbd5e1)",
        transition: "background .15s ease",
        opacity: pending ? 0.7 : 1,
        padding: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          transition: "left .15s ease",
        }}
      />
    </button>
  );
}
