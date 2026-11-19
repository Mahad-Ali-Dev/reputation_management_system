"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Dark code block with a Copy button that confirms with a tick. */
export function CopySnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="ct-code">
      <pre>
        <code>{snippet}</code>
      </pre>
      <button type="button" className="ct-copy" onClick={copy} aria-live="polite">
        {copied ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={1.8} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
