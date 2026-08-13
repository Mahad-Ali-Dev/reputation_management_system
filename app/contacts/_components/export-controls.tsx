"use client";

import { Icon } from "@/components/shell/icon";
import { exportContacts } from "@/lib/contacts/actions";
import { useState, useTransition } from "react";

/**
 * Export controls (client) — re-skinned to the kit. Scope (All / Current filter
 * / a chosen Segment) → `exportContacts` server action, which returns a
 * downloadable data-URL built from the SAME `listContacts` predicate the
 * directory uses (so exports match the on-screen rows). CSV only (the export lib
 * falls back to CSV when no XLSX writer is present).
 */

type Scope = "all" | "filter" | "segment";

const ART = "/assets/repulabs/contact-directory";

export function ExportControls({ segments }: { segments: { key: string; label: string }[] }) {
  const [scope, setScope] = useState<Scope>("all");
  const [segKey, setSegKey] = useState(segments[0]?.key ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function run() {
    setError(null);
    setNote(null);
    const fd = new FormData();
    fd.set("format", "csv");
    fd.set("scope", scope);
    if (scope === "segment") {
      fd.set("seg", segKey);
    } else if (scope === "filter") {
      const sp = new URLSearchParams(window.location.search);
      for (const k of ["q", "source", "tag", "seg"]) {
        const v = sp.get(k);
        if (v) fd.set(k, v);
      }
    }
    startTransition(async () => {
      try {
        const result = await exportContacts(fd);
        triggerDownload(result.dataUrl, result.filename);
        setNote(`Exported ${result.count.toLocaleString()} contact${result.count === 1 ? "" : "s"}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed.");
      }
    });
  }

  return (
    <div className="cd-card">
      <div className="cd-sec-head" style={{ borderBottom: "none" }}>
        <div>
          <h3 className="cd-sec-title">Export contacts</h3>
          <p className="cd-sec-sub">Download a CSV of all contacts, your current filter, or a segment.</p>
        </div>
      </div>
      <div className="cd-export">
        <div className="cd-export__ctrls">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "var(--cd-muted)",
                marginBottom: 10,
              }}
            >
              Export scope
            </legend>
            <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
              <ScopeRadio value="all" current={scope} onChange={setScope} label="All contacts" />
              <ScopeRadio value="filter" current={scope} onChange={setScope} label="Current filter" />
              <ScopeRadio value="segment" current={scope} onChange={setScope} label="A segment" />
            </div>
          </fieldset>

          {scope === "segment" && (
            <label style={{ display: "block", maxWidth: 280, marginTop: 12 }}>
              <span className="lbl">Segment</span>
              <select className="ds-select" value={segKey} onChange={(e) => setSegKey(e.target.value)}>
                {segments.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="row" style={{ gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
            <button type="button" className="btn btn--pri btn--sm" disabled={pending} onClick={run}>
              <Icon name="download" size={13} />
              {pending ? "Preparing…" : "Export CSV"}
            </button>
            <span className="cd-fmt">.csv file · UTF-8</span>
            {note && (
              <span className="cd-badge cd-badge--ok" role="status">
                {note}
              </span>
            )}
            {error && (
              <span className="cd-badge cd-badge--warn" role="alert">
                {error}
              </span>
            )}
          </div>
        </div>
        <div className="cd-export__art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/export-list.svg`} alt="" aria-hidden className="cd-illus cd-illus--export" />
        </div>
      </div>
    </div>
  );
}

function ScopeRadio({
  value,
  current,
  onChange,
  label,
}: {
  value: Scope;
  current: Scope;
  onChange: (s: Scope) => void;
  label: string;
}) {
  return (
    <label className="row" style={{ gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--cd-ink-2)" }}>
      <input type="radio" name="export-scope" checked={current === value} onChange={() => onChange(value)} />
      {label}
    </label>
  );
}

function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
