"use client";

import { Icon } from "@/components/shell/icon";
import { exportResponsesCsv } from "@/lib/surveys/export-actions";
import type { DetailedResponse } from "@/lib/surveys/queries";
import { useState, useTransition } from "react";

/**
 * Individual-responses table (Module 11), re-skinned to the "Customer Surveys"
 * kit: NPS-group summary chips, initials avatars, star rating, sentiment pills
 * and a per-row View button. "Export CSV" calls the `exportResponsesCsv` server
 * action and triggers a client download. The empty state is the kit's dashed
 * envelope panel. All values come from live data.
 */

const KIT = "/assets/repulabs/customer-surveys";

/** Deterministic avatar background from initials (kit lavender/blue/green rota). */
const AVATAR_BG = ["#8775f6", "#5b9dfb", "#63c9a8", "#9586fd", "#fca62c"];

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

  // NPS-group summary chips from the loaded responses (live data only).
  const scored = responses.filter((r) => r.npsScore !== null);
  const promoters = scored.filter((r) => (r.npsScore as number) >= 9).length;
  const detractors = scored.filter((r) => (r.npsScore as number) <= 6).length;
  const passives = scored.length - promoters - detractors;
  const avgRating =
    scored.length > 0
      ? (scored.reduce((a, r) => a + (r.npsScore as number), 0) / scored.length).toFixed(1)
      : null;
  const pct = (n: number) => (scored.length > 0 ? `${((n / scored.length) * 100).toFixed(1)}%` : "0%");

  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        className="row"
        style={{ padding: "16px 20px", gap: 12, flexWrap: "wrap", alignItems: "center", borderBottom: "1px solid var(--surv-line-soft)" }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--surv-ink)", letterSpacing: "-0.01em" }}>
            Individual responses
          </div>
          <div className="surv-card-sub">{responses.length.toLocaleString()} responses</div>
        </div>

        {scored.length > 0 && (
          <div className="surv-chips" style={{ marginLeft: "auto" }}>
            <span className="surv-chip">
              <span className="surv-theme-dot" style={{ background: "var(--surv-ok)" }} />
              Promoters <b style={{ color: "var(--surv-ok)" }}>{promoters}</b>{" "}
              <span className="dim">({pct(promoters)})</span>
            </span>
            <span className="surv-chip">
              <span className="surv-theme-dot" style={{ background: "var(--surv-yellow)" }} />
              Passives <b style={{ color: "var(--surv-warn)" }}>{passives}</b>{" "}
              <span className="dim">({pct(passives)})</span>
            </span>
            <span className="surv-chip">
              <span className="surv-theme-dot" style={{ background: "var(--surv-bad)" }} />
              Detractors <b style={{ color: "var(--surv-bad)" }}>{detractors}</b>{" "}
              <span className="dim">({pct(detractors)})</span>
            </span>
            {avgRating && (
              <span className="surv-chip">
                Avg. rating <b style={{ color: "var(--surv-pri)" }}>{avgRating}/10</b>
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          className="surv-tab-action"
          style={{ height: 36 }}
          onClick={handleExport}
          disabled={pending || responses.length === 0}
        >
          <Icon name="download" size={13} />
          {pending ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error && <div style={{ padding: "10px 20px", color: "var(--surv-bad)", fontSize: 12.5 }}>{error}</div>}

      {responses.length === 0 ? (
        <div className="surv-dashed">
          <div className="surv-dashed__art" aria-hidden>
            <img src={`${KIT}/results/responses.svg`} alt="" />
          </div>
          <div>
            <h3>No responses yet</h3>
            <p>When customers complete your survey, their responses will appear here.</p>
            <a href="/surveys/new" className="btn btn--pri btn--sm">
              <Icon name="play" size={13} />
              Learn how surveys work
            </a>
          </div>
        </div>
      ) : (
        <div className="surv-table-wrap">
          <table className="surv-table">
            <caption className="sr-only">Individual survey responses</caption>
            <thead>
              <tr>
                <th scope="col">Customer</th>
                <th scope="col">Rating</th>
                <th scope="col">Sentiment</th>
                <th scope="col">Response preview</th>
                <th scope="col">Date</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {responses.map((r, i) => {
                const name = r.recipient ?? "Anonymous";
                const initials = name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? "")
                  .join("");
                const sentiment = sentimentOf(r.npsScore);
                return (
                  <tr key={r.id}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <span className="surv-avatar" style={{ background: AVATAR_BG[i % AVATAR_BG.length] }} aria-hidden>
                          {initials || "?"}
                        </span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 500, color: "var(--surv-ink)" }}>{name}</span>
                          {!campaignId && r.campaignName && (
                            <span className="dim" style={{ display: "block", fontSize: 10.5 }}>{r.campaignName}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td>
                      {r.npsScore === null ? (
                        <span className="dim">—</span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <b style={{ fontVariantNumeric: "tabular-nums", color: "var(--surv-ink)" }}>{r.npsScore}</b>
                          <Stars score={r.npsScore} />
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`surv-status surv-status--${sentiment.cls}`}>{sentiment.label}</span>
                    </td>
                    <td>
                      {r.comment ? (
                        <details>
                          <summary
                            style={{
                              cursor: "pointer",
                              maxWidth: 320,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: "var(--surv-text-2)",
                            }}
                          >
                            {r.comment}
                          </summary>
                          <div style={{ marginTop: 6, whiteSpace: "pre-wrap", color: "var(--surv-ink)", maxWidth: 420 }}>
                            {r.comment}
                          </div>
                        </details>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td>
                      <span className="dim" style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {new Date(r.createdAt).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "2-digit", year: "numeric" })}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="surv-view-btn" aria-label={`View response from ${name}`}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** NPS group → sentiment pill (promoter=positive, passive=neutral, detractor=negative). */
function sentimentOf(nps: number | null): { label: string; cls: "active" | "scheduled" | "expired" } {
  if (nps === null) return { label: "—", cls: "scheduled" };
  if (nps >= 9) return { label: "Positive", cls: "active" };
  if (nps >= 7) return { label: "Neutral", cls: "scheduled" };
  return { label: "Negative", cls: "expired" };
}

/** 0–10 NPS → 5-star row (half-star rounding). */
function Stars({ score }: { score: number }) {
  const filled = Math.round(score / 2);
  const color = score >= 7 ? "var(--surv-ok)" : score >= 4 ? "var(--surv-yellow)" : "var(--surv-bad)";
  return (
    <span className="surv-stars" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <Icon
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed 5-star positional list
          key={i}
          name="star"
          size={13}
          style={{ color: i < filled ? color : "var(--surv-line)" }}
        />
      ))}
    </span>
  );
}
