"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/shell/icon";
import { rescanKb, type RescanResult } from "@/lib/ai/kb-refresh-actions";
import { BusinessInfoTab, type BusinessFields } from "./business-info-tab";
import { type KbSource, relativeTime } from "./shared";

/**
 * Knowledge tab (Module 05 — 3-tab workspace).
 *
 * The single home for everything the AI KNOWS:
 *   - Sources list (the auto-setup website document + any manual/PDF docs) with
 *     an ingestion/readiness status per source and a RE-SCAN button that reuses
 *     the weekly auto-updater pipeline (rescanKb → refreshOrgKb).
 *   - The "last refreshed / changes detected" status surfaced from the re-scan.
 *   - The editable, autosaving business-profile fields (overview / services /
 *     pricing / hours / locations) — reuses the existing <BusinessInfoTab>.
 *
 * Field state is owned by the parent KbTabs shell (single source of truth for
 * autosave); this component just renders sources above those fields.
 */

const SOURCE_ICON: Record<string, "ext" | "box" | "pin" | "edit"> = {
  url: "ext",
  pdf: "box",
  gbp_listing: "pin",
  manual: "edit",
};

function statusChip(status: string): { cls: string; label: string } {
  if (status === "indexed") return { cls: "chip chip--ok", label: "Indexed" };
  if (status === "failed") return { cls: "chip chip--bad", label: "Failed" };
  return { cls: "chip chip--warn", label: "Indexing…" };
}

export function KnowledgeTab({
  fields,
  onChange,
  sources,
  sourceUrl,
  lastAutoUpdatedAt,
}: {
  fields: BusinessFields;
  onChange: (patch: Partial<BusinessFields>) => void;
  sources: KbSource[];
  sourceUrl: string | null;
  lastAutoUpdatedAt: Date | string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RescanResult | null>(null);
  const totalChunks = sources.reduce((n, s) => n + s.chunks, 0);

  function handleRescan() {
    setResult(null);
    startTransition(async () => {
      const res = await rescanKb();
      setResult(res);
    });
  }

  return (
    <div className="col" style={{ gap: 14 }}>
      {/* Sources + re-scan */}
      <div className="ds-card">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Knowledge sources</h3>
            <div className="ds-card__sub">
              {sources.length === 0
                ? "No sources yet your AI answers from the profile fields below."
                : `${sources.length} source${sources.length === 1 ? "" : "s"} · ${totalChunks} indexed chunk${totalChunks === 1 ? "" : "s"}`}
            </div>
          </div>
          {sourceUrl && (
            <button type="button" className="btn btn--sm" onClick={handleRescan} disabled={pending}>
              <Icon name={pending ? "refresh" : "refresh"} size={13} />
              {pending ? "Re-scanning…" : "Re-scan website"}
            </button>
          )}
        </div>
        <div className="ds-card__body col" style={{ gap: 10 }}>
          {/* Last-refreshed / changes-detected status line */}
          <div
            className="row"
            style={{ gap: 10, flexWrap: "wrap", fontSize: 12.5, color: "var(--rl-muted)", alignItems: "center" }}
          >
            <Icon name="clock" size={13} />
            {lastAutoUpdatedAt ? (
              <span>Last checked {relativeTime(lastAutoUpdatedAt)}</span>
            ) : (
              <span>Not auto-checked yet</span>
            )}
            <span style={{ opacity: 0.5 }}>·</span>
            <span>Auto-refreshes weekly</span>
          </div>

          {/* Re-scan result */}
          {result?.ok === true && (
            <div className={`chip ${result.changed ? "chip--ok" : "chip--info"}`} style={{ whiteSpace: "normal" }}>
              <Icon name={result.changed ? "sparkle" : "checkCircle"} size={12} />
              {result.changed
                ? `Updated ${result.fields.length} field${result.fields.length === 1 ? "" : "s"}: ${result.fields.join(", ")}`
                : "Re-scan complete no changes detected on your site."}
            </div>
          )}
          {result?.ok === false && (
            <div className="chip chip--bad" style={{ whiteSpace: "normal" }}>
              <Icon name="alert" size={12} />
              {result.error}
            </div>
          )}

          {/* Source rows */}
          {sources.length === 0 ? (
            <div
              className="dim"
              style={{ fontSize: 13, padding: "8px 0", display: "flex", alignItems: "center", gap: 8 }}
            >
              <Icon name="info" size={15} />
              Link a website from the setup screen to give your AI a live, re-scannable source.
            </div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              {sources.map((s) => {
                const st = statusChip(s.status);
                return (
                  <div
                    key={s.id}
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "12px 14px",
                      border: "1px solid var(--line)",
                      borderRadius: "var(--r)",
                      background: "var(--surface)",
                    }}
                  >
                    <div className="row" style={{ gap: 12, minWidth: 0 }}>
                      <div
                        aria-hidden="true"
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 9,
                          background: "var(--pri-50)",
                          color: "var(--pri)",
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Icon name={SOURCE_ICON[s.sourceType] ?? "box"} size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.35 }}>{s.title}</div>
                        <div
                          className="dim"
                          style={{ fontSize: 11.5, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}
                        >
                          {s.sourceUri && (
                            <span
                              style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            >
                              {s.sourceUri.replace(/^https?:\/\//, "")}
                            </span>
                          )}
                          {s.pagesCrawled != null && <span>· {s.pagesCrawled} pages</span>}
                          <span>· {s.chunks} chunks</span>
                          {s.lastIndexedAt && <span>· indexed {relativeTime(s.lastIndexedAt)}</span>}
                        </div>
                      </div>
                    </div>
                    <span className={st.cls} style={{ flexShrink: 0 }}>
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Business profile fields (editable + autosave) */}
      <BusinessInfoTab fields={fields} onChange={onChange} />
    </div>
  );
}
