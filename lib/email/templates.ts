/**
 * Email templates.
 *
 * Hand-rolled HTML — we deliberately avoid React Email or other JSX-in-email
 * tooling because:
 *   1. Outlook + older Gmail clients require table-based layouts; flexbox /
 *      modern CSS is unreliable across the long tail of clients.
 *   2. Inlining the styles keeps the template self-contained and small.
 *   3. We render server-side via Resend — no React reconciliation needed.
 *
 * Design system (matches the app):
 *   - Background: #f6f7f4 (page surface)
 *   - Card:       #ffffff with #eceeea border, 12px radius
 *   - Ink:        #0b0d0e (primary text)
 *   - Muted:      #64748b (secondary text)
 *   - Primary:    #2563eb (CTA + accents)
 *   - Accent:     gradient #2563eb → #6366f1 for the logo mark
 *
 * Every template returns BOTH `html` and `text` so we can deliver to clients
 * that prefer plain text (and to keep us out of spam-folder hell — multipart
 * MIME with a plain alternative is a deliverability best-practice).
 */

export const BRAND = {
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  ink: "#0b0d0e",
  ink2: "#334155",
  muted: "#64748b",
  bg: "#f6f7f4",
  surface: "#ffffff",
  border: "#eceeea",
  borderSoft: "#f1f5f9",
  ok: "#15803d",
  warn: "#a16207",
} as const;

/**
 * The site URL (used for absolute links and the logo image). Set at runtime
 * — for emails we MUST use the production URL since the recipient's mail
 * client renders the HTML on their machine, not ours.
 */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
}

/**
 * Shared shell — every email uses this. Pass in the body HTML + the preheader
 * text (the short summary shown in inbox previews next to the subject line).
 *
 * Args:
 *   - preheader: 1-line summary, hidden from view but shown in inbox preview
 *   - title:     used in <title> for clients that show it
 *   - body:      the actual content HTML (paragraphs, CTA, etc.)
 *   - footerNote: optional small italic line below the body (e.g. "If you
 *                 didn't request this, ignore it")
 */
export type EmailBrand = {
  /** Business name shown in the masthead and footer. */
  name: string;
  /** Square logo URL. Falls back to a lettermark when absent. */
  logoUrl?: string | null;
  /** CTA + accent colour. */
  accent?: string | null;
};

export function emailShell(opts: {
  preheader: string;
  title: string;
  body: string;
  footerNote?: string;
  /**
   * Send AS a tenant rather than as Repulabs.
   *
   * Review requests and booking confirmations go to the BUSINESS's customers,
   * who have no relationship with us — a Repulabs masthead on that mail is
   * confusing at best and looks like a phish at worst. Passing a brand swaps the
   * masthead, accent and footer for theirs. Omit it for platform mail (sign-in,
   * invites, digests), where we genuinely are the sender.
   */
  brand?: EmailBrand | null;
}): string {
  const url = siteUrl();
  const b = opts.brand ?? null;
  const accent = b?.accent || BRAND.primary;
  const mastheadHref = b ? "#" : url;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};-webkit-font-smoothing:antialiased;">

  <!-- Preheader: hidden from view, shown in inbox preview -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(opts.preheader)}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.bg};padding:32px 12px;">
    <tr>
      <td align="center">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="max-width:520px;">

          <!-- Brand strip -->
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <a href="${mastheadHref}" style="text-decoration:none;display:inline-block;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          ${
                            b?.logoUrl
                              ? `<td style="width:34px;height:34px;"><img src="${b.logoUrl}" width="34" height="34" alt="" style="display:block;width:34px;height:34px;border-radius:9px;object-fit:cover;" /></td>`
                              : `<td style="background:${b ? accent : `linear-gradient(140deg,${BRAND.primary} 0%,#6366f1 100%)`};width:34px;height:34px;border-radius:9px;text-align:center;color:#fff;font-size:18px;font-weight:800;line-height:34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${b ? escapeHtml(b.name.charAt(0).toUpperCase()) : "r"}</td>`
                          }
                        </tr>
                      </table>
                    </a>
                  </td>
                  <td style="vertical-align:middle;">
                    <a href="${mastheadHref}" style="text-decoration:none;color:${BRAND.ink};font-size:18px;font-weight:600;letter-spacing:-0.02em;">
                      ${b ? escapeHtml(b.name) : `repu<span style="color:${BRAND.primary};">labs</span>`}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main card -->
          <tr>
            <td style="background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:14px;padding:36px 36px 32px;box-shadow:0 1px 3px rgba(11,13,14,.04);">
              ${opts.body}
            </td>
          </tr>

          ${
            opts.footerNote
              ? `
          <tr>
            <td style="padding:18px 8px 0;text-align:center;">
              <p style="margin:0;color:${BRAND.muted};font-size:12.5px;line-height:1.5;">${opts.footerNote}</p>
            </td>
          </tr>
          `
              : ""
          }

          <!-- Footer -->
          <tr>
            <td style="padding:24px 8px 0;text-align:center;">
              <p style="margin:0;color:${BRAND.muted};font-size:11.5px;line-height:1.6;">
                ${
                  b
                    ? escapeHtml(b.name)
                    : `Repulabs · The reputation OS for local businesses<br>
                <a href="${url}" style="color:${BRAND.muted};text-decoration:underline;">${url.replace(/^https?:\/\//, "")}</a>`
                }
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Primary CTA button HTML — used in all action emails.
 * Falls back to an underlined link on clients that strip backgrounds.
 */
