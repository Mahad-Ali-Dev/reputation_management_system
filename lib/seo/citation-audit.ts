import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { rankTrackerConfigured, callProvider, rankTrackerProvider } from "./adapters/rank-tracker";
import { env } from "@/lib/env";

/**
 * Citation / NAP-consistency audit (Module 13).
 *
 * Compares the canonical establishment Name / Address / Phone against what each
 * directory reports and upserts one `CitationAudit` row per directory
 * (latest-wins via deleteMany+createMany inside the tenant tx). Adapter-gated:
 * with no rank/citation provider configured, the directories we can't verify
 * are marked `status:"unknown"` rather than guessed — never a false "consistent".
 *
 * The four tracked directories match the schema's `directory` values:
 *   google | yelp | facebook | apple_maps
 *
 * Fail-soft: pre-migration `citation_audits`/`establishments` (42P01/42703) →
 * returns an empty result, never throws.
 */

const DIRECTORIES = ["google", "yelp", "facebook", "apple_maps"] as const;
export type Directory = (typeof DIRECTORIES)[number];

export type CitationAuditRow = {
  directory: Directory;
  nameMatch: boolean | null;
  addressMatch: boolean | null;
  phoneMatch: boolean | null;
  listedName: string | null;
  listedAddress: string | null;
  listedPhone: string | null;
  status: "consistent" | "inconsistent" | "missing" | "unknown";
};

type Canonical = { name: string; address: string; phone: string | null };

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "42P01" || code === "42703";
}

/** Normalize a string for comparison: lowercase, collapse whitespace + punctuation. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Phones compare on digits only, with a leading NANP country code ("1")
 * stripped so "+1 512-555-1212" and "(512) 555-1212" are recognized as the same
 * number (the common GBP-vs-directory formatting difference).
 */
function normPhone(s: string | null | undefined): string {
  let d = (s ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d;
}

/** Flatten the establishment address Json ({line1,city,region,postal,country}) to a string. */
function flattenAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "";
  const a = addr as Record<string, unknown>;
  return [a.line1, a.line2, a.city, a.region, a.postal, a.country]
    .filter((p) => typeof p === "string" && p.length > 0)
    .join(", ");
}

/**
 * Compare a listed NAP against the canonical record → per-field flags + status.
 * A directory with no listing data at all is `missing`; partial mismatch is
 * `inconsistent`; all-present-and-matching is `consistent`.
 */
export function compareNap(
  canonical: Canonical,
  listed: { name?: string | null; address?: string | null; phone?: string | null } | null,
): Omit<CitationAuditRow, "directory"> {
  if (!listed || (!listed.name && !listed.address && !listed.phone)) {
    return {
      nameMatch: null,
      addressMatch: null,
      phoneMatch: null,
      listedName: null,
      listedAddress: null,
      listedPhone: null,
      status: "missing",
    };
  }
  const nameMatch = listed.name != null ? norm(listed.name) === norm(canonical.name) : null;
  const addressMatch =
    listed.address != null ? norm(listed.address) === norm(canonical.address) : null;
  const phoneMatch =
    listed.phone != null && canonical.phone != null
      ? normPhone(listed.phone) === normPhone(canonical.phone)
      : null;

  const checks = [nameMatch, addressMatch, phoneMatch].filter((c) => c !== null) as boolean[];
  const status: CitationAuditRow["status"] =
    checks.length === 0 ? "unknown" : checks.every(Boolean) ? "consistent" : "inconsistent";

  return {
    nameMatch,
    addressMatch,
    phoneMatch,
    listedName: listed.name ?? null,
    listedAddress: listed.address ?? null,
    listedPhone: listed.phone ?? null,
    status,
  };
}

/**
 * Pull listed NAP per directory from the citation/rank provider. Env-gated:
 * returns an empty map (every directory `unknown`) without provider creds and
 * makes ZERO paid calls (the `callProvider` seam is only touched when
 * configured). Stubbed in tests via the same seam.
 */
async function fetchListedNap(
  canonical: Canonical,
  placeId: string | null,
): Promise<Partial<Record<Directory, { name?: string; address?: string; phone?: string }>>> {
  const provider = rankTrackerProvider();
  if (!provider || !rankTrackerConfigured()) return {};
  try {
    const raw = (await callProvider({
      provider,
      apiKey: env.RANK_TRACKER_API_KEY,
      op: "citations",
      params: { placeId, name: canonical.name },
    })) as Partial<
      Record<Directory, { name?: string; address?: string; phone?: string }>
    > | null;
    return raw ?? {};
  } catch (err) {
    logger.warn({
      event: "seo.citation_audit.provider_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

export type RunCitationAuditResult = {
  available: boolean;
  rows: CitationAuditRow[];
};

/**
 * Run the audit for an establishment and persist the rows. Returns the computed
 * rows (also for immediate UI use). Always produces all four directory rows —
 * those we can't verify are `unknown`/`missing`, never silently dropped.
 */
export async function runCitationAudit(
  orgId: string,
  establishmentId: string,
): Promise<RunCitationAuditResult> {
  try {
    return await withTenant(orgId, async (tx) => {
      const est = await tx.establishment.findUnique({
        where: { id: establishmentId },
        select: { name: true, address: true, phone: true, googlePlaceId: true },
      });
      if (!est) return { available: false, rows: [] };

      const canonical: Canonical = {
        name: est.name,
        address: flattenAddress(est.address),
        phone: est.phone ?? null,
      };

      const listed = await fetchListedNap(canonical, est.googlePlaceId ?? null);
      const now = new Date();

      const rows: CitationAuditRow[] = DIRECTORIES.map((directory) => {
        const cmp = compareNap(canonical, listed[directory] ?? null);
        return { directory, ...cmp };
      });

      // Latest-wins: replace this establishment's rows.
      await tx.citationAudit.deleteMany({ where: { establishmentId } });
      await tx.citationAudit.createMany({
        data: rows.map((r) => ({
          organizationId: orgId,
          establishmentId,
          directory: r.directory,
          nameMatch: r.nameMatch,
          addressMatch: r.addressMatch,
          phoneMatch: r.phoneMatch,
          listedName: r.listedName,
          listedAddress: r.listedAddress,
          listedPhone: r.listedPhone,
          status: r.status,
          checkedAt: now,
        })),
      });

      return { available: rankTrackerConfigured(), rows };
    });
  } catch (err) {
    if (isMissingRelation(err)) {
      logger.warn({ orgId, event: "seo.citation_audit.skipped_unmigrated" });
    } else {
      logger.warn({
        orgId,
        event: "seo.citation_audit.failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return { available: false, rows: [] };
  }
}
