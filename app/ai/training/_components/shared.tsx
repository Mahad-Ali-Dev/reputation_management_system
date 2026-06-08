"use client";

import type { CSSProperties } from "react";

/**
 * Shared field primitives + helpers for the AI Knowledge Base tabs.
 * Lifted out of the original app/ai/training/page.tsx so the server page and
 * the client tab panels share one source of truth for styling + readiness.
 */

export const DAYS = [
  { key: "monday", label: "Mo" },
  { key: "tuesday", label: "Tu" },
  { key: "wednesday", label: "We" },
  { key: "thursday", label: "Th" },
  { key: "friday", label: "Fr" },
  { key: "saturday", label: "Sa" },
  { key: "sunday", label: "Su" },
] as const;

export type OperatingHours = Record<string, { open?: string; close?: string }>;

export type TrainingProfile = {
  businessOverview: string | null;
  servicesProducts: string | null;
  pricingDetails: string | null;
  locations: string | null;
  customPrompt: string | null;
  operatingHours: unknown;
  aiPersonalityStyle: string | null;
  customerInquiryStyle: string | null;
  bookingStyle: string | null;
  complaintStyle: string | null;
  supportStyle: string | null;
  sourceUrl: string | null;
  lastAutoUpdatedAt: Date | string | null;
  updatedAt: Date | string;
};

export const inputStyle: CSSProperties = {
  height: 32,
  padding: "0 10px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--f-mono)",
  fontSize: 12,
  outline: "none",
};

export const textareaStyle: CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "var(--r)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--f-ui)",
  fontSize: 13,
  lineHeight: 1.6,
  outline: "none",
  resize: "vertical",
};

export function readiness(
  profile: {
    businessOverview: string | null;
    servicesProducts: string | null;
    pricingDetails: string | null;
    customPrompt: string | null;
    operatingHours: unknown;
  } | null,
): number {
  if (!profile) return 0;
  let score = 0;
  if (profile.businessOverview && profile.businessOverview.length > 40) score += 25;
  if (profile.servicesProducts && profile.servicesProducts.length > 30) score += 20;
  if (profile.pricingDetails && profile.pricingDetails.length > 30) score += 20;
  if (profile.customPrompt && profile.customPrompt.length > 100) score += 15;
  const hours = (profile.operatingHours as OperatingHours | null) ?? {};
  const open = Object.values(hours).filter((d) => d?.open && d?.close).length;
  score += Math.min(20, open * 3);
  return Math.min(100, score);
}

export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - date.getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

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
