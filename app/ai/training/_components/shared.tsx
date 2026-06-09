"use client";

import { textareaStyle } from "./shared-utils";

/**
 * Client field primitives for the AI Knowledge Base tabs.
 *
 * Pure helpers, types, and style constants live in ./shared-utils (server-safe)
 * and are re-exported here so the client tab panels can keep importing
 * everything from "./shared". The SERVER page imports directly from
 * ./shared-utils (importing them through this "use client" module would make
 * them client references and crash when called during server render).
 */
export * from "./shared-utils";

export function TextareaField({
  label,
  name,
  defaultValue,
  value,
  onChange,
  rows,
  maxLength,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="col" style={{ gap: 6 }}>
      <span className="lbl">{label}</span>
      <textarea
        name={name}
        defaultValue={onChange ? undefined : defaultValue}
        value={onChange ? value : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        style={textareaStyle}
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  value,
  onChange,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="lbl">{label}</span>
      <select
        name={name}
        defaultValue={onChange ? undefined : defaultValue}
        value={onChange ? value : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        style={{
          width: "100%",
          height: 38,
          padding: "0 32px 0 14px",
          borderRadius: "var(--r)",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontFamily: "var(--f-ui)",
          fontSize: 13,
          outline: "none",
          appearance: "none",
        }}
      >
        {options.map(([v, label_]) => (
          <option key={v} value={v}>
            {label_}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A small "Saved / Saving…" pill used by the autosaving tabs. */
export function SaveState({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  const map = {
    saving: { cls: "chip", text: "Saving…" },
    saved: { cls: "chip chip--ok", text: "Saved" },
    error: { cls: "chip chip--bad", text: "Save failed" },
  } as const;
  const { cls, text } = map[state];
  return <span className={cls}>{text}</span>;
}
