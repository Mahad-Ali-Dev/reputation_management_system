"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

/**
 * Lightweight toast system — no dependencies.
 *
 * Wrap the app in <ToastProvider>, then anywhere call:
 *   const toast = useToast();
 *   toast.success("Saved");
 *   toast.error("Validation failed");
 *   toast.info("Cron scheduled");
 *
 * Auto-dismiss after 4s. Stack up to 5; older ones fade out.
 */

type ToastKind = "success" | "error" | "info" | "warning";
type Toast = { id: string; kind: ToastKind; message: string };

type ToastContextValue = {
  show: (kind: ToastKind, message: string) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
  warning: (m: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 5;
const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((curr) => curr.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((curr) => [...curr, { id, kind, message }].slice(-MAX_TOASTS));
      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((t) => clearTimeout(t));
      currentTimers.clear();
    };
  }, []);

  const ctx: ToastContextValue = {
    show,
    success: (m) => show("success", m),
    error: (m) => show("error", m),
    info: (m) => show("info", m),
    warning: (m) => show("warning", m),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          width: "100%",
          maxWidth: 360,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback when used outside a provider (e.g. server-rendered)
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
      warning: () => {},
    };
  }
  return ctx;
}

/**
 * Colors reuse the app's own status tokens (design-system.css/globals.css —
 * the same --ok/--bad/--warn/--info pair the settings banners and chips use)
 * rather than a separate Tailwind palette, so a toast reads as the same
 * product as everything else instead of a bolted-on component.
 */
const KIND_STYLES: Record<ToastKind, { fg: string; soft: string; icon: string }> = {
  success: { fg: "var(--ok)", soft: "var(--ok-soft)", icon: "✓" },
  error: { fg: "var(--bad)", soft: "var(--bad-soft)", icon: "✕" },
  info: { fg: "var(--info)", soft: "var(--info-soft)", icon: "ℹ" },
  warning: { fg: "var(--warn)", soft: "var(--warn-soft)", icon: "⚠" },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const s = KIND_STYLES[toast.kind];
  return (
    <div
      role="status"
      aria-live="polite"
      className="row"
      style={{
        pointerEvents: "auto",
        alignItems: "flex-start",
        gap: 10,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r-sm)",
        boxShadow: "var(--sh-pop)",
        padding: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "flex",
          flexShrink: 0,
          width: 24,
          height: 24,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "999px",
          background: s.soft,
          color: s.fg,
          fontWeight: 700,
          fontSize: 12.5,
        }}
      >
        {s.icon}
      </span>
      <p style={{ flex: 1, margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--ink)" }}>
        {toast.message}
      </p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--rl-muted)",
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
          marginTop: -1,
        }}
      >
        ×
      </button>
    </div>
  );
}
