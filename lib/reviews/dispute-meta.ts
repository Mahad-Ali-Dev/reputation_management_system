/**
 * Dispute Center — pure vocabulary + mapping module (Module 08, no I/O).
 *
 * The single auditable home for the dispute vocabulary the spec invents on top
 * of what the DB stores today. Imported by every dispute UI + server action so
 * the mapping lives in exactly one place.
 *
 * Two grounding decisions live here (see modules/08_dispute.md §"Status &
 * violation mapping"):
 *
 *  1. VIOLATION TYPES — the spec's 6 official Google categories are stored in
 *     the new `violation_type` column, but every write ALSO sets the legacy
 *     `reason` column (via `legacyReasonFor`) to the nearest of the 5 values the
 *     live DB's `review_disputes_reason_chk` already allows. That dual-write
 *     means the legacy CHECK never has to change and the per-review detail card
 *     keeps rendering.
 *
 *  2. STATUS — the spec's 4 user-facing badges (Pending / Under Review /
 *     Removed / Rejected) are a PRESENTATION layer over the stored set
 *     {submitted, submitted_to_google, accepted, rejected, withdrawn, removed}.
 *     `accepted` is treated as a legacy synonym of `removed` so historical rows
 *     render correctly. The only stored-value addition is `removed`.
 *
 * Tailwind badge classes reuse the existing palette already in
 * `app/reviews/[id]/page.tsx` so the badges match the rest of the app.
 */

/**
 * The 6 stored violation values. These MUST match the live DB CHECK constraint
 * `review_disputes_violation_type_chk` shipped in the Wave-0 master_delta
 * migration (prisma/migrations/20260607020000_master_delta/migration.sql) — the
 * migration is the frozen source of truth for what the column accepts. The
 * user-facing wording (Harassment, Hate speech, Personal information) lives in
 * the `label`/`blurb` below; the stored *values* mirror the CHECK so writes
 * never hit 23514 on the migrated DB.
 */
export const VIOLATION_VALUES = [
  "spam_fake",
  "off_topic",
  "conflict_of_interest",
  "profanity_harassment",
  "discrimination",
  "illegal_content",
] as const;

export type ViolationType = (typeof VIOLATION_VALUES)[number];

export type ViolationMeta = {
  value: ViolationType;
  /** Card title in the wizard's Step 2. */
  label: string;
  /** One-line description shown under the title. */
  blurb: string;
  /** The official Google policy this maps to (shown small, for honesty). */
  policy: string;
};

/**
 * The 6 official Google review-removal categories, in the order the wizard
 * renders them. Wording mirrors Google's own policy language so the argument
 * the AI drafts cites the right policy.
 */
export const VIOLATION_TYPES: readonly ViolationMeta[] = [
  {
    value: "spam_fake",
    label: "Spam or fake",
    blurb: "Posted by a bot, a competitor, or someone who was never a customer.",
    policy: "Fake engagement",
  },
  {
    value: "off_topic",
    label: "Off-topic",
    blurb: "Not about a genuine experience at this business or location.",
    policy: "Off-topic",
  },
  {
    value: "conflict_of_interest",
    label: "Conflict of interest",
    blurb: "Left by a competitor, a current/former employee, or yourself.",
    policy: "Conflict of interest",
  },
  {
    value: "profanity_harassment",
    label: "Profanity, harassment, or bullying",
    blurb: "Contains profanity, or targets a person with intent to harass, threaten, or bully.",
    policy: "Harassment & bullying",
  },
  {
    value: "discrimination",
    label: "Hate speech or discrimination",
    blurb: "Promotes hatred, discrimination, or violence against a protected group.",
    policy: "Hate speech",
  },
  {
    value: "illegal_content",
    label: "Illegal or restricted content",
    blurb: "Promotes illegal activity, or exposes private personal information.",
    policy: "Restricted, illegal & personal content",
  },
] as const;

export function isViolationType(v: unknown): v is ViolationType {
  return typeof v === "string" && (VIOLATION_VALUES as readonly string[]).includes(v);
}

export function violationMeta(v: ViolationType): ViolationMeta {
  const meta = VIOLATION_TYPES.find((x) => x.value === v);
  // VIOLATION_TYPES is exhaustive over ViolationType, so this is always defined;
  // the fallback keeps the return type non-null for callers.
  return meta ?? VIOLATION_TYPES[0]!;
}

