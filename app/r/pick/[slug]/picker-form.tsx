"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import type { PlatformOption } from "./page";

/**
 * Picker-form client component. Each platform button submits to
 * `/api/r/pick/{slug}` which records the choice + 302s to the platform URL.
 *
 * The form is a tiny enhancement layer:
 *   - Optimistic disabled state on tap (prevents accidental double-record)
 *   - Inline email field for the day-after-checkout reminder opt-in
 *   - All routing happens server-side; no JS-only redirect logic
 *
 * Submits use a regular HTML form so the page still works in browsers with
 * JS disabled. (Some guest devices in our customer base are on older iOS
 * Safari versions where JS occasionally fails to load.)
 */

export function PickerForm({
  slug,
  platforms,
}: {
  slug: string;
  platforms: PlatformOption[];
}) {
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  if (platforms.length === 0) {
    return (
      <div
        style={{
          padding: 18,
          background: "#fff",
          border: "1px solid #eef1f6",
          borderRadius: 12,
          fontSize: 13.5,
          color: "#475569",
          textAlign: "center",
        }}
      >
        The host hasn&rsquo;t connected any review platforms yet. Come back later, or just leave a
        review on{" "}
        <a
          href="https://www.google.com/maps"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#2563eb", fontWeight: 500 }}
        >
          Google
        </a>
        .
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "grid", gap: 10 }}>
        {platforms.map((p) => (
          <form key={p.platform} method="POST" action={`/api/r/pick/${slug}`} target="_top">
            <input type="hidden" name="platform" value={p.platform} />
            <input type="hidden" name="email" value={p.platform === "airbnb" ? email : ""} />
            <button
              type="submit"
              disabled={busyPlatform !== null}
              onClick={() => setBusyPlatform(p.platform)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "16px 18px",
                borderRadius: 14,
                background: p.accent,
                color: "#fff",
                border: "none",
                cursor: busyPlatform !== null ? "wait" : "pointer",
                opacity: busyPlatform === p.platform ? 0.7 : 1,
                textAlign: "left",
                fontFamily: "inherit",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                boxShadow: "0 8px 24px -10px rgba(11,13,14,.45)",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span>{busyPlatform === p.platform ? "Opening…" : p.label}</span>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 400,
                    opacity: 0.92,
                    letterSpacing: 0,
                  }}
                >
                  {p.blurb}
                </span>
              </span>
              <ArrowUpRight size={18} />
            </button>
          </form>
        ))}
      </div>

      {platforms.some((p) => p.platform === "airbnb") && (
        <div
          style={{
            marginTop: 18,
            padding: 14,
            background: "#fff",
            border: "1px solid #eef1f6",
            borderRadius: 12,
          }}
        >
          <label
            htmlFor="picker-email"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#0f172a",
              display: "block",
              marginBottom: 6,
            }}
          >
            Want a reminder?
          </label>
          <input
            id="picker-email"
            type="email"
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              height: 38,
              padding: "0 12px",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontSize: 13.5,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <p style={{ fontSize: 11.5, color: "#64748b", marginTop: 6, lineHeight: 1.5 }}>
            We&rsquo;ll send one email tomorrow with the direct link no marketing, no spam.
            Submitted only when you tap an Airbnb option above.
          </p>
        </div>
      )}
    </>
  );
}
