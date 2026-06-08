"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import { saveAutopilotConfig } from "@/lib/autopilot/config-actions";
import Link from "next/link";
import { type JSX, useState, useTransition } from "react";
import type { AutopilotConfigView } from "@/lib/autopilot/queries";

/**
 * Controls panel (Module 15) — the per-loop switch grid. Each loop has a
 * one-line explainer + a deep-link to the owning module's settings. Persists the
 * whole config via `saveAutopilotConfig` (admin-only server action). The loop
 * switches only take effect once Autopilot's master switch is on.
 */

type LoopKey =
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

export function ControlsPanel({ config }: { config: AutopilotConfigView }): JSX.Element {
  const [state, setState] = useState<Record<LoopKey, boolean>>({
    autoReply5Star: config.loops.autoReply5Star,
    draftLowStar: config.loops.draftLowStar,
    sendReviewRequests: config.loops.sendReviewRequests,
    voiceToReviewEnabled: config.loops.voiceToReviewEnabled,
    draftDisputes: config.loops.draftDisputes,
    geoPosts: config.loops.geoPosts,
    inboxAutoReply: config.loops.inboxAutoReply,
    escalateToHuman: config.loops.escalateToHuman,
    weeklyDigestEnabled: config.weeklyDigestEnabled,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function persist(next: Record<LoopKey, boolean>) {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("enabled", config.enabled ? "on" : "");
    fd.set("riskTolerance", config.riskTolerance);
    for (const k of Object.keys(next) as LoopKey[]) {
      if (next[k]) fd.set(k, "on");
    }
    startTransition(async () => {
      try {
        await saveAutopilotConfig(fd);
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  function toggle(key: LoopKey) {
    const next = { ...state, [key]: !state[key] };
    setState(next);
    persist(next);
  }

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
              onClick={() => toggle(loop.key)}
              style={{
                width: 42,
                height: 24,
                borderRadius: 999,
                border: "none",
                background: state[loop.key] ? "var(--pri)" : "var(--rl-muted-2, #cbd5e1)",
                position: "relative",
                cursor: pending ? "wait" : "pointer",
                flexShrink: 0,
                transition: "background 120ms",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: state[loop.key] ? 21 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 120ms",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                }}
              />
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
