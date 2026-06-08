import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  DISPUTE_STATUS_VIEW,
  RESOLVED_STATUSES,
  VIOLATION_VALUES,
  isResubmittable,
  legacyReasonFor,
  statusView,
  violationLabel,
  type StoredDisputeStatus,
  type ViolationType,
} from "@/lib/reviews/dispute-meta";

/**
 * Pure mapping tests (Module 08). These pin the two grounding decisions:
 *  - every violation type maps to one of the 5 legacy reasons the live DB's
 *    reason CHECK already allows (so the dual-write never breaks it);
 *  - every stored status maps to a {label, badgeClass, group}; the Active /
 *    Resolved partition is total and disjoint; only `rejected` is resubmittable.
 */

const LEGACY_REASONS = new Set(["fake", "offensive", "conflict_of_interest", "wrong_business", "other"]);
const ALL_STORED: StoredDisputeStatus[] = [
  "submitted",
  "submitted_to_google",
  "accepted",
  "rejected",
  "withdrawn",
  "removed",
];

describe("legacyReasonFor", () => {
  it("maps every violation type to a legacy reason the DB CHECK allows", () => {
    for (const v of VIOLATION_VALUES) {
      const reason = legacyReasonFor(v as ViolationType);
      expect(LEGACY_REASONS.has(reason)).toBe(true);
    }
  });

  it("uses the documented specific mappings", () => {
    expect(legacyReasonFor("spam_fake")).toBe("fake");
    expect(legacyReasonFor("profanity_harassment")).toBe("offensive");
    expect(legacyReasonFor("discrimination")).toBe("offensive");
    expect(legacyReasonFor("conflict_of_interest")).toBe("conflict_of_interest");
    expect(legacyReasonFor("off_topic")).toBe("wrong_business");
    expect(legacyReasonFor("illegal_content")).toBe("other");
  });
});

describe("DISPUTE_STATUS_VIEW", () => {
  it("maps every stored status to a label + badge + group", () => {
    for (const s of ALL_STORED) {
      const view = DISPUTE_STATUS_VIEW[s];
      expect(view).toBeDefined();
      expect(view.label.length).toBeGreaterThan(0);
      expect(view.badgeClass.length).toBeGreaterThan(0);
      expect(["active", "resolved"]).toContain(view.group);
    }
  });

  it("renders the spec's four user-facing labels", () => {
    expect(DISPUTE_STATUS_VIEW.submitted.label).toBe("Pending");
    expect(DISPUTE_STATUS_VIEW.submitted_to_google.label).toBe("Under Review");
    expect(DISPUTE_STATUS_VIEW.removed.label).toBe("Removed");
    expect(DISPUTE_STATUS_VIEW.rejected.label).toBe("Rejected");
  });

  it("treats legacy `accepted` as a Removed synonym", () => {
    expect(DISPUTE_STATUS_VIEW.accepted.label).toBe("Removed");
    expect(DISPUTE_STATUS_VIEW.accepted.group).toBe("resolved");
  });

  it("statusView fails soft on an unknown status", () => {
    const v = statusView("bogus_value");
    expect(v.label).toBe("Unknown");
    expect(v.group).toBe("active");
  });
});

describe("status partition", () => {
  it("ACTIVE and RESOLVED partition the full stored set with no overlap", () => {
    const union = new Set<string>([...ACTIVE_STATUSES, ...RESOLVED_STATUSES]);
    for (const s of ALL_STORED) expect(union.has(s)).toBe(true);

    const overlap = ACTIVE_STATUSES.filter((s) => (RESOLVED_STATUSES as string[]).includes(s));
    expect(overlap).toHaveLength(0);
  });

  it("each membership matches the view's group", () => {
    for (const s of ACTIVE_STATUSES) expect(DISPUTE_STATUS_VIEW[s].group).toBe("active");
    for (const s of RESOLVED_STATUSES) expect(DISPUTE_STATUS_VIEW[s].group).toBe("resolved");
  });
});

describe("isResubmittable", () => {
  it("is true only for rejected", () => {
    expect(isResubmittable("rejected")).toBe(true);
    for (const s of ALL_STORED.filter((x) => x !== "rejected")) {
      expect(isResubmittable(s)).toBe(false);
    }
    expect(isResubmittable(null)).toBe(false);
  });
});

describe("violationLabel", () => {
  it("labels a known violation and falls back for unknown/empty", () => {
    expect(violationLabel("spam_fake")).toBe("Spam or fake");
    expect(violationLabel(null)).toBe("Unspecified");
    expect(violationLabel("not_a_type")).toBe("Unspecified");
  });
});
