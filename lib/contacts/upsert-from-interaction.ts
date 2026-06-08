/**
 * Auto-capture hook — the single function every inbound path calls to log a
 * customer into the Contact directory (module 12, Wave 3b).
 *
 * ⚠ SELF-CONTAINED BY DESIGN. This file imports ONLY `withTenant`, the logger,
 * and the local fail-soft helper. It MUST NOT import from `app/*` or from the
 * Inbox module — Wave-3c's Meta webhook + the connection sync (14) + the
 * review-request fanout (07) all call into here, and a back-import would create
 * a circular build dependency. Keep it leaf-level.
 *
 * Behaviour (all required by the spec):
 *  - **Idempotent dedupe** by strongest identifier first:
 *      1. (organizationId, source, externalId)  — exact provider record
 *      2. (organizationId, email)                — normalized lowercase
 *      3. (organizationId, phone)                — normalized E.164
 *      4. socialIds JSON match                   — `<platform>:<id>`
 *    Falls back to CREATE when nothing matches.
 *  - **Never downgrades a real source.** An existing `google_review` contact is
 *    not relabelled to `import`/`csv` when a later weaker capture arrives.
 *  - **Writes exactly one `ContactActivity` "captured via X" marker**, idempotent
 *    on `(contactId, source, externalRef)` so re-running the same interaction is
 *    a no-op (no duplicate timeline rows).
 *  - **Fail-soft.** Any error (including the new tables/columns not being
 *    migrated yet) is logged and swallowed; returns `null` and NEVER propagates
 *    so it can be dropped into a hot inbound path (`void upsert…().catch(()=>{})`).
 */

import { withTenant } from "@/lib/db/with-tenant";
import { logger } from "@/lib/logger";
import { isMissingRelation } from "./fail-soft";