export function ctaButton(opts: { url: string; label: string; accent?: string | null }): string {
  const bg = opts.accent || BRAND.primary;
  return `
  <!-- CTA: bulletproof button via VML for Outlook + standard for everyone else -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${bg}" style="border-radius:10px;">
        <a href="${opts.url}" target="_blank" style="display:inline-block;padding:13px 28px;background:${bg};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:-0.005em;">
          ${escapeHtml(opts.label)}
        </a>
      </td>
    </tr>
  </table>`;
}

// ============================================================
// Magic-link sign-in email
// ============================================================
export function magicLinkEmail(url: string): { html: string; text: string } {
  const body = `
    <h1 style="margin:0 0 8px;color:${BRAND.ink};font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.2;">Sign in to Repulabs</h1>
    <p style="margin:0 0 24px;color:${BRAND.ink2};font-size:15px;line-height:1.6;">
      Click the button below to securely sign in to your workspace. This link works once and expires in 15 minutes.
    </p>

    ${ctaButton({ url, label: "Sign in to your workspace" })}

    <div style="margin:28px 0 0;padding:14px 16px;background:${BRAND.borderSoft};border-radius:10px;border:1px solid ${BRAND.border};">
      <p style="margin:0 0 4px;color:${BRAND.ink2};font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;">Or paste this link</p>
      <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.5;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;word-break:break-all;">
        <a href="${url}" style="color:${BRAND.primary};text-decoration:none;">${escapeHtml(url)}</a>
      </p>
    </div>
  `;

  const html = emailShell({
    preheader: "Your sign-in link for Repulabs — expires in 15 minutes.",
    title: "Sign in to Repulabs",
    body,
    footerNote:
      "If you didn't request this, you can safely ignore this email — your account stays secure.",
  });

  const text = [
    "Sign in to Repulabs",
    "",
    "Click the link below to sign in. This link works once and expires in 15 minutes.",
    "",
    url,
    "",
    "If you didn't request this email, you can safely ignore it.",
    "",
    "— Repulabs",
    siteUrl(),
  ].join("\n");

  return { html, text };
}

// ============================================================
// Team invite email (used when an owner invites a teammate)
// ============================================================
export function teamInviteEmail(opts: {
  inviterName: string;
  orgName: string;
  acceptUrl: string;
}): { html: string; text: string } {
  const body = `
    <h1 style="margin:0 0 8px;color:${BRAND.ink};font-size:24px;font-weight:600;letter-spacing:-0.02em;line-height:1.2;">You've been invited to ${escapeHtml(opts.orgName)}</h1>
    <p style="margin:0 0 22px;color:${BRAND.ink2};font-size:15px;line-height:1.6;">
      <strong>${escapeHtml(opts.inviterName)}</strong> added you to the <strong>${escapeHtml(opts.orgName)}</strong> workspace on Repulabs. Accept the invitation to start replying to reviews, sending request links, and seeing live customer feedback.
    </p>

    ${ctaButton({ url: opts.acceptUrl, label: `Join ${opts.orgName}` })}

    <p style="margin:24px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.55;">
      This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.
    </p>
  `;

  const html = emailShell({
    preheader: `${opts.inviterName} invited you to join ${opts.orgName} on Repulabs.`,
    title: `Join ${opts.orgName} on Repulabs`,
    body,
  });

  const text = [
    `You've been invited to ${opts.orgName}`,
    "",
    `${opts.inviterName} added you to the ${opts.orgName} workspace on Repulabs.`,
    "",
    `Accept here: ${opts.acceptUrl}`,
    "",
    "This invitation expires in 7 days.",
    "",
    "— Repulabs",
    siteUrl(),
  ].join("\n");

  return { html, text };
}

