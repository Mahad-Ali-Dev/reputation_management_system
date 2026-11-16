"use client";

/**
 * Glassmorphism foundation primitives (ADDITIVE, opt-in).
 *
 * Thin React wrappers over the `.glass-*` utilities added to app/globals.css.
 * Adaptive from the start: a <GlassCanvas> sets the `glass-theme` scope + a
 * `data-glass-mode` of "light" (frosted) or "dark" (aurora); every primitive
 * below reads the same `--glass-*` tokens, so flipping the mode re-skins the
 * whole subtree. Nothing here touches production pages or the existing
 * .rl-theme / M3 component library — it lives alongside them.
 *
 * Brand hues (royal blue + teal) are reused via the glass tokens, so this
 * stays on-brand per the design spec; spacing/radius/type ride the shared
 * token scale. Build previews with these inside app/(design-preview)/.
 */

import { cn } from "@/lib/utils";
import { type LucideIcon, Moon, Sun } from "lucide-react";
import * as React from "react";

export type GlassMode = "light" | "dark";

/* ───────────────────────── Canvas + mode ───────────────────────── */

export function GlassCanvas({
  mode = "light",
  className,
  contentClassName,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  mode?: GlassMode;
  contentClassName?: string;
}) {
  return (
    <div className={cn("glass-theme glass-canvas", className)} data-glass-mode={mode} {...props}>
      <div className={cn("glass-content", contentClassName)}>{children}</div>
    </div>
  );
}

/**
 * Small controlled light/dark switch styled as a glass segmented control.
 * Keep the mode in the parent so the whole <GlassCanvas> re-skins.
 */
export function GlassModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: GlassMode;
  onChange: (mode: GlassMode) => void;
  className?: string;
}) {
  const options: Array<{ value: GlassMode; label: string; icon: LucideIcon }> = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <div
      className={cn("glass-surface inline-flex items-center gap-1 rounded-full p-1", className)}
      aria-label="Glass theme"
    >
      {options.map(({ value, label, icon: Icon }) => {
        const active = value === mode;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={`${label} theme`}
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
              active ? "glass-btn--primary text-[var(--glass-accent-contrast)]" : "glass-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Surfaces ───────────────────────── */

type GlassSurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  elevation?: "subtle" | "default" | "raised";
  hover?: boolean;
  flush?: boolean;
  padded?: boolean;
};

export const GlassSurface = React.forwardRef<HTMLDivElement, GlassSurfaceProps>(
  (
    { className, elevation = "default", hover = false, flush = false, padded = false, ...props },
    ref,
  ) => (
    <div
      ref={ref}
      className={cn(
        "glass-surface",
        padded && "glass-card",
        elevation === "raised" && "glass-surface--raised",
        elevation === "subtle" && "glass-surface--subtle",
        hover && "glass-surface--hover",
        flush && "glass-surface--flush",
        className,
      )}
      {...props}
    />
  ),
);
GlassSurface.displayName = "GlassSurface";

/** A padded glass card (the common case). */
export const GlassCard = React.forwardRef<HTMLDivElement, GlassSurfaceProps>(
  ({ padded = true, ...props }, ref) => <GlassSurface ref={ref} padded={padded} {...props} />,
);
GlassCard.displayName = "GlassCard";

export function GlassBar({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <header className={cn("glass-bar", className)} {...props}>
      {children}
    </header>
  );
}

/* ───────────────────────── Controls ───────────────────────── */

type GlassButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "default";
  size?: "sm" | "md" | "lg";
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
};

export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "md",
      leftIcon: Left,
      rightIcon: Right,
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      className={cn(
        "glass-btn",
        variant === "primary" && "glass-btn--primary",
        variant === "ghost" && "glass-btn--ghost",
        size === "sm" && "glass-btn--sm",
        size === "lg" && "glass-btn--lg",
        className,
      )}
      {...props}
    >
      {Left ? <Left strokeWidth={1.75} aria-hidden="true" /> : null}
      {children}
      {Right ? <Right strokeWidth={1.75} aria-hidden="true" /> : null}
    </button>
  ),
);
GlassButton.displayName = "GlassButton";

type GlassInputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

export const GlassInput = React.forwardRef<HTMLInputElement, GlassInputProps>(
  ({ className, label, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <div className="grid gap-1.5">
        {label ? (
          <label htmlFor={inputId} className="text-[13px] font-medium text-[var(--glass-text)]">
            {label}
          </label>
        ) : null}
        <input ref={ref} id={inputId} className={cn("glass-input", className)} {...props} />
      </div>
    );
  },
);
GlassInput.displayName = "GlassInput";

export function GlassChip({
  className,
  accent = false,
  icon: Icon,
  children,
}: {
  className?: string;
  accent?: boolean;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className={cn("glass-chip", accent && "glass-chip--accent", className)}>
      {Icon ? <Icon strokeWidth={1.75} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/* ───────────────────────── Composite ───────────────────────── */

/** A KPI tile on glass — overline label, big tabular value, optional delta. */
export function GlassStat({
  label,
  value,
  delta,
  deltaTone = "up",
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down";
  className?: string;
}) {
  return (
    <GlassCard className={cn("flex flex-col gap-2", className)}>
      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] glass-muted">
        {label}
      </span>
      <div className="flex items-end justify-between gap-3">
        <span className="text-[30px] font-semibold leading-none [font-variant-numeric:tabular-nums] text-[var(--glass-text)]">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[12px] font-semibold [font-variant-numeric:tabular-nums]",
              deltaTone === "up" ? "text-emerald-500" : "text-rose-500",
            )}
            style={{ background: "var(--glass-fill-subtle)" }}
          >
            {deltaTone === "up" ? "▲" : "▼"} {delta}
          </span>
        ) : null}
      </div>
    </GlassCard>
  );
}

export function GlassDivider({ className }: { className?: string }) {
  return <hr className={cn("glass-divider", className)} />;
}
