"use client";

import Link from "next/link";
import type { JSX } from "react";
import "./autopilot-controls.css";

/**
 * Controls panel (Module 15) — design-kit rebuild (tasks/autopilot/autopilot/
 * control section). The 9 loop switches regrouped into the kit's two cards:
 * "Customer flow" and "Safety & reporting", each row = kit badge SVG + title +
 * one-line description + green On / gray Off pill + blue toggle. Group headers
 * carry a live "N active" count pill.
 *
 * CONTROLLED: loop state + persistence live in the parent AutopilotShell (so
 * the upper controls and this list share one source of truth — both go
 * through the same `saveAutopilotConfig` admin-only server action).
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

type LoopRow = {
  key: LoopKey;
  label: string;
  desc: string;
  /** Kit badge SVG (circle + glyph baked in) under /public. */
  asset: string;
  href?: string;
};

/** Grouping, order, copy and icons follow the kit handoff exactly. */
const GROUPS: { title: string; subtitle: string; rows: LoopRow[] }[] = [
  {
    title: "Customer flow",
    subtitle: "Automations that collect, reply, and convert reviews.",
    rows: [
      {
        key: "autoReply5Star",
        label: "Auto-reply to 5-star reviews",
        desc: "Publish replies to glowing reviews automatically.",
        asset: "/assets/repulabs/autopilot/control-auto-reply-star.png",
        href: "/reviews/auto-reply",
      },
      {
        key: "draftLowStar",
        label: "Draft replies to 1–4-star reviews",
        desc: "Write replies for approval before publishing.",
        asset: "/assets/repulabs/autopilot/control-draft-replies.png",
        href: "/reviews/auto-reply",
      },
      {
        key: "sendReviewRequests",
        label: "Send review requests",
        desc: "Ask happy customers for a review.",
        asset: "/assets/repulabs/autopilot/control-review-requests.png",
        href: "/outreach",
      },
      {
        key: "voiceToReviewEnabled",
        label: "Voice to Review",
        desc: "Turn resolved calls into review requests.",
        asset: "/assets/repulabs/autopilot/control-voice-review.png",
        href: "/phone",
      },
      {
        key: "inboxAutoReply",
        label: "Inbox auto-reply",
        desc: "Answer routine inbox messages.",
        asset: "/assets/repulabs/autopilot/control-inbox-auto-reply.png",
        href: "/support",
      },
    ],
  },
  {
    title: "Safety & reporting",
    subtitle: "Guardrails, publishing, and owner updates.",
    rows: [
      {
        key: "draftDisputes",
        label: "Draft review disputes",
        desc: "Prepare policy-based dispute drafts.",
        asset: "/assets/repulabs/autopilot/control-draft-disputes.png",
        href: "/reviews/dispute",
      },
      {
        key: "geoPosts",
        label: "Geo posts",
        desc: "Publish location-targeted social posts.",
        asset: "/assets/repulabs/autopilot/control-geo-posts.png",
        href: "/social/posts",
      },
      {
        key: "escalateToHuman",
        label: "Escalate to a human",
        desc: "Pause when confidence is low.",
        asset: "/assets/repulabs/autopilot/control-human-escalation.png",
      },
      {
        key: "weeklyDigestEnabled",
        label: "Weekly digest email",
        desc: "Send owners a Monday summary.",
        asset: "/assets/repulabs/autopilot/control-weekly-digest.png",
      },
    ],
  },
];

export function ControlsPanel({
  state,
  pending,
  saved,
  error,
  onToggle,
}: {
  state: Record<LoopKey, boolean>;
  pending: boolean;
  saved: boolean;
  error: string | null;
  onToggle: (key: LoopKey) => void;
}): JSX.Element {
  return (
    <div className="apc-root">
      {/* Kit shows nothing here at rest — the save state only flashes while a
          toggle persists (floated into the tab-bar row, no layout shift). */}
      <span className={`apc-status${saved && !pending ? " is-saved" : ""}`} aria-live="polite">
        {pending ? "Saving…" : saved ? "Saved" : ""}
      </span>

      <div className="apc-grid">
        {GROUPS.map((group) => {
          const activeCount = group.rows.filter((row) => state[row.key]).length;
          return (
            <section key={group.title} className="apc-card" aria-label={group.title}>
              <header className="apc-card__head">
                <div>
                  <h3 className="apc-card__title">{group.title}</h3>
                  <p className="apc-card__subtitle">{group.subtitle}</p>
                </div>
                <span className="apc-countpill">{activeCount} active</span>
              </header>

              <div>
                {group.rows.map((row) => {
                  const on = state[row.key];
                  return (
                    <div key={row.key} className="apc-row">
                      <img
                        className="apc-row__icon"
                        src={row.asset}
                        alt=""
                        width={30}
                        height={30}
                        loading="lazy"
                      />
                      <div className="apc-row__copy">
                        <div className="apc-row__titleline">
                          <span className="apc-row__title">{row.label}</span>
                          {row.href && (
                            <Link href={row.href} className="apc-row__settings">
                              Settings
                            </Link>
                          )}
                        </div>
                        <p className="apc-row__desc">{row.desc}</p>
                      </div>
                      <span className={`apc-pill ${on ? "is-on" : "is-off"}`}>
                        {on ? "On" : "Off"}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={row.label}
                        disabled={pending}
                        onClick={() => onToggle(row.key)}
                        className={`apc-toggle${on ? " is-on" : ""}`}
                      >
                        <span className="apc-toggle__knob" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {error && (
        <div className="apc-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
