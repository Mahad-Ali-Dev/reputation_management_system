/**
 * Who each kind of email comes FROM.
 *
 * Previously every sender carried its own hardcoded fallback, so the answer to
 * "what address does X send from?" was spread across eight files and drifted
 * (auth@ / notifications@ / bookings@, chosen ad hoc). This is the one place.
 *
 * WHY SPLIT AT ALL — deliverability isolation. Review requests are the mail most
 * likely to draw spam complaints: they're bulk-ish, unsolicited-feeling, and ask
 * the recipient for a favour. Sign-in links are the mail that absolutely must
 * land. Sharing one address lets complaints on the first degrade the second, and
 * "customers can't log in" is a far worse outage than a review request in
 * Promotions. Separate addresses keep their reputations separate.
 *
 * NO `noreply@` ANYWHERE, deliberately. Replies now reach a real destination
 * (see reply-to.ts), so a noreply sender would advertise the opposite; it tells
 * a user who can't sign in that we don't want to hear from them — precisely the
 * person we do — and some filters score it as a mild negative.
 *
 * Precedence, per purpose:
 *   1. its own env var  (EMAIL_FROM_AUTH, …)      — override one kind of mail
 *   2. EMAIL_FROM                                  — one address for everything,
 *                                                    useful while warming a
 *                                                    domain or testing
 *   3. the default below
 *
 * Every address must be on a domain verified in Resend. The mailbox does NOT
 * need to exist to send — but see reply-to.ts, and set a catch-all so anything
 * addressed to one of these isn't lost.
 */

export type MailPurpose =
  /** Sign-in / magic links. Must land; never bulk. */
  | "auth"
  /** Review requests to a business's customers. Complaint-prone; isolated. */
  | "outreach"
  /** Teammate invitations. */
  | "team"
  /** Digests, knowledge-base notices, product notifications. */
  | "notify"
  /** Booking confirmations and reminders. */
  | "bookings";

const DEFAULTS: Record<MailPurpose, string> = {
  auth: "Repulabs <login@repulabs.com>",
  outreach: "Repulabs <feedback@repulabs.com>",
  team: "Repulabs <team@repulabs.com>",
  notify: "Repulabs <notifications@repulabs.com>",
  bookings: "Repulabs <bookings@repulabs.com>",
};

const ENV_KEYS: Record<MailPurpose, string> = {
  auth: "EMAIL_FROM_AUTH",
  outreach: "EMAIL_FROM_OUTREACH",
  team: "EMAIL_FROM_TEAM",
  notify: "EMAIL_FROM_NOTIFY",
  bookings: "EMAIL_FROM_BOOKINGS",
};

/** The `From` header for a given kind of mail. */
export function senderFor(purpose: MailPurpose): string {
  const specific = process.env[ENV_KEYS[purpose]]?.trim();
  if (specific) return specific;
  const global = process.env.EMAIL_FROM?.trim();
  if (global) return global;
  return DEFAULTS[purpose];
}

/** Strip a display name: `Repulabs <a@b.com>` → `a@b.com`. */
function bareAddress(from: string): string {
  const angled = from.match(/<([^>]+)>/);
  return (angled?.[1] ?? from).trim();
}

/**
 * A `From` that shows the BUSINESS's name over our sending address, e.g.
 * `Chaaye Khana <feedback@repulabs.com>`.
 *
 * Used for mail sent on a tenant's behalf. The recipient is their customer, so
 * the inbox should say who's actually asking — the envelope address stays ours
 * because repulabs.com is what's verified in Resend, and sending as their domain
 * would fail SPF/DKIM.
 *
 * The display name is quoted and stripped of characters that would let it break
 * out of the header.
 */
export function senderAsBusiness(purpose: MailPurpose, businessName: string | null): string {
  const address = bareAddress(senderFor(purpose));
  const name = (businessName ?? "")
    .replace(/["\\<>\r\n]/g, "")
    .trim()
    .slice(0, 78);
  if (!name) return senderFor(purpose);
  return `"${name}" <${address}>`;
}
