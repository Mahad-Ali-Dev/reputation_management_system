/**
 * Inline color-dot + label, used to caption charts.
 */
export function LegendDot({ c, label }: { c: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        color: "var(--rl-muted)",
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
      {label}
    </span>
  );
}
