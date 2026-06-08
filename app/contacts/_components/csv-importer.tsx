"use client";

import { Icon } from "@/components/shell/icon";
import { importContactsMapped } from "@/lib/contacts/actions";
import {
  MAX_IMPORT_ROWS,
  applyMapping,
  autoMap,
  parseImportCsv,
  type ColumnMapping,
  type ImportField,
  type MappedRows,
  type ParsedCsv,
} from "@/lib/contacts/import";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

/**
 * CSV importer (client) — drag-drop + column-mapping + dedupe preview (≤10k rows).
 *
 * Reads the file in the browser, parses headers via the pure `parseImportCsv`,
 * auto-maps columns (`autoMap`), lets the user adjust the mapping, previews the
 * normalized result (`applyMapping` → records / invalid / in-file duplicates),
 * then POSTs the mapped records to `importContactsMapped` (which dedupes against
 * existing contacts on email→phone and inserts skip-duplicates, fail-soft).
 */

const FIELD_OPTIONS: { value: ImportField | "skip"; label: string }[] = [
  { value: "skip", label: "— Skip —" },
  { value: "name", label: "Full name" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "companyName", label: "Company" },
  { value: "tags", label: "Tags" },
  { value: "custom", label: "Custom field…" },
];

type Step = "upload" | "map" | "done";

