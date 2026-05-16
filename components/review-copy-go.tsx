"use client";

import { useState } from "react";

/**
 * "Copy & Go" — copies the reply text to clipboard + opens the Google review URL
 * in a new tab so the owner can paste it directly into Google's reply box.
 *
 * Used when the user wants to bypass our publish-via-API path (e.g. for businesses
 * without GBP API access yet, or when they want to tweak in Google's UI).
 */
export function ReviewCopyGo({
  replyBody,
  googleReviewUrl,
}: {
  replyBody: string;
  googleReviewUrl: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(replyBody);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (googleReviewUrl) {
        window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      // Clipboard API may be denied — fall back to opening only
      if (googleReviewUrl) {
        window.open(googleReviewUrl, "_blank", "noopener,noreferrer");
      }
    }
  }

  if (!replyBody || !googleReviewUrl) return null;

  return (
    <button
      onClick={handleClick}
      className="rounded-md border border-input bg-white px-3 py-1 text-xs font-medium hover:bg-slate-50"
      type="button"
      title="Copy the AI reply to your clipboard and open Google so you can paste it"
    >
      {copied ? "✓ Copied" : "Copy & Go"}
    </button>
  );
}
