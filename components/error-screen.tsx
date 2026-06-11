"use client";

import Link from "next/link";

/**
 * Shared branded screen for the app-wide error / not-found boundaries
 * (app/not-found.tsx, app/error.tsx, app/global-error.tsx).
 *
 * Fully self-contained inline styling (brand hexes mirror the design tokens in
 * app/globals.css: --pri #2457ff, --ink #0f172a, --bg #fbfaf6) so it renders
 * identically even from app/global-error.tsx, which replaces the root layout and
 * therefore has NO access to the global stylesheets.
 */

type Action = { label: string; href: string };

const INK = "#0f172a";
const INK_3 = "#475569";
const PRI = "#2457ff";
const LINE = "#e3eae6";

export function ErrorScreen({
  illustration,
  code,
  title,
  message,
  primary,
  secondary,
  onRetry,
  retryLabel = "Try again",
  digest,
}: {
  illustration: string;
  code?: string;
  title: string;
  message: string;
  primary?: Action;
  secondary?: Action;
  onRetry?: () => void;
  retryLabel?: string;
  digest?: string;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(at 0% 0%, rgba(36,87,255,0.05) 0%, transparent 42%), " +
          "radial-gradient(at 100% 100%, rgba(94,234,212,0.07) 0%, transparent 52%), " +
          "linear-gradient(180deg, #fbfaf6 0%, #eef1ec 100%)",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
        fontFamily:
          "var(--font-geist), system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: INK,
      }}
    >
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        {/* biome-ignore lint/a11y/useAltText: decorative illustration, aria-hidden */}
        <img
          src={illustration}
          alt=""
          width={184}
          height={184}
          aria-hidden
          style={{ marginInline: "auto", marginBottom: 4, maxWidth: "60%", height: "auto" }}
        />
        {code && (
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 11,
              letterSpacing: ".18em",
              color: "#94a3b8",
              marginBottom: 6,
            }}
          >
            {code}
          </div>
        )}
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontSize: 14.5,
            color: INK_3,
            lineHeight: 1.6,
            marginTop: 12,
            maxWidth: 400,
            marginInline: "auto",
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 26,
          }}
        >
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                ...btnBase,
                background: INK,
                color: "#fff",
                border: `1px solid ${INK}`,
              }}
            >
              {retryLabel}
            </button>
          )}
          {primary && (
            <Link
              href={primary.href}
              style={{
                ...btnBase,
                background: onRetry ? "#fff" : PRI,
                color: onRetry ? INK : "#fff",
                border: `1px solid ${onRetry ? LINE : PRI}`,
                textDecoration: "none",
              }}
            >
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link
              href={secondary.href}
              style={{
                ...btnBase,
                background: "#fff",
                color: INK_3,
                border: `1px solid ${LINE}`,
                textDecoration: "none",
              }}
            >
              {secondary.label}
            </Link>
          )}
        </div>

        {digest && (
          <p
            style={{
              marginTop: 26,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 11,
              color: "#94a3b8",
            }}
          >
            Reference: {digest}
          </p>
        )}
      </div>
    </main>
  );
}

const btnBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "11px 20px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  lineHeight: 1,
};
