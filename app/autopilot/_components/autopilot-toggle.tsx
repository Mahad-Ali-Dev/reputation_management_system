"use client";

import { Icon } from "@/components/shell/icon";
import { toggleAutopilot } from "@/lib/autopilot/config-actions";
import { AutopilotNotEntitledError } from "@/lib/autopilot/errors";
import Link from "next/link";
import { type JSX, useState, useTransition } from "react";
import type { RiskTolerance } from "@/lib/autopilot/policy";

/**
 * Hero On/Off switch + risk-tolerance segmented control (Module 15).
 *
 * Calls `toggleAutopilot`. Shows a confirm step on first enable (Autopilot will
 * reply to 5★ reviews and send review requests on your behalf). Disabled with an
 * upsell hint when the org isn't entitled.
 */

const RISKS: { key: RiskTolerance; label: string; hint: string }[] = [
  { key: "conservative", label: "Conservative", hint: "Drafts everything for your approval" },
  { key: "balanced", label: "Balanced", hint: "Auto-replies to 5★, drafts the rest" },
  { key: "aggressive", label: "Aggressive", hint: "Acts on more, still never on bad reviews" },
];

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
        await toggleAutopilot(fd);
        setEnabled(nextEnabled);
        setRisk(nextRisk);
        setConfirming(false);
      } catch (err) {
        if (err instanceof AutopilotNotEntitledError || (err as { code?: string })?.code === "autopilot_not_entitled") {
          setError("Reputation Autopilot requires a paid plan.");
        } else {
          setError(err instanceof Error ? err.message : "Could not update Autopilot.");
        }
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
    <div
      className="ds-card"
      style={{
        padding: 20,
        background: enabled
          ? "linear-gradient(135deg, var(--pri-50), var(--surface))"
          : "var(--surface)",
        borderColor: enabled ? "var(--pri)" : "var(--line)",
      }}
    >
      <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: enabled ? "var(--pri)" : "var(--pri-50)",
            color: enabled ? "#fff" : "var(--pri)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="bolt" size={22} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                Reputation Autopilot {enabled ? "is on" : "is off"}
              </div>
              <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
                {enabled
                  ? "Running your reputation loop and reporting weekly."
                  : "Flip it on and repulabs runs your reputation on autopilot."}
              </div>
            </div>

            {/* Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Toggle Reputation Autopilot"
              disabled={!hasAccess || pending}
              onClick={onToggleClick}
              style={{
                width: 52,
                height: 30,
                borderRadius: 999,
                border: "none",
                background: enabled ? "var(--pri)" : "var(--rl-muted-2, #cbd5e1)",
                position: "relative",
                cursor: hasAccess && !pending ? "pointer" : "not-allowed",
                opacity: hasAccess ? 1 : 0.5,
                flexShrink: 0,
                transition: "background 120ms",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: enabled ? 25 : 3,
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#fff",
                  transition: "left 120ms",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }}
              />
            </button>
          </div>

          {/* Risk segmented control */}
          <div style={{ marginTop: 16 }}>
            <div
              className="dim"
              style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}
            >
              Risk tolerance
            </div>
            <div role="radiogroup" aria-label="Risk tolerance" style={{ display: "flex", gap: 6 }}>
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
                    className={active ? "btn btn--pri btn--xs" : "btn btn--xs"}
                    style={{ flex: 1, justifyContent: "center", cursor: hasAccess ? "pointer" : "not-allowed" }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
              {RISKS.find((r) => r.key === risk)?.hint}
            </div>
          </div>

          {!hasAccess && (
            <div
              className="row"
              style={{
                marginTop: 14,
                gap: 8,
                padding: "10px 12px",
                background: "var(--warn-soft, #fffbeb)",
                borderRadius: 8,
              }}
            >
              <Icon name="lock" size={14} style={{ color: "var(--warn)" }} />
              <span style={{ fontSize: 12.5, flex: 1 }}>
                Autopilot is a Pro feature.
              </span>
              <Link href="/subscription?feature=ai_autopilot" className="btn btn--pri btn--xs">
                Upgrade
              </Link>
            </div>
          )}

          {error && (
            <div className="row" style={{ marginTop: 12, gap: 8, color: "var(--bad)" }}>
              <Icon name="alert" size={14} />
              <span style={{ fontSize: 12.5 }}>{error}</span>
            </div>
          )}
        </div>
      </div>

      {/* First-enable confirm */}
      {confirming && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid var(--pri)",
            borderRadius: 10,
            background: "var(--surface)",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Turn on Autopilot?</div>
          <p className="dim" style={{ fontSize: 12.5, margin: "0 0 12px", lineHeight: 1.6 }}>
            Autopilot will reply to 5★ reviews and send review requests on your behalf, following
            your risk tolerance. It never auto-replies to negative reviews — those are always drafted
            or escalated to you, and you get a weekly digest of everything it did.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--pri"
              disabled={pending}
              onClick={() => submit(true, risk)}
            >
              {pending ? "Turning on…" : "Turn on Autopilot"}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
