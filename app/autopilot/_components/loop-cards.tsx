"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";
import type { JSX } from "react";
import type { RiskTolerance } from "@/lib/autopilot/policy";
import type { LoopKey } from "./controls-panel";

/**
 * The 3-up loop cards (Auto-reply / Auto-request / Auto-post) — the headline
 * automation surface from the redesign mockup. Each card flips a REAL
 * AutopilotConfig loop (state + persistence live in AutopilotShell, shared
 * with the Controls tab so the two views never disagree):
 *
 *   Auto-reply   → `autoReply5Star`     (policy.ts: low-star NEVER auto-publishes)
 *   Auto-request → `sendReviewRequests` (consent + unsubscribe enforced downstream)
 *   Auto-post    → `geoPosts`           (policy.ts: drafts unless risk = aggressive)
 *
 * Guardrail captions mirror the actual `shouldAutoAct` matrix — no marketing
 * claims the policy engine doesn't enforce.
 */

type CardDef = {
  key: LoopKey;
  title: string;
  tagline: string;
  icon: IconName;
  href: string;
  guardrail: (risk: RiskTolerance) => string;
};

const CARDS: CardDef[] = [
  {
    key: "autoReply5Star",
    title: "Auto-reply",
    tagline: "Replies to 5★ reviews in your voice. 1–4★ reviews are only ever drafted for your approval.",
    icon: "reply",
    href: "/reviews/auto-reply",
    guardrail: (risk) =>
      risk === "conservative"
        ? "Drafts everything for approval at this risk level"
        : "Never auto-publishes on negative reviews",
  },
  {
    key: "sendReviewRequests",
    title: "Auto-request",
    tagline: "Asks happy customers for a Google review after a job or resolved call.",
    icon: "send",
    href: "/outreach",
    guardrail: () => "Consent-gated · unsubscribe always honored",
  },
  {
    key: "geoPosts",
    title: "Auto-post",
    tagline: "Publishes location-targeted social posts to keep your profiles active.",
    icon: "pin",
    href: "/social/posts",
    guardrail: (risk) =>
      risk === "aggressive"
        ? "Publishes automatically at this risk level"
        : "Every post is drafted for your approval",
  },
];

export function LoopCards({
  loops,
  enabled,
  risk,
  pending,
  error,
  onToggle,
}: {
  loops: Record<LoopKey, boolean>;
  enabled: boolean;
  risk: RiskTolerance;
  pending: boolean;
  error: string | null;
  onToggle: (key: LoopKey) => void;
}): JSX.Element {
  return (
    <div>
      <section className="ap2-loops" aria-label="Autopilot loops">
        {CARDS.map((card) => {
          const on = loops[card.key];
          const live = on && enabled;
          return (
            <div key={card.key} className={`ds-card ap2-loop${live ? " ap2-loop--live" : ""}`}>
              <div className="ap2-loop__head">
                <span className={`ap2-loop__icon${on ? " is-on" : ""}`}>
                  <Icon name={card.icon} size={16} />
                </span>
                <div className="ap2-loop__titles">
                  <span className="ap2-loop__title">{card.title}</span>
                  <span className="ap2-loop__sub">
                    {live ? "Running" : on ? "Waiting for Autopilot" : "Paused"}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`Toggle ${card.title} loop`}
                  disabled={pending}
                  onClick={() => onToggle(card.key)}
                  className="ap2-switch"
                >
                  <span className="ap2-switch__knob" />
                </button>
              </div>

              <p className="ap2-loop__tag">{card.tagline}</p>

              <div className="ap2-pill">
                <span className={`ap2-pill__dot${live ? " is-on" : ""}`} />
                <span className="ap2-pill__state">{on ? "ON" : "OFF"}</span>
                <span className="ap2-pill__name">{card.title} loop</span>
                <Link href={card.href} className="ap2-pill__link">
                  Settings <Icon name="ext" size={9} />
                </Link>
              </div>

              <div className="ap2-loop__guard">
                <Icon name="checkCircle" size={13} />
                <span>{card.guardrail(risk)}</span>
              </div>
            </div>
          );
        })}
      </section>

      {!enabled && (
        <div className="ap2-loops-note">
          <Icon name="info" size={14} style={{ color: "var(--info)" }} />
          <span>Loops take effect once Autopilot is switched on above.</span>
        </div>
      )}

      {error && (
        <div className="ap2-loops-err">
          <Icon name="alert" size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
