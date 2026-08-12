import { withTenant } from "@/lib/db/with-tenant";

/**
 * Where replies go.
 *
 * Nothing in this codebase set a Reply-To, so every reply went back to the From
 * address — `notifications@repulabs.com`, `bookings@repulabs.com` and friends,
 * none of which have a mailbox. A customer replying "actually, I had a problem
 * with my order" to a review request was silently dropped: exactly the customer
 * a reputation product exists to catch.
 *
 * Two audiences, two destinations:
 *
 *   - Mail sent ON BEHALF OF a business (review requests, booking confirmations)
 *     replies to THAT business. The recipient believes they're corresponding
 *     with the business, not with Repulabs — routing their reply to us would be
 *     both useless to them and a privacy leak of their message to a third party.
 *
 *   - Platform mail (auth, invites, digests, KB notices) replies to our own
 *     support address, because we are genuinely the sender.
 *
 * `SUPPORT_EMAIL` overrides the default without a deploy.
 */

export const SUPPORT_REPLY_TO: string = process.env.SUPPORT_EMAIL ?? "hello@repulabs.com";

/**
 * Reply-To for mail sent on a business's behalf.
 *
 * Falls back to support rather than to the From address: an org that never set
 * an owner email would otherwise send replies to a no-mailbox sender, which is
 * the bug this module exists to remove. Support can at least forward it on.
 */
export function businessReplyTo(ownerEmail: string | null | undefined): string {
  const email = ownerEmail?.trim();
  // Cheap sanity check only — this value is owner-supplied and goes into a
  // header, so an obviously-malformed one must not become the Reply-To.
  if (email && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) return email;
  return SUPPORT_REPLY_TO;
}

/**
 * Business Reply-To with a fallback that actually resolves.
 *
 * `Organization.ownerEmail` is an OPTIONAL field on the business-profile form
 * and is never written at signup, so it is NULL for most orgs — using it alone
 * would strand nearly every customer reply at support, which is the outcome
 * this module exists to prevent. The owner's login email always exists, so we
 * fall back to that before giving up.
 */
export async function resolveBusinessReplyTo(
  orgId: string,
  ownerEmail: string | null | undefined,
): Promise<string> {
  const direct = ownerEmail?.trim();
  if (direct) return businessReplyTo(direct);
  const owner = await withTenant(orgId, (tx) =>
    tx.membership.findFirst({
      where: { role: "owner" },
      select: { user: { select: { email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ).catch(() => null);
  return businessReplyTo(owner?.user.email);
}
