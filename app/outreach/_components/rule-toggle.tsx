"use client";

import { toggleAutomationRule } from "@/lib/outreach/automation-actions";
import { useState, useTransition } from "react";

/**
 * Automation rule list-row toggle (kit). Optimistically flips the switch and
 * calls the `toggleAutomationRule` server action; reverts on failure. Keyboard
 * accessible via the native checkbox under the track.
 */
export function RuleToggle({
  ruleId,
  enabled,
  label,
}: {
  ruleId: string;
  enabled: boolean;
  label: string;
}) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  function flip() {
    const next = !on;
    setOn(next);
    start(async () => {
      try {
        const res = await toggleAutomationRule(ruleId, next);
        if (!res.ok) setOn(!next);
      } catch {
        setOn(!next);
      }
    });
  }

  return (
    <label className="rr-switch" title={label}>
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={flip}
        aria-label={`Enable ${label}`}
      />
      <span className="rr-switch__track" />
    </label>
  );
}
