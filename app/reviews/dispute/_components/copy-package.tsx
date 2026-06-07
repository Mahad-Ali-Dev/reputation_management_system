"use client";

import { useState } from "react";

/**
 * Ready-to-Send copy-buttons island (Module 08).
 *
 * Pure client: Copy Email + Copy All Details (clipboard with a 2s "Copied!"
 * confirmation) and Open Gmail (a new-tab link). The "Mark as Filed & Track"
 * form stays a server-rendered <form> on the page (progressive enhancement), so
 * it is NOT here.
 */
export function CopyPackage({
  email,
  allDetails,
  gmailHref,
}: {
  email: string;
  allDetails: string;
  gmailHref: string;
}) {
  return (
    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <CopyButton label="Copy Email" value={email} className="btn btn--ghost" />
      <CopyButton label="Copy All Details" value={allDetails} className="btn btn--pri" />
      <a href={gmailHref} target="_blank" rel="noopener noreferrer" className="btn btn--ghost">
        Open Gmail
      </a>
    </div>
  );
}

function CopyButton({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — select-and-copy
      // fallback via a hidden textarea so the button still works.
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* give up silently */
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <button type="button" className={className} onClick={copy} aria-live="polite">
      {copied ? "Copied!" : label}
    </button>
  );
}
