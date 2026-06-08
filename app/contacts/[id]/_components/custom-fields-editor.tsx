"use client";

import { Icon } from "@/components/shell/icon";
import { removeContactCustomField, upsertContactCustomField } from "@/lib/contacts/actions";
import type { ContactCustomFieldRow } from "@/lib/contacts/queries";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Custom fields editor (client). Dynamic key/value rows over
 * `ContactCustomField`: upsert via `upsertContactCustomField`, delete via
 * `removeContactCustomField` (both keyed on `contactId` + `key`). AC: custom
 * fields are dynamic.
 */

export function CustomFieldsEditor({
  contactId,
  initialFields,
}: {
  contactId: string;
  initialFields: ContactCustomFieldRow[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<ContactCustomFieldRow[]>(initialFields);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function upsert(key: string, value: string) {
    setError(null);
    const fd = new FormData();
    fd.set("contactId", contactId);
    fd.set("key", key);
    fd.set("value", value);
    startTransition(async () => {
      try {
        await upsertContactCustomField(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save field.");
      }
    });
  }

  function addField() {
    const key = newKey.trim();
    if (!key) return;
    // Optimistic: reflect locally, then persist.
    setFields((prev) => {
      const existing = prev.find((f) => f.key === key);
      if (existing) return prev.map((f) => (f.key === key ? { ...f, value: newValue } : f));
      return [...prev, { id: `tmp-${key}`, key, value: newValue }];
    });
    upsert(key, newValue);
    setNewKey("");
    setNewValue("");
  }

  function saveValue(key: string, value: string) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, value } : f)));
    upsert(key, value);
  }

  function remove(key: string) {
    setError(null);
    const prev = fields;
    setFields((p) => p.filter((f) => f.key !== key));
    const fd = new FormData();
    fd.set("contactId", contactId);
    fd.set("key", key);
    startTransition(async () => {
      try {
        await removeContactCustomField(fd);
        router.refresh();
      } catch (e) {
        setFields(prev);
        setError(e instanceof Error ? e.message : "Failed to remove field.");
      }
    });
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <h3 className="ds-card__title">Custom fields</h3>
        <Icon name="sliders" size={16} style={{ color: "var(--rl-muted-2)" }} />
      </div>
      <div className="ds-card__body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {fields.length === 0 ? (
          <span className="dim" style={{ fontSize: 12.5 }}>
            No custom fields. Add key/value pairs like “Birthday → June 3”.
          </span>
        ) : (
          fields.map((f) => (
            <div key={f.id || f.key} className="row" style={{ gap: 8, alignItems: "center" }}>
              <span style={{ flex: "0 0 38%", fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)", wordBreak: "break-word" }}>
                {f.key}
              </span>
              <input
                className="ds-input"
                style={{ height: 30, flex: 1 }}
                defaultValue={f.value}
                onBlur={(e) => {
                  if (e.target.value !== f.value) saveValue(f.key, e.target.value);
                }}
                aria-label={`${f.key} value`}
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => remove(f.key)}
                aria-label={`Remove ${f.key}`}
                disabled={pending}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))
        )}

        {/* Add row */}
        <div className="row" style={{ gap: 8, marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          <input
            className="ds-input"
            style={{ height: 30, flex: "0 0 38%" }}
            placeholder="Field name"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <input
            className="ds-input"
            style={{ height: 30, flex: 1 }}
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addField();
              }
            }}
          />
          <button type="button" className="btn btn--sm" onClick={addField} disabled={pending || !newKey.trim()}>
            <Icon name="plus" size={13} />
          </button>
        </div>

        {error && (
          <p className="chip chip--bad" style={{ display: "inline-flex" }} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
