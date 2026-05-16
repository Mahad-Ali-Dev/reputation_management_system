import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";

/**
 * Shared primitives for admin pages — KPI cards, badges, table cells,
 * filter chips. Keep the surface tight; if you find yourself reaching for
 * one-off styling, prefer a one-off styled element over expanding this file.
 */

export function KpiCard({
  l,
  v,
  d,
  up,
}: {
  l: string;
  v: string;
  d?: string;
  up?: boolean;
}) {
  return (
    <div className="ds-card">
      <div className="stat">
        <div className="stat__label">{l}</div>
        <div className="stat__value">{v}</div>
        {d && <div className={`stat__delta${up ? " up" : ""}`}>{d}</div>}
      </div>
    </div>
  );
}

type BadgeTone = "ok" | "warn" | "bad" | "info" | "neutral";

const BADGE_PALETTE: Record<BadgeTone, { bg: string; fg: string }> = {
  ok: { bg: "#dcfce7", fg: "#15803d" },
  warn: { bg: "#fef3c7", fg: "#a16207" },
  bad: { bg: "#fee2e2", fg: "#b91c1c" },
  info: { bg: "#dbeafe", fg: "#1d4ed8" },
  neutral: { bg: "#f1f5f9", fg: "#475569" },
};

export function Badge({
  tone = "neutral",
  children,
  uppercase = true,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  uppercase?: boolean;
}) {
  const c = BADGE_PALETTE[tone];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: uppercase ? "uppercase" : "none",
        letterSpacing: uppercase ? "0.04em" : 0,
        display: "inline-block",
      }}
    >
      {children}
    </span>
  );
}

export function Th({
  children,
  align,
  width,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
}) {
  return (
    <th
      style={{
        padding: "10px 14px",
        textAlign: align ?? "left",
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--rl-muted)",
        width,
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align,
  mono = false,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
}) {
  return (
    <td
      style={{
        padding: "12px 14px",
        textAlign: align ?? "left",
        color: "var(--ink-2)",
        verticalAlign: "middle",
        fontFamily: mono ? "var(--f-mono)" : undefined,
        fontSize: mono ? 11.5 : undefined,
      }}
    >
      {children}
    </td>
  );
}

export function TableCard({
  children,
  empty,
  emptyText,
}: {
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="ds-card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          {children}
        </table>
      </div>
      {empty && (
        <div
          style={{
            padding: 60,
            textAlign: "center",
            color: "var(--rl-muted)",
            fontSize: 13,
          }}
        >
          {emptyText ?? "No rows."}
        </div>
      )}
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr style={{ background: "var(--surface-2, #fafbf8)" }}>{children}</tr>
    </thead>
  );
}

export function TRow({ children, key }: { children: React.ReactNode; key?: string }) {
  return (
    <tr key={key} style={{ borderTop: "1px solid var(--line)" }}>
      {children}
    </tr>
  );
}

export function SearchInput({
  name,
  defaultValue,
  placeholder,
  width = 360,
}: {
  name: string;
  defaultValue?: string;
  placeholder: string;
  width?: number;
}) {
  return (
    <div style={{ position: "relative", flex: 1, maxWidth: width }}>
      <Icon
        name="search"
        size={13}
        style={{
          position: "absolute",
          left: 10,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--rl-muted)",
        }}
      />
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "8px 12px 8px 30px",
          borderRadius: 8,
          border: "1px solid var(--line)",
          background: "var(--surface)",
          fontSize: 13,
          outline: "none",
        }}
      />
    </div>
  );
}

export function SubmitButton({
  children = "Apply",
  variant = "pri",
}: {
  children?: React.ReactNode;
  variant?: "pri" | "ghost";
}) {
  return (
    <button
      type="submit"
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        border: variant === "ghost" ? "1px solid var(--line)" : "none",
        background: variant === "ghost" ? "var(--surface)" : "var(--ink)",
        color: variant === "ghost" ? "var(--ink-2)" : "#fff",
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function CountChip({ left, right }: { left: number; right: number }) {
  return (
    <span
      className="mono dim"
      style={{ fontSize: 10.5, marginLeft: "auto", color: "var(--rl-muted)" }}
    >
      SHOWING {left} OF {right}
    </span>
  );
}

/**
 * Segmented control. `opts` is a list of `{ v, l }` pairs; `current` matches
 * `v`, and clicking renders a Link that swaps the query param `name`.
 */
export function SegFilter({
  name,
  current,
  opts,
  base,
  carry = {},
}: {
  name: string;
  current: string;
  opts: Array<{ v: string; l: string }>;
  base: string;
  carry?: Record<string, string | undefined>;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: "var(--surface-2, #fafbf8)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: 2,
      }}
    >
      {opts.map((o) => {
        const active = current === o.v;
        const qs = new URLSearchParams();
        for (const [k, v] of Object.entries(carry)) {
          if (v) qs.set(k, v);
        }
        if (o.v) qs.set(name, o.v);
        const href = qs.toString() ? `${base}?${qs.toString()}` : base;
        return (
          <Link
            key={o.v || "all"}
            href={href}
            style={{
              padding: "5px 10px",
              fontSize: 11.5,
              borderRadius: 6,
              fontWeight: active ? 600 : 500,
              color: active ? "var(--ink)" : "var(--ink-2)",
              background: active ? "var(--surface)" : "transparent",
              textDecoration: "none",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,.05)" : "none",
            }}
          >
            {o.l}
          </Link>
        );
      })}
    </div>
  );
}

export function ActionLink({
  href,
  icon,
  children,
  tone = "neutral",
}: {
  href: string;
  icon?: IconName;
  children: React.ReactNode;
  tone?: "pri" | "neutral";
}) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 12,
        padding: "6px 12px",
        borderRadius: 8,
        border: "1px solid var(--line)",
        background: tone === "pri" ? "var(--pri, #2563eb)" : "var(--surface)",
        color: tone === "pri" ? "#fff" : "var(--ink-2)",
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </Link>
  );
}
