/**
 * Brand palette constants shared by the Brand settings page, its server
 * action, and the outbound review-request email renderer.
 *
 * Lives outside lib/account/actions.ts because that file is `"use server"`,
 * where only async functions may be exported (same reason constants.ts is a
 * separate file — see its header comment).
 *
 * Colors are stored on `Organization.settings.brand.colors` (the same
 * free-form JSON blob notifications/security preferences already use —
 * merge-on-write via `asJsonObject`, see updateBrandColors). A brand-new org
 * has no saved palette at all, hence DEFAULT_BRAND_COLORS: the values every
 * swatch/preview falls back to until the org customizes them.
 */

export type BrandColorKey = "primary" | "secondary" | "accent" | "neutral" | "light";

export const BRAND_COLOR_KEYS: readonly BrandColorKey[] = [
  "primary",
  "secondary",
  "accent",
  "neutral",
  "light",
];

export const DEFAULT_BRAND_COLORS: Record<BrandColorKey, string> = {
  primary: "#4F46E5",
  secondary: "#10B981",
  accent: "#EC4899",
  neutral: "#64748B",
  light: "#F1F5F9",
};

export const BRAND_COLOR_LABELS: Record<BrandColorKey, string> = {
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  neutral: "Neutral",
  light: "Light",
};

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Merge a saved (possibly partial/stale) `{primary, secondary, ...}` object
 *  over the defaults — `saved` is `Organization.settings.brand.colors`. */
export function resolveBrandColors(saved: unknown): Record<BrandColorKey, string> {
  const obj = asObject(saved);
  const result = { ...DEFAULT_BRAND_COLORS };
  for (const key of BRAND_COLOR_KEYS) {
    const value = obj[key];
    if (typeof value === "string" && HEX_COLOR_RE.test(value)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Same as `resolveBrandColors`, but unwraps the FULL `Organization.settings`
 * JSON blob (settings.brand.colors) — the shape you actually get back from a
 * plain `organization.findUnique({ select: { settings: true } })`, e.g. in
 * lib/outreach/dispatch.ts. The Brand settings page already has
 * `settingsObj.brand?.colors` pre-narrowed by its own loader, so it calls
 * `resolveBrandColors` directly instead.
 */
export function resolveBrandColorsFromSettings(settings: unknown): Record<BrandColorKey, string> {
  const brand = asObject(settings).brand;
  return resolveBrandColors(asObject(brand).colors);
}
