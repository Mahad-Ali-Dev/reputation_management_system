"use client";

import { useState } from "react";

/**
 * Generate-QR · Step 3 internal-label field with quick-pick chips.
 *
 * Client island so chips can prefill the input. Posts as `displayName` (the
 * field name the existing `generateSelfServiceQr` action already reads) — no
 * server change. Suggested presets mirror the kit mockup; the user can still
 * type any custom label.
 */
const PRESETS = ["Front desk", "Receipt insert", "Counter sign"] as const;

export function LabelField() {
  const [value, setValue] = useState("");
  return (
    <div className="gq-step__field">
      <input
        type="text"
        name="displayName"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Front desk · Receipt footer · Counter sign"
        maxLength={40}
        autoComplete="off"
        aria-label="Internal label"
        className="gq-input"
      />
      <div className="gq-chips">
        {PRESETS.map((p) => (
          <button key={p} type="button" className="gq-chip" onClick={() => setValue(p)}>
            {p}
          </button>
        ))}
      </div>
      <p className="gq-note">Just for your dashboard customers never see this.</p>
    </div>
  );
}
