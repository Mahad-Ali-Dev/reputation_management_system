"use client";

import { Icon } from "@/components/shell/icon";
import { validateCsvHeader, type CsvColumnKind } from "@/lib/connections/csv-validate";
import { parseImportCsv } from "@/lib/contacts/import";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * CSV import pre-flight panel (client island) — surfaced from the Connections
 * "Import CSV" entry.
 *
 * Purpose: catch the most common import mistake (a spreadsheet with no email or
 * phone column) up front, with the PURE `validateCsvHeader` validator, before
 * the user is handed to the full column-mapping importer on /contacts. This is
 * a hint layer, not a gate — the contacts importer + server action remain
 * authoritative. On a valid header we route to the contacts Import/Export tab
 * (/contacts?tab=import) to finish mapping + dedupe.
 *
 * Reads the file entirely in the browser; nothing is uploaded from here.
 * RSC-safe: a `"use client"` island, mounted by a server component.
 */

const KIND_LABEL: Record<CsvColumnKind, string> = {
  name: "Name",
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
};

type State =
  | { phase: "idle" }
  | { phase: "valid"; fileName: string; columns: { header: string; kind: CsvColumnKind }[]; rows: number }
  | { phase: "invalid"; fileName: string; errors: string[]; columns: { header: string; kind: CsvColumnKind }[] };

export function CsvImportPanel() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError("Please choose a .csv file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseImportCsv(text);
      const result = validateCsvHeader(parsed.headers);
      const columns = result.columns.map((c) => ({ header: c.header, kind: c.kind }));
      if (result.ok) {
        setState({ phase: "valid", fileName: file.name, columns, rows: parsed.rows.length });
      } else {
        setState({ phase: "invalid", fileName: file.name, errors: result.errors, columns });
      }
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  }

  function reset() {
    setState({ phase: "idle" });
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Import contacts from CSV</h3>
          <p className="ds-card__sub">
            We&apos;ll check your file has the right columns, then take you to the importer to map and dedupe.
          </p>
        </div>
        <Icon name="upload" size={18} style={{ color: "var(--rl-muted-2)" }} />
      </div>

      <div className="ds-card__body">
        {state.phase === "idle" && (
          <>
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
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Needs a Name column and at least an Email or Phone column.
              </div>
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
            {error && (
              <p className="chip chip--bad" style={{ display: "inline-flex", marginTop: 12 }} role="alert">
                {error}
              </p>
            )}
          </>
        )}

        {state.phase === "valid" && (
          <div>
            <p className="chip chip--ok" style={{ display: "inline-flex" }}>
              <Icon name="checkCircle" size={13} />
              {state.fileName} looks good — {state.rows.toLocaleString()} row{state.rows === 1 ? "" : "s"}
            </p>
            <RecognizedColumns columns={state.columns} />
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" className="btn btn--sm" onClick={reset}>
                Choose another
              </button>
              <button
                type="button"
                className="btn btn--pri btn--sm"
                onClick={() => router.push("/contacts?tab=import")}
              >
                <Icon name="arrowR" size={13} />
                Continue to importer
              </button>
            </div>
          </div>
        )}

        {state.phase === "invalid" && (
          <div>
            <p className="chip chip--bad" style={{ display: "inline-flex" }} role="alert">
              <Icon name="x" size={13} />
              {state.fileName} can&apos;t be imported yet
            </p>
            <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--ink)" }}>
              {state.errors.map((e) => (
                <li key={e} style={{ marginBottom: 4 }}>
                  {e}
                </li>
              ))}
            </ul>
            {state.columns.length > 0 && <RecognizedColumns columns={state.columns} />}
            <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>
              Tip: the first row of your file is treated as the header. Rename a column to one of
              Name, Email, or Phone and re-check.
            </p>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
              <button type="button" className="btn btn--sm" onClick={reset}>
                Choose another file
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RecognizedColumns({ columns }: { columns: { header: string; kind: CsvColumnKind }[] }) {
  if (columns.length === 0) return null;
  return (
    <div className="row" style={{ gap: 6, marginTop: 12, flexWrap: "wrap" }}>
      {columns.map((c, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: header+index is stable for a parsed row.
          key={`${c.header}-${i}`}
          className="chip chip--out"
          title={`Detected as ${KIND_LABEL[c.kind]}`}
        >
          <Icon name="check" size={11} />
          {c.header || `Column ${i + 1}`} → {KIND_LABEL[c.kind]}
        </span>
      ))}
    </div>
  );
}
