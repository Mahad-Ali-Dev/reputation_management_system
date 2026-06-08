/**
 * Per-source display metadata for Contacts (module 12, Wave 3b).
 *
 * Single source of truth for the contact **source badge** rendered in the
 * directory table, the contact profile header, and timeline rows. A contact's
 * `source` records WHERE it first entered the directory (manual add, CSV import,
 * a Google review, a live-chat lead, a survey reply, a connection sync, …).
 *
 * Centralized so adding a new capture source (a new POS connector, a new inbox
 * channel) is a single file change rather than N scattered UI spots — mirrors
 * `lib/reviews/source-meta.ts`.
 *
 * Pure data + a lookup. No imports, no DB — safe to import from client islands,
 * server components, server actions, and tests alike.
 */

export interface ContactSourceMeta {
  /** Human label shown on the badge. */
  label: string;
  /** Foreground (text) color for the badge. */
  fg: string;
  /** Background tint for the badge. */
  bgTint: string;
  /** Single-character glyph for the badge (no icon dependency). */
  glyph: string;
  /** Short description used in filter tooltips. */
  description: string;
}

/**
 * Canonical source keys. These are the values written to `Contact.source` and
 * `ContactActivity.source`. UI labels like "Manual Entry" map to `manual`.
 *
 * Keep in sync with the auto-capture call sites (review fetch, survey submit,
 * live-chat lead capture, social ingest, review-request fanout, connection sync)
 * and the import/manual-add actions.
 */
export const CONTACT_SOURCES = {
  manual: {
    label: "Manual Entry",
    fg: "#475569",
    bgTint: "#F1F5F9",
    glyph: "M",
    description: "Added by hand from the Add Contact form.",
  },
  csv: {
    label: "CSV Import",
    fg: "#0F766E",
    bgTint: "#E0F7EF",
    glyph: "C",
    description: "Bulk-imported from a CSV file.",
  },
  import: {
    label: "Import",
    fg: "#0F766E",
    bgTint: "#E0F7EF",
    glyph: "I",
    description: "Imported from an uploaded file.",
  },
  google_review: {
    label: "Google Review",
    fg: "#1A73E8",
    bgTint: "#E8F0FE",
    glyph: "G",
    description: "Auto-captured from a Google Business Profile review.",
  },
  review: {
    label: "Review",
    fg: "#1A73E8",
    bgTint: "#E8F0FE",
    glyph: "R",
    description: "Auto-captured from an ingested review.",
  },
  airbnb_review: {
    label: "Airbnb Review",
    fg: "#FF385C",
    bgTint: "#FFE6EC",
    glyph: "Ab",
    description: "Auto-captured from an Airbnb review (forwarded host email).",
  },
  review_request: {
    label: "Review Request",
    fg: "#7C3AED",
    bgTint: "#F3ECFD",
    glyph: "Rq",
    description: "Captured when a review request was sent to this customer.",
  },
  survey: {
    label: "Survey",
    fg: "#4F46E5",
    bgTint: "#EEF0FE",
    glyph: "S",
    description: "Captured from a survey invite or response.",
  },
  live_chat: {
    label: "Live Chat",
    fg: "#2563EB",
    bgTint: "#E6EEFE",
    glyph: "Lc",
    description: "Captured from a website live-chat lead.",
  },
  social_dm: {
    label: "Social DM",
    fg: "#DB2777",
    bgTint: "#FCE7F3",
    glyph: "Dm",
    description: "Captured from a social direct message.",
  },
  social_comment: {
    label: "Social Comment",
    fg: "#DB2777",
    bgTint: "#FCE7F3",
    glyph: "Sc",
    description: "Captured from a social comment.",
  },
  sms: {
    label: "SMS",
    fg: "#9333EA",
    bgTint: "#F3E8FF",
    glyph: "Tx",
    description: "Captured from an SMS interaction.",
  },
  phone: {
    label: "Phone",
    fg: "#0891B2",
    bgTint: "#E0F7FB",
    glyph: "Ph",
    description: "Captured from an inbound phone call.",
  },
  shopify: {
    label: "Shopify",
    fg: "#5E8E3E",
    bgTint: "#EAF3E1",
    glyph: "Sh",
    description: "Synced from a connected Shopify store.",
  },
  hubspot: {
    label: "HubSpot",
    fg: "#FF7A59",
    bgTint: "#FFEDE7",
    glyph: "Hs",
    description: "Synced from a connected HubSpot account.",
  },
  square: {
    label: "Square",
    fg: "#1C1C1C",
    bgTint: "#ECECEC",
    glyph: "Sq",
    description: "Synced from a connected Square account.",
  },
  toast: {
    label: "Toast",
    fg: "#FF4C00",
    bgTint: "#FFE9E0",
    glyph: "To",
    description: "Synced from a connected Toast POS.",
  },
  clover: {
    label: "Clover",
    fg: "#00874E",
    bgTint: "#E0F4EA",
    glyph: "Cl",
    description: "Synced from a connected Clover POS.",
  },
} as const satisfies Record<string, ContactSourceMeta>;

export type ContactSourceKey = keyof typeof CONTACT_SOURCES;

const FALLBACK: ContactSourceMeta = {
  label: "Other",
  fg: "#475569",
  bgTint: "#F1F5F9",
  glyph: "•",
  description: "Other source.",
};

/**
 * Resolve display metadata for any `source` string. Unknown sources get a
 * stable neutral badge whose label/glyph derive from the raw value — never
 * throws, so a brand-new connector source still renders.
 */
export function getContactSourceMeta(source: string | null | undefined): ContactSourceMeta {
  if (!source) return FALLBACK;
  const known = (CONTACT_SOURCES as Record<string, ContactSourceMeta | undefined>)[source];
  if (known) return known;
  return {
    ...FALLBACK,
    label: source
      .split("_")
      .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(" "),
    glyph: source.charAt(0).toUpperCase(),
    description: source,
  };
}

/**
 * UI-label → canonical source key. The Add Contact form shows "Manual Entry";
 * we store `manual`. Anything unrecognized falls through unchanged (already a
 * canonical key, or a connector id).
 */
export function normalizeSourceInput(input: string | null | undefined): string {
  if (!input) return "manual";
  const v = input.trim().toLowerCase();
  const byLabel: Record<string, string> = {
    "manual entry": "manual",
    manual: "manual",
    "csv import": "csv",
    csv: "csv",
    import: "import",
  };
  return byLabel[v] ?? v.replace(/\s+/g, "_");
}
