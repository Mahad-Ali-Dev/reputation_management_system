"use client";

import { Icon } from "@/components/shell/icon";
import { useState } from "react";

/**
 * Step 2 copyable webhook URL row (dark navy field + purple copy button), per
 * the provision-number kit. Pure presentational client island — copies the REAL
 * URL the server computed (the live /api/voice/* routes, not the mockup's
 * placeholder). No data, no action.
 */
export function WebhookField({
  label,
  url,
  copyLabel,
}: {
  label: string;
  url: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <div className="pr-webhook">
      <span className="pr-webhook__label">{label}</span>
      <div className="pr-webhook__field">
        <span className="pr-webhook__url">{url}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copyLabel}
          className="pr-btn pr-btn--xs"
          style={{
            background: "#4b3bef",
            color: "#fff",
            boxShadow: "none",
            flexShrink: 0,
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={13} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
