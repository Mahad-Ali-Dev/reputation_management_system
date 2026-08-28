"use client";

import { Icon } from "@/components/shell/icon";
import { toggleAutopilot } from "@/lib/autopilot/config-actions";
import type { RiskTolerance } from "@/lib/autopilot/policy";
import Link from "next/link";
import { type JSX, useState, useTransition } from "react";

/**
 * The big "Autopilot is ON/OFF" control card (design-kit center column).
 *
 * Owns the master switch + risk-tolerance segmented control. Calls
 * `toggleAutopilot` (admin-only, entitlement-gated server action — returns
 * {ok|error}, never throws for expected failures). Shows a confirm step on
 * first enable. Disabled with an upsell hint when the org isn't entitled.
 * Server-rendered chrome (hero chip, Quick status) refreshes via the action's
 * revalidatePath("/autopilot").
 */

const RISKS: { key: RiskTolerance; label: string; hint: string }[] = [
  { key: "conservative", label: "Conservative", hint: "Drafts everything for your approval" },
  { key: "balanced", label: "Balanced", hint: "Auto-replies to 5★, drafts the rest" },
  { key: "aggressive", label: "Aggressive", hint: "Acts on more, still never on bad reviews" },
];

/** Kit shows the "5★" inside the risk hint in amber. */
function renderHint(hint: string): JSX.Element | string {
  const idx = hint.indexOf("5★");
  if (idx === -1) return hint;
  return (
    <>
      {hint.slice(0, idx)}
      <span className="ap2-riskhint-star">5★</span>
      {hint.slice(idx + 2)}
    </>
  );
}

export function AutopilotToggle({
  enabled: initialEnabled,
  riskTolerance: initialRisk,
  hasAccess,
}: {
  enabled: boolean;
  riskTolerance: RiskTolerance;
  hasAccess: boolean;
}): JSX.Element {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [risk, setRisk] = useState<RiskTolerance>(initialRisk);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(nextEnabled: boolean, nextRisk: RiskTolerance) {
    setError(null);
    const fd = new FormData();
    fd.set("enabled", nextEnabled ? "on" : "");
    fd.set("riskTolerance", nextRisk);
    startTransition(async () => {
      try {
        const res = await toggleAutopilot(fd);
        if (res.ok) {
          setEnabled(nextEnabled);
          setRisk(nextRisk);
          setConfirming(false);
        } else {
          setError(res.message);
        }
      } catch (err) {
        // Network failure / unexpected — the action itself returns errors.
        setError(err instanceof Error ? err.message : "Could not update Autopilot.");
      }
    });
  }

  function onToggleClick() {
    if (!hasAccess) return;
    if (!enabled) {
      // Turning ON → confirm first.
      setConfirming(true);
    } else {
      submit(false, risk);
    }
  }

  function onRiskChange(next: RiskTolerance) {
    setRisk(next);
    if (enabled) submit(true, next); // persist immediately when live
  }

  return (
    <section
      className={`ap2-card ap2-control${enabled ? " is-on" : ""}`}
      aria-label="Autopilot control"
    >
      <div className="ap2-control__body">
        <div className="ap2-control__main">
          <div className="ap2-control__kicker">Autopilot is</div>
          <div className="ap2-control__status">{enabled ? "ON" : "OFF"}</div>
          <p className="ap2-control__hint">
            {enabled
              ? "Running your reputation loop and reporting weekly."
              : "Flip it on and let Autopilot run your reputation on autopilot."}
          </p>

          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle Reputation Autopilot"
            disabled={!hasAccess || pending}
            onClick={onToggleClick}
            className={`ap2-bigswitch${!hasAccess ? " is-locked" : ""}`}
          >
            <span className="ap2-bigswitch__knob" />
          </button>
        </div>

        <img className="ap2-control__orbit" src="/assets/repulabs/autopilot/bot-orbit-v2.png" alt="" />
      </div>

      {/* Risk segmented control */}
      <div className="ap2-control__risk">
        <div className="ap2-control__risklabel">
          Risk Tolerance
          <Icon name="info" size={13} style={{ color: "var(--ap-mut)" }} />
        </div>
        <div role="radiogroup" aria-label="Risk tolerance" className="ap2-seg">
          {RISKS.map((r) => {
            const active = risk === r.key;
            return (
              <button
                key={r.key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!hasAccess || pending}
                onClick={() => onRiskChange(r.key)}
                title={r.hint}
                className={`ap2-seg__btn${active ? " is-active" : ""}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <p className="ap2-control__riskhint">
          {renderHint(RISKS.find((r) => r.key === risk)?.hint ?? "")}
        </p>
      </div>

      {!hasAccess && (
        <div className="ap2-control__upsell">
          <Icon name="lock" size={14} />
          <span>Autopilot is a Pro feature.</span>
          <Link href="/subscription?feature=ai_autopilot" className="btn btn--pri btn--xs">
            Upgrade
          </Link>
        </div>
      )}

      {error && (
        <div className="ap2-control__error" role="alert">
          <Icon name="alert" size={14} />
          <span>{error}</span>
        </div>
      )}

      {/* First-enable confirm */}
      {confirming && (
        <div className="ap2-control__confirm">
          <div className="ap2-control__confirmtitle">Turn on Autopilot?</div>
          <p className="ap2-control__confirmbody">
            Autopilot will reply to 5★ reviews and send review requests on your behalf, following
            your risk tolerance. It never auto-replies to negative reviews those are always
            drafted or escalated to you, and you get a weekly digest of everything it did.
          </p>
          <div className="ap2-control__confirmrow">
            <button
              type="button"
              className="ap2-btn-primary"
              disabled={pending}
              onClick={() => submit(true, risk)}
            >
              {pending ? "Turning on…" : "Turn on Autopilot"}
            </button>
            <button
              type="button"
              className="ap2-btn-secondary"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="ap2-control__foot">
        <span className="ap2-control__note">
          <Icon name="chat" size={13} />
          Autopilot learns and improves over time based on your feedback.
        </span>
        {/* Kit: play triangle leads the label (no trailing arrow). */}
        <Link href="/tour" className="ap2-howbtn">
          <Icon name="play" size={11} />
          See how it works
        </Link>
      </div>
    </section>
  );
}