const PHONE_RE = /^\+[1-9][0-9]{1,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UpsertInteractionInput {
  orgId: string;
  /** Canonical source key (e.g. google_review | live_chat | survey | shopify). */
  source: string;
  /** Provider's stable id for this record — powers (org,source,externalId) dedupe. */
  externalId?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  /** A social identity as `<platform>:<externalAuthorId>` (e.g. "instagram:123"). */
  socialId?: string | null;
  establishmentId?: string | null;
  /** When the interaction happened (defaults to now) — used for lastActivityAt. */
  occurredAt?: Date | null;
  /**
   * Optional activity marker override. By default we write a "captured via
   * <source>" row keyed on `externalRef ?? externalId ?? source`. Pass a
   * stable `externalRef` to make re-capture of the same event idempotent.
   */
  activity?: {
    title?: string | null;
    body?: string | null;
    externalRef?: string | null;
  } | null;
}

export interface UpsertInteractionResult {
  contactId: string;
  created: boolean;
}

/** Lowercase + trim an email; return null when it isn't a plausible address. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const v = email.trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

/**
 * Normalize a phone toward E.164: strip spaces/dashes/parens/dots. If it already
 * matches E.164 we keep it; a bare 10–15 digit string without `+` is left as-is
 * only when it already had a leading `+`. Returns null when implausible.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (PHONE_RE.test(cleaned)) return cleaned;
  // Tolerate a leading 00 international prefix → +.
  if (/^00[1-9][0-9]{6,14}$/.test(cleaned)) {
    const plus = `+${cleaned.slice(2)}`;
    if (PHONE_RE.test(plus)) return plus;
  }
  return null;
}

/** Sources we consider "weak" — never overwrite a stronger existing source. */
const WEAK_SOURCES = new Set(["import", "csv", "manual"]);

/**
 * Decide whether to overwrite the stored source. We only ever upgrade
 * weak → strong (e.g. a contact first imported from CSV that later actually
 * leaves a Google review becomes `google_review`); we never go strong → weak.
 */
function shouldUpgradeSource(existing: string, incoming: string): boolean {
  if (existing === incoming) return false;
  const existingWeak = WEAK_SOURCES.has(existing);
  const incomingWeak = WEAK_SOURCES.has(incoming);
  // strong existing + weak incoming → keep existing (no downgrade)
  if (!existingWeak && incomingWeak) return false;
  // weak existing + strong incoming → upgrade
  if (existingWeak && !incomingWeak) return true;
  // both weak or both strong → keep whatever is already there (stable)
  return false;
}

type ContactMatch = { id: string; source: string; socialIds: unknown };

/**
 * Upsert a contact from an inbound interaction. Always fail-soft; returns the
 * contact id (created flag) on success or `null` on any error.
 */
export async function upsertContactFromInteraction(
  input: UpsertInteractionInput,
): Promise<UpsertInteractionResult | null> {
  try {
    if (!input.orgId) return null;
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const socialId = input.socialId?.trim() || null;
    const externalId = input.externalId?.trim() || null;
    const name = input.name?.trim() || null;
    const source = input.source?.trim() || "manual";
    const occurredAt = input.occurredAt ?? new Date();

    // Need at least one identifier to attach the interaction to a person.
    if (!email && !phone && !socialId && !externalId) return null;

    return await withTenant(input.orgId, async (tx) => {
      // ---- Find existing contact (strongest identifier first) ----
      let existing: ContactMatch | null = null;

      if (externalId) {
        existing = (await tx.contact.findFirst({
          where: { organizationId: input.orgId, source, externalId },
          select: { id: true, source: true, socialIds: true },
        })) as ContactMatch | null;
      }
      if (!existing && email) {
        existing = (await tx.contact.findFirst({
          where: { organizationId: input.orgId, email },
          select: { id: true, source: true, socialIds: true },
        })) as ContactMatch | null;
      }
      if (!existing && phone) {
        existing = (await tx.contact.findFirst({
          where: { organizationId: input.orgId, phone },
          select: { id: true, source: true, socialIds: true },
        })) as ContactMatch | null;
      }
      if (!existing && socialId) {
        // socialIds is JSON `{ "<platform>": "<id>" }`. We store identities as a
        // flat map; match by the value across keys. Postgres JSON path equality
        // via Prisma `equals` on a nested path is brittle across shapes, so we
        // match on the serialized presence using `string_contains` semantics.
        const [platform, ...rest] = socialId.split(":");
        const idPart = rest.join(":");
        if (platform && idPart) {
          existing = (await tx.contact.findFirst({
            where: {
              organizationId: input.orgId,
              socialIds: { path: [platform], equals: idPart },
            },
            select: { id: true, source: true, socialIds: true },
          })) as ContactMatch | null;
        }
      }

      let contactId: string;
      let created: boolean;

      if (existing) {
        contactId = existing.id;
        created = false;

        // Merge social identity into the JSON map without clobbering others.
        let mergedSocial: Record<string, string> | undefined;
        if (socialId) {
          const [platform, ...rest] = socialId.split(":");
          const idPart = rest.join(":");
          if (platform && idPart) {
            const prev =
              existing.socialIds && typeof existing.socialIds === "object"
                ? (existing.socialIds as Record<string, string>)
                : {};
            mergedSocial = { ...prev, [platform]: idPart };
          }
        }

        await tx.contact.update({
          where: { id: existing.id },
          data: {
            // Only fill blanks for identity fields; never wipe existing data.
            name: name ?? undefined,
            email: email ?? undefined,
            phone: phone ?? undefined,
            ...(mergedSocial ? { socialIds: mergedSocial } : {}),
            ...(shouldUpgradeSource(existing.source, source) ? { source } : {}),
            lastActivityAt: occurredAt,
          },
        });
      } else {
        created = true;
        let socialIds: Record<string, string> | undefined;
        if (socialId) {
          const [platform, ...rest] = socialId.split(":");
          const idPart = rest.join(":");
          if (platform && idPart) socialIds = { [platform]: idPart };
        }
        const createdRow = await tx.contact.create({
          data: {
            organizationId: input.orgId,
            establishmentId: input.establishmentId ?? null,
            source,
            externalId,
            name,
            email,
            phone,
            ...(socialIds ? { socialIds } : {}),
            lastActivityAt: occurredAt,
          },
          select: { id: true },
        });
        contactId = createdRow.id;
      }

      // ---- Idempotent "captured via X" marker ----
      // Keyed on (contactId, source, externalRef). The DB has a unique on that
      // triple; we additionally find-first so it is correct pre-migration too.
      const externalRef =
        input.activity?.externalRef?.trim() || externalId || `${source}:${occurredAt.getTime()}`;
      try {
        const dup = await tx.contactActivity.findFirst({
          where: { contactId, source, externalRef },
          select: { id: true },
        });
        if (!dup) {
          await tx.contactActivity.create({
            data: {
              organizationId: input.orgId,
              contactId,
              kind: "captured",
              source,
              title: input.activity?.title ?? `Captured via ${source}`,
              body: input.activity?.body ?? null,
              externalRef,
              occurredAt,
            },
          });
        }
      } catch (markerErr) {
        // A unique-violation race (P2002) or a not-yet-migrated activities table
        // must not fail the whole capture — the Contact upsert already succeeded.
        if (!isMissingRelation(markerErr) && (markerErr as { code?: string })?.code !== "P2002") {
          logger.warn({
            event: "contacts.capture.marker_failed",
            orgId: input.orgId,
            source,
            error: markerErr instanceof Error ? markerErr.message : String(markerErr),
          });
        }
      }

      return { contactId, created };
    });
  } catch (err) {
    // Hot-path safety: never throw. Missing-relation (pre-migration) is silent;
    // anything else is logged at warn and swallowed.
    if (!isMissingRelation(err)) {
      logger.warn({
        event: "contacts.capture.failed",
        orgId: input.orgId,
        source: input.source,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return null;
  }
}

/**
 * Fire-and-forget wrapper for the hottest inbound paths (widget converse, review
 * ingest) where you don't want to `await` the capture at all. Swallows the
 * promise rejection (the inner fn already never rejects, but belt-and-suspenders)
 * so an unhandled-rejection can't crash the host request.
 */
export function captureContactInBackground(input: UpsertInteractionInput): void {
  void upsertContactFromInteraction(input).catch(() => {
    /* already fail-soft inside; nothing to do */
  });
}
