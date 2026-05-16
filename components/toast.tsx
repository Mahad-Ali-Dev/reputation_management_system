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
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
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

const KIND_STYLES: Record<ToastKind, { bar: string; bg: string; icon: string; iconColor: string; text: string }> = {
  success: { bar: "bg-emerald-500", bg: "bg-emerald-50", icon: "✓", iconColor: "text-emerald-600", text: "text-emerald-900" },
  error:   { bar: "bg-rose-500",    bg: "bg-rose-50",    icon: "✕", iconColor: "text-rose-600",    text: "text-rose-900" },
  info:    { bar: "bg-indigo-500",  bg: "bg-indigo-50",  icon: "ℹ", iconColor: "text-indigo-600",  text: "text-indigo-900" },
  warning: { bar: "bg-amber-500",   bg: "bg-amber-50",   icon: "⚠", iconColor: "text-amber-600",   text: "text-amber-900" },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const s = KIND_STYLES[toast.kind];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border border-slate-200 ${s.bg} p-3 shadow-lg animate-in slide-in-from-right-4`}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white ${s.iconColor} font-bold text-sm`}>
        {s.icon}
      </span>
      <p className={`flex-1 text-sm ${s.text}`}>{toast.message}</p>
      <button
        type="button"
        onClick={onClose}
        className="text-slate-400 hover:text-slate-900 -mt-0.5 -mr-0.5"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