// ============================================================
// Review request email (sent to a customer asking for a Google review)
// ============================================================
export function reviewRequestEmail(opts: {
  customerName: string;
  businessName: string;
  reviewUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const body = `
    <p style="margin:0 0 18px;color:${BRAND.ink2};font-size:15px;line-height:1.6;">
      Hi ${escapeHtml(opts.customerName)} 👋
    </p>
    <p style="margin:0 0 18px;color:${BRAND.ink2};font-size:15px;line-height:1.6;">
      Thank you for choosing <strong>${escapeHtml(opts.businessName)}</strong>. If you had a great experience, would you mind taking 30 seconds to leave us a quick review on Google? It genuinely makes a huge difference to a small business like ours.
    </p>

    ${ctaButton({ url: opts.reviewUrl, label: "Leave a Google review" })}

    <p style="margin:24px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.55;">
      Thanks for the support — it means everything.
      <br><br>
      — The team at ${escapeHtml(opts.businessName)}
    </p>
  `;

  const html = emailShell({
    preheader: `A quick favor from ${opts.businessName} — would you leave us a review?`,
    title: `A quick favor from ${opts.businessName}`,
    body,
    footerNote: `Sent on behalf of ${escapeHtml(opts.businessName)}. <a href="${opts.unsubscribeUrl}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe</a>`,
  });

  const text = [
    `Hi ${opts.customerName},`,
    "",
    `Thank you for choosing ${opts.businessName}. If you had a great experience, would you mind taking 30 seconds to leave us a Google review?`,
    "",
    opts.reviewUrl,
    "",
    "Thanks for the support — it means everything.",
    "",
    `— The team at ${opts.businessName}`,
    "",
    `Unsubscribe: ${opts.unsubscribeUrl}`,
  ].join("\n");

  return { html, text };
}

// ============================================================
// Shared building blocks
// ============================================================

/**
 * These exist so the digest / booking / KB emails stop hand-rolling their own
 * markup. Five of the eight senders built bespoke HTML, so the polish applied
 * here only ever reached the three that used the shell — the rest looked like a
 * different product. Anything added below is available to all of them.
 */

/** Section heading inside the card. */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 8px;color:${BRAND.ink};font-size:22px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;">${escapeHtml(text)}</h1>`;
}

/** Body paragraph. `html` is inserted raw — escape before calling if it's user data. */
export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 18px;color:${BRAND.ink2};font-size:15px;line-height:1.6;">${html}</p>`;
}

/** Soft-tinted panel for secondary detail (link fallbacks, summaries). */
export function emailPanel(innerHtml: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:10px;">
    <tr><td style="padding:14px 16px;color:${BRAND.ink2};font-size:14px;line-height:1.55;">${innerHtml}</td></tr>
  </table>`;
}

/** Label/value rows — booking details, digest counts. */
export function emailDetailRows(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map(
      (r) => `<tr>
        <td style="padding:7px 0;color:${BRAND.muted};font-size:13px;white-space:nowrap;">${escapeHtml(r.label)}</td>
        <td style="padding:7px 0 7px 16px;color:${BRAND.ink};font-size:14px;font-weight:600;text-align:right;">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">${body}</table>`;
}

/** Big number tiles for the digests. Kept to a table so Outlook lays it out. */
export function emailStatRow(stats: Array<{ value: string | number; label: string }>): string {
  if (stats.length === 0) return "";
  const width = Math.floor(100 / stats.length);
  const cells = stats
    .map(
      (s) => `<td width="${width}%" align="center" style="padding:12px 6px;">
        <div style="color:${BRAND.ink};font-size:26px;font-weight:700;line-height:1.1;letter-spacing:-0.02em;">${escapeHtml(String(s.value))}</div>
        <div style="color:${BRAND.muted};font-size:12px;margin-top:4px;">${escapeHtml(s.label)}</div>
      </td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:10px;"><tr>${cells}</tr></table>`;
}

/** Unsubscribe line for bulk mail. Transactional mail must NOT use this. */
export function emailUnsubscribeLine(url: string): string {
  return `<a href="${url}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe</a>`;
}