export function violationLabel(v: string | null | undefined): string {
  if (v && isViolationType(v)) return violationMeta(v).label;
  return "Unspecified";
}

export type LegacyReason = "fake" | "offensive" | "conflict_of_interest" | "wrong_business" | "other";

/**
 * Dual-write map: every new violation type → the nearest legacy `reason` value
 * the live DB's `review_disputes_reason_chk` accepts. Writing both columns keeps
 * that CHECK valid with no migration to the `reason` constraint.
 */
export function legacyReasonFor(v: ViolationType): LegacyReason {
  switch (v) {
    case "spam_fake":
      return "fake";
    case "profanity_harassment":
    case "discrimination":
      return "offensive";
    case "conflict_of_interest":
      return "conflict_of_interest";
    case "off_topic":
      return "wrong_business";
    case "illegal_content":
      return "other";
    default:
      // Exhaustive — TS narrows `v` to `never` here.
      return "other";
  }
}

/** Stored status values (Prisma `String`, mirrored by the DB CHECK). */
export type StoredDisputeStatus =
  | "submitted"
  | "submitted_to_google"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "removed";

export type DisputeStatusView = {
  /** User-facing label (the spec's 4 badges + Withdrawn). */
  label: string;
  /** Tailwind badge classes from the existing palette. */
  badgeClass: string;
  /** Design-system `.chip` modifier for the v3 surfaces. */
  chipClass: string;
  /** Which tab the dispute belongs to. */
  group: "active" | "resolved";
};

const FALLBACK_VIEW: DisputeStatusView = {
  label: "Unknown",
  badgeClass: "bg-slate-100 text-slate-700",
  chipClass: "chip",
  group: "active",
};

/**
 * Stored status → presentation. The 4 spec badges plus the internal `withdrawn`
 * and the legacy `accepted` synonym (rendered as Removed).
 */
export const DISPUTE_STATUS_VIEW: Record<StoredDisputeStatus, DisputeStatusView> = {
  submitted: {
    label: "Pending",
    badgeClass: "bg-slate-100 text-slate-700",
    chipClass: "chip",
    group: "active",
  },
  submitted_to_google: {
    label: "Under Review",
    badgeClass: "bg-amber-50 text-amber-700",
    chipClass: "chip chip--warn",
    group: "active",
  },
  removed: {
    label: "Removed",
    badgeClass: "bg-emerald-50 text-emerald-700",
    chipClass: "chip chip--ok",
    group: "resolved",
  },
  // Legacy synonym of `removed` so historical rows render as Removed.
  accepted: {
    label: "Removed",
    badgeClass: "bg-emerald-50 text-emerald-700",
    chipClass: "chip chip--ok",
    group: "resolved",
  },
  rejected: {
    label: "Rejected",
    badgeClass: "bg-red-50 text-red-700",
    chipClass: "chip chip--bad",
    group: "resolved",
  },
  withdrawn: {
    label: "Withdrawn",
    badgeClass: "bg-slate-100 text-slate-500",
    chipClass: "chip",
    group: "resolved",
  },
};

/** Resolve any stored status string to its view (fail-soft on unknown values). */
export function statusView(status: string | null | undefined): DisputeStatusView {
  if (status && status in DISPUTE_STATUS_VIEW) {
    return DISPUTE_STATUS_VIEW[status as StoredDisputeStatus];
  }
  return FALLBACK_VIEW;
}

/** Stored statuses shown on the Active tab. */
export const ACTIVE_STATUSES: StoredDisputeStatus[] = ["submitted", "submitted_to_google"];

/** Stored statuses shown on the Resolved tab. */
export const RESOLVED_STATUSES: StoredDisputeStatus[] = [
  "accepted",
  "rejected",
  "withdrawn",
  "removed",
];

/** Stored statuses the daily cron polls Google for an outcome. */
export const UNDER_REVIEW_STATUSES: StoredDisputeStatus[] = ["submitted_to_google"];

/** Only a Rejected dispute may be re-submitted. */
export function isResubmittable(status: string | null | undefined): boolean {
  return status === "rejected";
}

/** A dispute is "open" (occupies the review's unique slot) unless resolved/withdrawn. */
export function isOpenStatus(status: string | null | undefined): boolean {
  return status === "submitted" || status === "submitted_to_google";
}
