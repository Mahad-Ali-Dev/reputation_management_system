"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";
import type { JSX } from "react";
import type { AutopilotConfigView } from "@/lib/autopilot/queries";

/**
 * Controls panel (Module 15) — the per-loop switch grid. Each loop has a
 * one-line explainer + a deep-link to the owning module's settings.
 *
 * CONTROLLED: loop state + persistence live in the parent AutopilotShell (so
 * the 3-up loop cards and this list share one source of truth — flipping a
 * card flips here too, and both go through the same `saveAutopilotConfig`
 * admin-only server action).
 */

export type LoopKey =
  | "autoReply5Star"
  | "draftLowStar"
  | "sendReviewRequests"
  | "voiceToReviewEnabled"
  | "draftDisputes"
  | "geoPosts"
  | "inboxAutoReply"
  | "escalateToHuman"
  | "weeklyDigestEnabled";

const LOOPS: { key: LoopKey; label: string; hint: string; icon: IconName; href?: string }[] = [
  {
    key: "autoReply5Star",
    label: "Auto-reply to 5★ reviews",
    hint: "Publishes a reply to glowing reviews automatically.",
    icon: "star",
    href: "/reviews/auto-reply",
  },
  {
    key: "draftLowStar",
    label: "Draft replies to 1–4★ reviews",
    hint: "Writes a reply for you to approve — never auto-published.",
    icon: "edit",
    href: "/reviews/auto-reply",
  },
  {
    key: "sendReviewRequests",
    label: "Send review requests",
    hint: "Asks happy customers for a review (consent-gated).",
    icon: "send",
    href: "/outreach",
  },
  {
    key: "voiceToReviewEnabled",
    label: "Voice → Review",
    hint: "Turns resolved phone calls into review requests.",
    icon: "phone",
    href: "/phone",
  },
  {
    key: "draftDisputes",
    label: "Draft review disputes",
    hint: "Drafts a flag/dispute argument for policy-violating reviews.",
    icon: "flag",
    href: "/reviews/dispute",
  },
  {
    key: "geoPosts",
    label: "Geo posts",
    hint: "Publishes location-targeted social posts.",
    icon: "pin",
    href: "/social/posts",
  },
  {
    key: "inboxAutoReply",
    label: "Inbox auto-reply",
    hint: "Replies to routine inbox messages; escalates the rest.",
    icon: "chat",
    href: "/support",
  },
  {
    key: "escalateToHuman",
    label: "Escalate to a human",
    hint: "When unsure, queue it for you instead of acting.",
    icon: "alert",
  },
  {
    key: "weeklyDigestEnabled",
    label: "Weekly digest email",
    hint: "Sends owners a Monday summary of what Autopilot did.",
    icon: "mail",
  },
];

export function ControlsPanel({
  config,
  state,
  pending,
  saved,
  error,
  onToggle,
}: {
  config: AutopilotConfigView;
  state: Record<LoopKey, boolean>;
  pending: boolean;
  saved: boolean;
  error: string | null;
  onToggle: (key: LoopKey) => void;
}): JSX.Element {
  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">What Autopilot can do</h3>
        <span className="dim" style={{ fontSize: 12 }}>
          {pending ? "Saving…" : saved ? "Saved" : config.enabled ? "Live" : "Paused"}
        </span>
      </div>

      {!config.enabled && (
        <div
          className="row"
          style={{ margin: "12px 16px 0", gap: 8, padding: "10px 12px", background: "var(--info-soft)", borderRadius: 8 }}
        >
          <Icon name="info" size={14} style={{ color: "var(--info)" }} />
          <span style={{ fontSize: 12.5 }}>
            These take effect once Autopilot is switched on above.
          </span>
        </div>
      )}

      <div style={{ padding: "8px 8px 12px" }}>
        {LOOPS.map((loop, i) => (
          <div
            key={loop.key}
            className="row"
            style={{
              padding: 14,
              gap: 12,
              borderTop: i ? "1px solid var(--line)" : "none",
              opacity: config.enabled ? 1 : 0.7,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: state[loop.key] ? "var(--pri-50)" : "var(--rl-surface-2, #f1f5f9)",
                color: state[loop.key] ? "var(--pri)" : "var(--rl-muted-2)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={loop.icon} size={15} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{loop.label}</span>
                {loop.href && (
                  <Link href={loop.href} className="dim" style={{ fontSize: 11, textDecoration: "none" }}>
                    Settings <Icon name="ext" size={9} />
                  </Link>
                )}
              </div>
              <div className="dim" style={{ fontSize: 11.5, marginTop: 1 }}>
                {loop.hint}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={state[loop.key]}
              aria-label={loop.label}
              disabled={pending}
              onClick={() => onToggle(loop.key)}
              className="ap2-switch"
            >
              <span className="ap2-switch__knob" />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="row" style={{ padding: "0 16px 14px", gap: 8, color: "var(--bad)" }}>
          <Icon name="alert" size={14} />
          <span style={{ fontSize: 12.5 }}>{error}</span>
        </div>
      )}
    </div>
  );
}
