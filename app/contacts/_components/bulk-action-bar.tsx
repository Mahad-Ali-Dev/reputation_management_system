"use client";

import { Icon } from "@/components/shell/icon";
import { bulkTagContacts, bulkDeleteContacts, exportContacts } from "@/lib/contacts/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BulkRequestDialog } from "./bulk-request-dialog";

/**
 * Sticky bulk-action bar (client). Appears when ≥1 contact is selected (AC).
 *
 * Actions: Tag (add tag to selected) · Export (selected → CSV download) · Send
 * Survey (→ /surveys/new?contacts= pre-populated) · Send Review Request (opens
 * the composer dialog) · Delete (admin-only, confirm). Paid actions are gated by
 * `assertEntitled` inside the server action; non-entitled orgs see an upsell.
 *
 * When "select all matching" is active, the bar acts on the whole filtered set —
 * the server actions accept the same filter params so they resolve identically
 * to the on-screen list.
 */

type Filters = { q: string; source: string; tag: string; seg: string; sort: string };

export function BulkActionBar({
  selectedIds,
  selectionCount,
  filters,
  onClear,
  establishments,
  entitled,
  tagOptions,
}: {
  selectedIds: string[];
  selectionCount: number;
  filters: Filters;
  onClear: () => void;
  establishments: { id: string; name: string }[];
  entitled: boolean;
  tagOptions: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tagMode, setTagMode] = useState(false);
  const [tagValue, setTagValue] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idsCsv = selectedIds.join(",");

  function applyTag() {
    const tag = tagValue.trim().replace(/^#/, "");
    if (!tag) return;
    setError(null);
    const fd = new FormData();
    fd.set("contactIds", idsCsv);
    fd.set("tags", tag);
    fd.set("op", "add");
    startTransition(async () => {
      try {
        await bulkTagContacts(fd);
        setTagMode(false);
        setTagValue("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to tag contacts");
      }
    });
  }

  function handleExport() {
    // The export action exports by scope (all / current filter / segment) rather
    // than an arbitrary id list, so a selection-export downloads the rows that
    // match the directory's current filter.
    setError(null);
    const fd = new FormData();
    fd.set("format", "csv");
    fd.set("scope", "filter");
    if (filters.q) fd.set("q", filters.q);
    if (filters.source && filters.source !== "all") fd.set("source", filters.source);
    if (filters.tag && filters.tag !== "all") fd.set("tag", filters.tag);
    if (filters.seg) fd.set("seg", filters.seg);
    startTransition(async () => {
      try {
        const result = await exportContacts(fd);
        triggerDownload(result.dataUrl, result.filename);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Export failed");
      }
    });
  }

  function handleSendSurvey() {
    if (!idsCsv) return;
    router.push(`/surveys/new?contacts=${encodeURIComponent(idsCsv)}`);
  }

  function handleDelete() {
    setError(null);
    if (!window.confirm(`Delete ${selectionCount} contact${selectionCount === 1 ? "" : "s"}? This cannot be undone.`)) {
      return;
    }
    const fd = new FormData();
    fd.set("contactIds", idsCsv);
    startTransition(async () => {
      try {
        await bulkDeleteContacts(fd);
        onClear();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed (admin role required)");
      }
    });
  }

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions"
        style={{
          position: "sticky",
          bottom: 16,
          margin: "16px 12px 12px",
          zIndex: 20,
        }}
      >
        <div
          className="ds-card"
          style={{
            background: "var(--ink)",
            borderColor: "var(--ink)",
            color: "#fff",
            boxShadow: "0 12px 32px -8px rgba(11,13,14,0.45)",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
            {selectionCount.toLocaleString()} selected
          </span>

          <div style={{ flex: 1 }} />

          {tagMode ? (
            <div className="row" style={{ gap: 6 }}>
              <input
                autoFocus
                list="bulk-tag-options"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyTag();
                  else if (e.key === "Escape") setTagMode(false);
                }}
                placeholder="Tag name"
                className="ds-input"
                style={{ height: 30, width: 140, fontSize: 12.5 }}
              />
              <datalist id="bulk-tag-options">
                {tagOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <button type="button" className="btn btn--accent btn--sm" disabled={pending} onClick={applyTag}>
                Apply
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setTagMode(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <BarButton icon="hash" label="Tag" onClick={() => setTagMode(true)} disabled={pending} />
              <BarButton icon="download" label="Export" onClick={handleExport} disabled={pending} />
              <BarButton
                icon="survey"
                label="Send survey"
                onClick={handleSendSurvey}
                disabled={pending || selectedIds.length === 0}
              />
              <BarButton
                icon="send"
                label="Request review"
                onClick={() => (entitled ? setRequestOpen(true) : router.push("/subscription?feature=bulk_review_request"))}
                disabled={pending}
                locked={!entitled}
              />
              <BarButton icon="trash" label="Delete" onClick={handleDelete} disabled={pending} danger />
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear selection"
                style={{ background: "none", border: 0, color: "#cbd5e1", cursor: "pointer", display: "inline-flex", padding: 4 }}
              >
                <Icon name="x" size={16} />
              </button>
            </>
          )}
        </div>
        {error && (
          <div
            className="chip chip--bad"
            style={{ marginTop: 8, display: "inline-flex" }}
            role="alert"
          >
            {error}
          </div>
        )}
      </div>

      {requestOpen && (
        <BulkRequestDialog
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          selectedIds={selectedIds}
          selectionCount={selectionCount}
          establishments={establishments}
          onDone={() => {
            setRequestOpen(false);
            onClear();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  locked,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={locked ? "Upgrade to Pro to use this" : label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 30,
        padding: "0 10px",
        borderRadius: "var(--r-sm)",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: danger ? "#fca5a5" : "#fff",
        fontSize: 12.5,
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <Icon name={icon} size={13} />
      {label}
      {locked && <Icon name="lock" size={11} />}
    </button>
  );
}

/** Trigger a browser download from a data-URL the export action returns. */
function triggerDownload(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
