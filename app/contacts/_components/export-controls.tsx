"use client";

import { Icon } from "@/components/shell/icon";
import { exportContacts } from "@/lib/contacts/actions";
import { useState, useTransition } from "react";

/**
 * Export controls (client). Scope (All / Current filter / a chosen Segment) →
 * `exportContacts` server action, which returns a downloadable data-URL built
 * from the SAME `listContacts` predicate the directory uses (so exports match
 * the on-screen rows). CSV is the supported format (XLSX falls back to CSV in
 * the export lib when no writer is present); we surface CSV only.
 */

type Scope = "all" | "filter" | "segment";

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
      // Carry the directory's current filters from the URL so "current filter"
      // exports exactly what the user is looking at.
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
    <div className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Export contacts</h3>
          <p className="ds-card__sub">Download a CSV of all contacts, your current filter, or a segment.</p>
        </div>
        <Icon name="download" size={18} style={{ color: "var(--rl-muted-2)" }} />
      </div>
      <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lbl" style={{ marginBottom: 8 }}>Scope</legend>
          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <ScopeRadio value="all" current={scope} onChange={setScope} label="All contacts" />
            <ScopeRadio value="filter" current={scope} onChange={setScope} label="Current filter" />
            <ScopeRadio value="segment" current={scope} onChange={setScope} label="A segment" />
          </div>
        </fieldset>

        {scope === "segment" && (
          <label style={{ display: "block", maxWidth: 280 }}>
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

        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <button type="button" className="btn btn--pri btn--sm" disabled={pending} onClick={run}>
            <Icon name="download" size={13} />
            {pending ? "Preparing…" : "Export CSV"}
          </button>
          {note && (
            <span className="chip chip--ok" role="status">
              {note}
            </span>
          )}
          {error && (
            <span className="chip chip--bad" role="alert">
              {error}
            </span>
          )}
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
    <label className="row" style={{ gap: 7, cursor: "pointer", fontSize: 13 }}>
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
