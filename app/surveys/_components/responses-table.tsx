"use client";

import { Icon } from "@/components/shell/icon";
import { exportResponsesCsv } from "@/lib/surveys/export-actions";
import type { DetailedResponse } from "@/lib/surveys/queries";
import { useState, useTransition } from "react";

/**
 * Individual-responses table (Module 11). Color-coded NPS badge, expandable
 * free-text answers (native details/summary), and an "Export CSV" button that
 * calls the `exportResponsesCsv` server action and triggers a client download.
 */
export function ResponsesTable({
  responses,
  campaignId,
}: {
  responses: DetailedResponse[];
  /** When set, the table + export scope to one campaign. */
  campaignId?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleExport() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await exportResponsesCsv(campaignId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed");
      }
    });
  }

  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row" style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Individual responses</div>
          <div className="dim" style={{ fontSize: 12 }}>
            {responses.length.toLocaleString()} shown
          </div>
        </div>
        <button
          type="button"
          className="btn btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={handleExport}
          disabled={pending || responses.length === 0}
        >
          <Icon name="download" size={12} />
          {pending ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 16px", color: "var(--bad)", fontSize: 12.5 }}>{error}</div>
      )}

      {responses.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--rl-muted-2)", fontSize: 13 }}>
          No responses yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--rl-muted)" }}>
                <Th>Recipient</Th>
                <Th>NPS</Th>
                <Th>Rating</Th>
                <Th>Comment</Th>
                <Th>Routing</Th>
                <Th>Submitted</Th>
              </tr>
            </thead>
            <tbody>
              {responses.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <Td>
                    <span style={{ fontWeight: 500 }}>{r.recipient ?? "anon"}</span>
                    {!campaignId && r.campaignName && (
                      <div className="dim" style={{ fontSize: 11 }}>
                        {r.campaignName}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <NpsBadge score={r.npsScore} />
                  </Td>
                  <Td>{r.rating === null ? <span className="dim">—</span> : `${r.rating}★`}</Td>
                  <Td>
                    {r.comment ? (
                      <details>
                        <summary
                          style={{
                            cursor: "pointer",
                            maxWidth: 280,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "var(--rl-muted)",
                          }}
                        >
                          {r.comment}
                        </summary>
                        <div style={{ marginTop: 6, whiteSpace: "pre-wrap", color: "var(--ink)", maxWidth: 360 }}>
                          {r.comment}
                        </div>
                      </details>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </Td>
                  <Td>
                    <RouteBadge route={r.smartRouteTo} />
                  </Td>
                  <Td>
                    <span className="dim" style={{ whiteSpace: "nowrap" }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: "8px 14px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 14px", verticalAlign: "top" }}>{children}</td>;
}

function NpsBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="dim">—</span>;
  const tone =
    score >= 9
      ? { bg: "var(--ok-soft, rgba(5,150,105,0.1))", fg: "var(--ok)" }
      : score >= 7
        ? { bg: "var(--warn-soft, rgba(217,119,6,0.1))", fg: "var(--warn)" }
        : { bg: "var(--bad-soft, rgba(220,38,38,0.1))", fg: "var(--bad)" };
  return (
    <span
      className="chip"
      style={{ background: tone.bg, color: tone.fg, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
    >
      {score}/10
    </span>
  );
}

function RouteBadge({ route }: { route: string | null }) {
  if (route === "review_request") {
    return (
      <span className="chip chip--ok" style={{ fontSize: 11 }}>
        → review request
      </span>
    );
  }
  if (route === "internal_alert") {
    return (
      <span className="chip chip--warn" style={{ fontSize: 11 }}>
        alerted
      </span>
    );
  }
  return <span className="dim">—</span>;
}
