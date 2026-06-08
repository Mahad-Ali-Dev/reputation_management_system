"use client";

import { useState } from "react";
import { EmptyIllustration } from "@/components/empty-state";
import { Icon } from "@/components/shell/icon";
import { scanAndBuild, type ScanResult } from "@/lib/ai/auto-setup-actions";

/**
 * Auto-Setup first-run panel (Module 05 — the "GettingStarted" surface).
 *
 * Shown when the profile is empty. Single URL input → "Scan & Build My AI"
 * runs the scanAndBuild server action (crawl → extract → populate). On error
 * renders the returned message; on success the action revalidates the page and
 * the parent flips to the populated tabs. "Skip" reveals the manual tabs.
 */
export function AutoSetup({ onSkip }: { onSkip: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  async function handleSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    let result: ScanResult;
    try {
      result = await scanAndBuild(formData);
    } catch {
      setPending(false);
      setError("Something went wrong scanning your site. Try again, or fill it in manually.");
      return;
    }
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Success → the server revalidated /ai/training; the page re-renders into
    // the populated tabs on the next paint. Keep the spinner state cleared.
  }

  return (
    <div className="ds-card" style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="ds-card__body" style={{ padding: 28, textAlign: "center" }}>
        <EmptyIllustration name="ai-assistant" size={168} style={{ marginBottom: 18 }} />
        <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Build your AI in one step
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--rl-muted)", lineHeight: 1.6, margin: "0 auto 22px", maxWidth: 440 }}>
          Drop in your website and we&apos;ll scan it to learn what your business does, your services,
          pricing and hours — then set up your AI automatically.
        </p>

        <form action={handleSubmit} className="col" style={{ gap: 12, maxWidth: 460, margin: "0 auto" }}>
          <input
            type="url"
            name="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourbusiness.com"
            disabled={pending}
            style={{
              height: 44,
              padding: "0 16px",
              borderRadius: "var(--r)",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 14,
              outline: "none",
              textAlign: "center",
            }}
          />
          <button type="submit" className="btn btn--pri btn--lg" disabled={pending} style={{ justifyContent: "center" }}>
            {pending ? (
              <>
                <Icon name="refresh" size={14} />
                Crawling your site… extracting…
              </>
            ) : (
              <>
                <Icon name="sparkle" size={14} />
                Scan &amp; build my AI
              </>
            )}
          </button>
        </form>

        {error && (
          <div
            className="chip chip--bad"
            style={{ marginTop: 16, display: "inline-flex", maxWidth: 460, whiteSpace: "normal", textAlign: "left", lineHeight: 1.4 }}
          >
            <Icon name="alert" size={13} />
            {error}
          </div>
        )}

        <div style={{ marginTop: 20, fontSize: 12.5 }}>
          <button
            type="button"
            onClick={onSkip}
            className="btn btn--ghost btn--sm"
            disabled={pending}
          >
            Skip — I&apos;ll fill it in manually
          </button>
        </div>

        <p style={{ marginTop: 14, fontSize: 11, color: "var(--rl-muted)" }}>
          HTTPS only · we honor robots.txt and never crawl private/internal addresses.
        </p>
      </div>
    </div>
  );
}
