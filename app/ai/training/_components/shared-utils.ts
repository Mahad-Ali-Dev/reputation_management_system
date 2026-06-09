import type { CSSProperties } from "react";

/**
 * Server-safe helpers, types, and style constants for the AI Knowledge Base.
 *
 * These are PURE (no React client features) so the server page can import and
 * CALL them directly. They were split out of shared.tsx (which is "use client")
 * to fix "Attempted to call readiness() from the server but it's on the client".
 * shared.tsx re-exports everything here for the client tab panels.
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
