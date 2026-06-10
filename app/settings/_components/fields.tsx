/**
 * Shared presentational form primitives for the settings sections.
 *
 * Extracted verbatim from the original account-settings page so every section
 * renders identical, token-driven inputs. Pure server-renderable components
 * (no client hooks) — safe to import anywhere.
 */

export function FormField({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  mono,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="lbl">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          height: 38,
          padding: "0 14px",
          borderRadius: "var(--r)",
          border: "1px solid var(--line)",
          background: "var(--surface)",
          color: "var(--ink)",
          fontFamily: mono ? "var(--f-mono)" : "var(--f-ui)",
          fontSize: 13,
          outline: "none",
        }}
      />
    </label>
  );
}

export function FormSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<[string, string]>;
}) {
  return (
    <label className="col" style={{ gap: 4 }}>
      <span className="lbl">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
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
        {options.map(([value, label_]) => (
          <option key={value} value={value}>
            {label_}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DisplayRow({ l, v, mono }: { l: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="lbl-mono">{l}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          fontFamily: mono ? "var(--f-mono)" : undefined,
          marginTop: 4,
          wordBreak: "break-all",
        }}
      >
        {v}
      </div>
    </div>
  );
}