export function CsvImporter() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<number, { field: ImportField | "skip"; customKey: string }>>({});
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; duplicates: number; invalid: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(file: File) {
    setError(null);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("Please choose a .csv file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const p = parseImportCsv(text);
      if (p.headers.length === 0 || p.rows.length === 0) {
        setError("That file has no data rows.");
        return;
      }
      const auto = autoMap(p.headers);
      const init: Record<number, { field: ImportField | "skip"; customKey: string }> = {};
      p.headers.forEach((_, i) => {
        const hit = auto.find((m) => m.index === i);
        init[i] = { field: hit?.field ?? "skip", customKey: "" };
      });
      setFileName(file.name);
      setFileText(text);
      setParsed(p);
      setMapping(init);
      setStep("map");
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  }

  const columnMapping: ColumnMapping[] = useMemo(() => {
    return Object.entries(mapping)
      .filter(([, m]) => m.field !== "skip")
      .map(([idx, m]) => ({
        index: Number(idx),
        field: m.field as ImportField,
        ...(m.field === "custom" ? { customKey: m.customKey.trim() || "field" } : {}),
      }));
  }, [mapping]);

  const preview: MappedRows | null = useMemo(() => {
    if (!parsed) return null;
    try {
      return applyMapping(parsed, columnMapping);
    } catch {
      return null;
    }
  }, [parsed, columnMapping]);

  const hasContactKey = columnMapping.some((m) => m.field === "email" || m.field === "phone");

  function doImport() {
    if (!preview || preview.records.length === 0 || !fileText) return;
    setError(null);
    // The server re-parses + re-applies the mapping (authoritative), then dedupes
    // against existing contacts. We send the raw text + the column mapping.
    const fd = new FormData();
    fd.set("csvText", fileText);
    fd.set("mapping", JSON.stringify(columnMapping));
    startTransition(async () => {
      try {
        const r = await importContactsMapped(fd);
        setResult({ created: r.created, duplicates: r.duplicates, invalid: r.invalid });
        setStep("done");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed.");
      }
    });
  }

  function reset() {
    setStep("upload");
    setParsed(null);
    setMapping({});
    setFileName("");
    setFileText("");
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Import from CSV</h3>
          <p className="ds-card__sub">Map columns, preview, dedupe — up to {MAX_IMPORT_ROWS.toLocaleString()} rows.</p>
        </div>
        <Icon name="upload" size={18} style={{ color: "var(--rl-muted-2)" }} />
      </div>

      <div className="ds-card__body">
        {step === "upload" && (
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              style={{
                width: "100%",
                border: `2px dashed ${dragOver ? "var(--pri)" : "var(--line-2)"}`,
                background: dragOver ? "var(--pri-50)" : "var(--surface-2)",
                borderRadius: "var(--r-md)",
                padding: "32px 16px",
                cursor: "pointer",
                textAlign: "center",
                color: "var(--rl-muted)",
              }}
            >
              <Icon name="upload" size={26} style={{ color: "var(--pri)" }} />
              <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", marginTop: 10 }}>
                Drop a CSV here, or click to browse
              </div>
              <div style={{ fontSize: 12, marginTop: 4 }}>First row is treated as headers.</div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        )}

        {step === "map" && parsed && (
          <div>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <span className="chip chip--out">
                <Icon name="grid" size={12} />
                {fileName} · {parsed.rows.length.toLocaleString()} rows
              </span>
              <button type="button" className="btn btn--ghost btn--xs" onClick={reset}>
                Choose another
              </button>
            </div>
            {parsed.truncated && (
              <p className="chip chip--warn" style={{ display: "inline-flex", marginBottom: 12 }}>
                File exceeded {MAX_IMPORT_ROWS.toLocaleString()} rows — only the first {MAX_IMPORT_ROWS.toLocaleString()} will import.
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
              {parsed.headers.map((h, i) => {
                const m = mapping[i] ?? { field: "skip", customKey: "" };
                const sample = parsed.rows[0]?.[i] ?? "";
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: header position is the stable id here.
                  <div key={i} className="row" style={{ gap: 10, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{h || `Column ${i + 1}`}</div>
                      {sample && (
                        <div className="dim" style={{ fontSize: 11.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          e.g. {sample}
                        </div>
                      )}
                    </div>
                    <Icon name="arrowR" size={13} style={{ color: "var(--rl-muted-3)" }} />
                    <select
                      className="ds-select"
                      style={{ height: 32, width: 150 }}
                      value={m.field}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [i]: { ...m, field: e.target.value as ImportField | "skip" } }))
                      }
                    >
                      {FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {m.field === "custom" && (
                      <input
                        className="ds-input"
                        style={{ height: 32, width: 120 }}
                        placeholder="Field key"
                        value={m.customKey}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [i]: { ...m, customKey: e.target.value } }))}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Preview summary */}
            {preview && (
              <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <span className="chip chip--ok">{preview.records.length.toLocaleString()} to import</span>
                {preview.duplicatesInFile > 0 && (
                  <span className="chip chip--out">{preview.duplicatesInFile.toLocaleString()} in-file duplicates</span>
                )}
                {preview.invalid.length > 0 && (
                  <span className="chip chip--warn">{preview.invalid.length.toLocaleString()} invalid (need email or phone)</span>
                )}
              </div>
            )}

            {!hasContactKey && (
              <p className="chip chip--warn" style={{ display: "inline-flex", marginTop: 12 }}>
                Map at least an Email or Phone column to import.
              </p>
            )}

            {error && (
              <p className="chip chip--bad" style={{ display: "inline-flex", marginTop: 12 }} role="alert">
                {error}
              </p>
            )}

            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn--sm" onClick={reset} disabled={pending}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--pri btn--sm"
                disabled={pending || !preview || preview.records.length === 0 || !hasContactKey}
                onClick={doImport}
              >
                {pending ? "Importing…" : `Import ${preview?.records.length.toLocaleString() ?? 0}`}
              </button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <span style={{ color: "var(--ok, #047857)", display: "inline-flex" }}>
              <Icon name="checkCircle" size={32} />
            </span>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginTop: 10 }}>Import complete</h4>
            <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <span className="chip chip--ok">{result.created.toLocaleString()} created</span>
              {result.duplicates > 0 && <span className="chip chip--out">{result.duplicates.toLocaleString()} duplicates skipped</span>}
              {result.invalid > 0 && <span className="chip chip--warn">{result.invalid.toLocaleString()} invalid skipped</span>}
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn--sm" onClick={reset}>
                Import another file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
