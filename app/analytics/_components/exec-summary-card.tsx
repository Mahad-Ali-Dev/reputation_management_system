"use client";

import { Icon } from "@/components/shell/icon";
import { regenerateExecSummary } from "@/lib/seo/actions";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * AI Executive Summary card (Module 13). Presentational: the summary text is
 * generated server-side (`lib/seo/exec-summary.ts`) and passed in as a prop.
 * The "Regenerate" button posts to the thin `regenerateExecSummary` action and
 * refreshes the route. Shows a neutral fallback line + no "AI" badge when the
 * summary was the deterministic fallback (no ANTHROPIC_API_KEY / not entitled).
 */
export function ExecSummaryCard({
  summary,
  generatedAt,
  ai,
  canRegenerate = true,
}: {
  summary: string;
  generatedAt: string | null;
  ai: boolean;
  canRegenerate?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRegenerate() {
    startTransition(async () => {
      await regenerateExecSummary();
      router.refresh();
    });
  }

  return (
    <div
      className="ds-card"
      style={{
        background: "linear-gradient(135deg, var(--surface-2), var(--surface))",
        borderColor: "var(--pri-weak, var(--line))",
      }}
    >
      <div className="ds-card__body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--pri)", display: "inline-flex" }}>
              <Icon name="sparkle" size={16} />
            </span>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", margin: 0 }}>
              Executive summary
            </h3>
            {ai && (
              <span className="chip chip--pri" style={{ height: 18, padding: "0 7px", fontSize: 10 }}>
                AI
              </span>
            )}
          </div>
          {canRegenerate && (
            <button
              type="button"
              className="btn btn--xs"
              onClick={onRegenerate}
              disabled={pending}
              title="Regenerate the summary"
            >
              <Icon name="refresh" size={12} />
              {pending ? "…" : "Regenerate"}
            </button>
          )}
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--ink)", margin: "10px 0 0", maxWidth: 760 }}>
          {summary}
        </p>

        {generatedAt && (
          <p style={{ fontSize: 11, color: "var(--rl-muted-2)", margin: "8px 0 0" }}>
            Generated {new Date(generatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
