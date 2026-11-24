/**
 * Email templates and the shared email design system.
 *
 * Hand-rolled HTML: we deliberately avoid React Email or other JSX-in-email
 * tooling because:
 *   1. Outlook + older Gmail clients require table-based layouts; flexbox /
 *      modern CSS is unreliable across the long tail of clients.
 *   2. Inlining the styles keeps the template self-contained and small.
 *   3. We render server-side via Resend, so no React reconciliation is needed.
 *
 * Design (matches tasks/repulabs-ui-prompts/DESIGN-SPEC-handoff.md):
 *   - One loud colour: brand blue #2457ff. Everything else is slate, plus the
 *     semantic success / warning / danger tints for status only.
 *   - No divider lines. Fills, soft shadows and space separate things.
 *   - Onest headings, DM Sans body, Manrope numbers (web fonts where the
 *     client allows them, system fallbacks everywhere else).
 *   - Every email opens with a tinted hero: an animated brand icon (or the
 *     Repulabs AI frog) on a white tile, then a large heading.
 *   - Images are hosted PNG/GIF under /assets/repulabs/email (Gmail blocks SVG).
 *     GIFs animate in Gmail and Apple Mail; Outlook desktop shows frame one.
 *
 * Every template returns BOTH `html` and `text`: multipart MIME with a plain
 * alternative is a deliverability best practice.
 */

export const BRAND = {
  primary: "#2457ff",
  primaryDark: "#1b3fd1",
  primary50: "#eff6ff",
  primary100: "#dbeafe",
  ink: "#1a1f2e",
  ink2: "#5b6472",
  muted: "#8a929e",
  canvas: "#eef1f6",
  bg: "#eef1f6",
  surface: "#ffffff",
  fill: "#f4f6fa",
  border: "#e6e8eb",
  borderSoft: "#f4f6fa",
  ok: "#16a34a",
  okBg: "#ecfdf3",
  warn: "#d97706",
  warnBg: "#fffaeb",
  danger: "#dc2626",
  dangerBg: "#fef3f2",
  star: "#f5a623",
  starEmpty: "#e6e8eb",
} as const;

const FONT_BODY = `'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_HEAD = `'Onest','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const FONT_NUM = `'Manrope','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const SHADOW = "0 1px 2px rgba(16,24,40,.05),0 10px 28px -14px rgba(16,24,40,.22)";

/**
 * The site URL (used for absolute links and images). For emails we MUST use
 * the production URL since the recipient's mail client renders the HTML on
 * their machine, not ours.
 */
function siteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
}

/** Absolute URL of a hosted email asset (public/assets/repulabs/email). */
export function emailAsset(file: string): string {
  return `${siteUrl()}/assets/repulabs/email/${file}`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** First word of a name ("Emily Clarke" → "Emily"). */
export function emailFirstName(full: string | null | undefined): string {
  const t = (full ?? "").trim();
  return t.split(/\s+/)[0] ?? t;
}

/**
 * "The Crown & Anchor team" for names that already start with "The", else
 * "The Daily Grind team" style. Returns escaped HTML.
 */
export function emailTeamName(businessName: string): string {
  const n = businessName.trim();
  return escapeHtml(/^the\s/i.test(n) ? `${n} team` : `The ${n} team`);
}

/** Mix a #rrggbb colour toward white. amount 0 = colour, 1 = white. */
function tintOf(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return BRAND.primary50;
  const n = Number.parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ============================================================
// Shell
// ============================================================

export type EmailBrand = {
  /** Business name shown in the masthead and footer. */
  name: string;
  /** Square logo URL. Falls back to a lettermark when absent. */
  logoUrl?: string | null;
  /** CTA + accent colour. */
  accent?: string | null;
};

const wordmark = (size: number) =>
  `<span style="font-family:${FONT_BODY};font-size:${size}px;font-weight:600;letter-spacing:-0.025em;color:${BRAND.ink};">repu<span style="color:#005AFC;">labs</span></span>`;

export function emailShell(opts: {
  preheader: string;
  title: string;
  /** Main content, placed inside the padded card body. */
  body: string;
  /** Hero block from `emailHero` / `emailDarkHero`, placed above the body. */
  hero?: string;
  /** Small line under the card (unsubscribe, why-you-got-this). */
  footerNote?: string;
  /**
   * Send AS a tenant rather than as Repulabs.
   *
   * Review requests and booking confirmations go to the BUSINESS's customers,
   * who have no relationship with us. A Repulabs masthead on that mail is
   * confusing at best and looks like a phish at worst. Passing a brand swaps the
   * masthead and footer for theirs. Omit it for platform mail (sign-in,
   * invites, digests), where we genuinely are the sender.
   */
  brand?: EmailBrand | null;
}): string {
  const url = siteUrl();
  const b = opts.brand ?? null;

  const masthead = b
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td style="vertical-align:middle;">${
          b.logoUrl
            ? `<img src="${b.logoUrl}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border-radius:9px;object-fit:cover;" />`
            : `<div style="width:32px;height:32px;border-radius:9px;background:${BRAND.ink};color:#ffffff;font-family:${FONT_HEAD};font-size:15px;font-weight:600;line-height:32px;text-align:center;">${escapeHtml(
                b.name
                  .replace(/^the\s+/i, "")
                  .charAt(0)
                  .toUpperCase() || "?",
              )}</div>`
        }</td>
        <td style="vertical-align:middle;padding-left:10px;font-family:${FONT_HEAD};font-size:18px;font-weight:600;letter-spacing:-0.01em;color:${BRAND.ink};">${escapeHtml(b.name)}</td>
      </tr></table>`
    : `<a href="${url}" style="text-decoration:none;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
        <td style="vertical-align:middle;"><img src="${emailAsset("logo.png")}" width="32" height="32" alt="Repulabs" style="display:block;width:32px;height:32px;border-radius:9px;" /></td>
        <td style="vertical-align:middle;padding-left:10px;">${wordmark(20)}</td>
      </tr></table></a>`;

  const footer = b
    ? `${opts.footerNote ? `<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:${BRAND.muted};">${opts.footerNote}</p>` : ""}
       <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
         <td style="font-size:12px;color:${BRAND.muted};padding-right:6px;">Sent with</td>
         <td><img src="${emailAsset("logo.png")}" width="15" height="15" alt="" style="display:block;width:15px;height:15px;border-radius:4px;" /></td>
         <td style="padding-left:5px;">${wordmark(12.5)}</td>
       </tr></table>`
    : `<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${BRAND.muted};">Repulabs, the reputation OS for local businesses.</p>
       ${opts.footerNote ? `<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${BRAND.muted};">${opts.footerNote}</p>` : ""}
       <p style="margin:0;font-size:13px;line-height:1.6;"><a href="${url}" style="color:${BRAND.muted};text-decoration:none;">${escapeHtml(url.replace(/^https?:\/\//, ""))}</a></p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(opts.title)}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Onest:wght@500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet" />
<style>
  @media only screen and (max-width: 620px) {
    .rl-wrap { width: 100% !important; }
    .rl-pad { padding: 24px 20px 26px !important; }
    .rl-hero { padding: 28px 18px !important; }
    .rl-h1 { font-size: 23px !important; }
    .rl-big { font-size: 48px !important; }
    .rl-side { width: 96px !important; }
    .rl-side img { width: 96px !important; height: auto !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};font-family:${FONT_BODY};color:${BRAND.ink};-webkit-font-smoothing:antialiased;">
  <!-- Preheader: hidden from view, shown in inbox preview -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(opts.preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.canvas}" style="background:${BRAND.canvas};">
    <tr><td align="center" style="padding:34px 12px 40px;">
      <table role="presentation" class="rl-wrap" width="580" cellpadding="0" cellspacing="0" border="0" style="width:580px;max-width:580px;">
        <tr><td align="center" style="padding:0 0 22px;">${masthead}</td></tr>
        <tr><td style="background:${BRAND.surface};border-radius:26px;box-shadow:0 2px 4px rgba(16,24,40,.04),0 24px 48px -28px rgba(16,24,40,.28);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${opts.hero ?? ""}
            <tr><td class="rl-pad" style="padding:28px 34px 30px;">${opts.body}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 8px 0;">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================================
// Hero blocks
// ============================================================

export type EmailTone = "brand" | "success" | "warning" | "danger";

const TONE_BG: Record<EmailTone, string> = {
  brand: BRAND.primary50,
  success: BRAND.okBg,
  warning: BRAND.warnBg,
  danger: BRAND.dangerBg,
};
const TONE_FG: Record<EmailTone, string> = {
  brand: BRAND.primary,
  success: BRAND.ok,
  warning: BRAND.warn,
  danger: BRAND.danger,
};

/** Animated hero icon on a white app-icon tile (`file` is in /assets/repulabs/email). */
export function emailHeroIcon(file: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px;"><tr>
    <td style="background:#ffffff;border-radius:26px;padding:14px;box-shadow:${SHADOW};"><img src="${emailAsset(file)}" width="76" height="76" alt="" style="display:block;width:76px;height:76px;" /></td>
  </tr></table>`;
}

/** The Repulabs AI frog, animated. Only on brand-tinted heroes (the GIF is matted to it). */
export function emailFrog(width = 150): string {
  const h = Math.round((width * 190) / 240);
  return `<img src="${emailAsset("frog.gif")}" width="${width}" height="${h}" alt="Repulabs AI" style="display:block;margin:0 auto;width:${width}px;height:${h}px;" />`;
}

/** Small rounded pill: status badges and tags. */
export function emailPill(
  text: string,
  tone: EmailTone | "white" = "white",
  textColor?: string,
): string {
  const bg = tone === "white" ? "#ffffff" : TONE_BG[tone];
  const fg = textColor ?? (tone === "white" ? BRAND.ink : TONE_FG[tone]);
  const shadow = tone === "white" ? `box-shadow:${SHADOW};` : "";
  return `<span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${bg};${shadow}font-size:12.5px;font-weight:600;line-height:1.3;color:${fg};">${text}</span>`;
}

/**
 * Tinted hero at the top of the card. `visual` is raw HTML (icon tile, frog,
 * calendar); `extra` is appended under the sub line (rating card, star row).
 * `title`/`sub` are raw HTML, so escape user data before passing it.
 */
export function emailHero(opts: {
  title: string;
  sub?: string;
  visual?: string;
  badge?: string;
  extra?: string;
  tone?: EmailTone;
  /** Override the tint (business accent emails). */
  tint?: string;
}): string {
  const bg = opts.tint ?? TONE_BG[opts.tone ?? "brand"];
  return `<tr><td style="padding:10px 10px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="rl-hero" bgcolor="${bg}" style="background:${bg};border-radius:20px;padding:34px 28px 32px;text-align:center;">
        ${opts.badge ? `<div style="margin:0 0 16px;">${opts.badge}</div>` : ""}
        ${opts.visual ?? ""}
        <h1 class="rl-h1" style="margin:0;font-family:${FONT_HEAD};font-size:27px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:${BRAND.ink};">${opts.title}</h1>
        ${opts.sub ? `<p style="margin:10px auto 0;max-width:430px;font-size:15.5px;line-height:1.6;color:${BRAND.ink2};">${opts.sub}</p>` : ""}
        ${opts.extra ?? ""}
      </td>
    </tr></table>
  </td></tr>`;
}

/** Dark navy hero (sign-in). `inner` is raw HTML. */
export function emailDarkHero(inner: string): string {
  return `<tr><td style="padding:10px 10px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="rl-hero" bgcolor="#0f1a33" style="background:#0f1a33;background-image:radial-gradient(90% 75% at 50% 0%,rgba(36,87,255,.55) 0%,rgba(36,87,255,0) 65%),linear-gradient(180deg,#13214a,#0b1220);border-radius:20px;padding:44px 28px 38px;text-align:center;">${inner}</td>
    </tr></table>
  </td></tr>`;
}

// ============================================================
// Building blocks
// ============================================================

/**
 * Primary CTA, a rounded pill with a soft glow. `variant: "light"` is the
 * white button for dark heroes. Outlook keeps the bgcolor cell.
 */
export function ctaButton(opts: {
  url: string;
  label: string;
  accent?: string | null;
  variant?: "solid" | "light";
  margin?: string;
}): string {
  const light = opts.variant === "light";
  const bg = light ? "#ffffff" : opts.accent || BRAND.primary;
  const fg = light ? BRAND.ink : "#ffffff";
  const glow = light ? "rgba(36,87,255,.9)" : bg;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:${opts.margin ?? "26px auto 20px"};"><tr>
    <td align="center" bgcolor="${bg}" style="border-radius:999px;box-shadow:0 12px 24px -12px ${glow};">
      <a href="${opts.url}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT_BODY};font-size:15px;font-weight:600;color:${fg};text-decoration:none;border-radius:999px;">${escapeHtml(opts.label)} &nbsp;&rarr;</a>
    </td>
  </tr></table>`;
}

/** Heading inside the card body (h2-sized). */
export function emailHeading(text: string): string {
  return `<h2 style="margin:0 0 8px;font-family:${FONT_HEAD};font-size:20px;font-weight:600;letter-spacing:-0.02em;line-height:1.3;color:${BRAND.ink};">${escapeHtml(text)}</h2>`;
}

/** Body paragraph. `html` is inserted raw, so escape user data first. */
export function emailParagraph(html: string, extraStyle = ""): string {
  return `<p style="margin:0 0 16px;font-size:15.5px;line-height:1.65;color:${BRAND.ink2};${extraStyle}">${html}</p>`;
}

/** Small muted line, centred by default. `html` is raw. */
export function emailSmall(html: string, extraStyle = "text-align:center;"): string {
  return `<p style="margin:0;font-size:13.5px;line-height:1.6;color:${BRAND.muted};${extraStyle}">${html}</p>`;
}

/** Section label, optionally with a pill on the right. */
export function emailLabel(text: string, opts: { right?: string; top?: number } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${opts.top ?? 0}px 0 12px;"><tr>
    <td style="font-family:${FONT_HEAD};font-size:15px;font-weight:600;color:${BRAND.ink};">${escapeHtml(text)}</td>
    ${opts.right ? `<td style="text-align:right;">${opts.right}</td>` : ""}
  </tr></table>`;
}

/** Soft grey panel for secondary detail (link fallbacks, summaries). */
export function emailPanel(innerHtml: string, margin = "0 0 12px"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};"><tr>
    <td bgcolor="${BRAND.fill}" style="background:${BRAND.fill};border-radius:16px;padding:14px 16px;font-size:14px;line-height:1.55;color:${BRAND.ink2};">${innerHtml}</td>
  </tr></table>`;
}

/** White card with a soft shadow. */
export function emailCard(innerHtml: string, margin = "0 0 12px"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};"><tr>
    <td bgcolor="#ffffff" style="background:#ffffff;border-radius:16px;padding:18px 20px;box-shadow:${SHADOW};">${innerHtml}</td>
  </tr></table>`;
}

/** Five stars, filled to `n`. */
export function emailStars(n: number, size = 14): string {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return `<span style="font-size:${size}px;letter-spacing:2px;color:${BRAND.star};">${"&#9733;".repeat(k)}</span>${
    k < 5
      ? `<span style="font-size:${size}px;letter-spacing:2px;color:${BRAND.starEmpty};">${"&#9733;".repeat(5 - k)}</span>`
      : ""
  }`;
}

const AVATAR_TONES: Array<[string, string]> = [
  [BRAND.primary50, BRAND.primary],
  [BRAND.okBg, BRAND.ok],
  [BRAND.warnBg, "#b45309"],
  [BRAND.dangerBg, BRAND.danger],
  ["#f3f5f0", BRAND.ink2],
];

/** Initials avatar; the tint is picked from the name so it stays stable. */
export function emailAvatar(name: string | null | undefined, size = 42, solid = false): string {
  const clean = (name ?? "").replace(/@.*/, "").trim() || "?";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
  let h = 0;
  for (const ch of clean) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = solid
    ? [BRAND.primary, "#ffffff"]
    : (AVATAR_TONES[h % AVATAR_TONES.length] ?? [BRAND.primary50, BRAND.primary]);
  return `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};color:${fg};font-family:${FONT_HEAD};font-size:${Math.round(size * 0.36)}px;font-weight:600;line-height:${size}px;text-align:center;">${escapeHtml(initials)}</div>`;
}

/** A person row: avatar, name, sub line, optional right-hand HTML and quote. */
export function emailPersonCard(opts: {
  name: string;
  sub?: string;
  right?: string;
  quote?: string | null;
}): string {
  return emailCard(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="56" style="width:56px;vertical-align:middle;">${emailAvatar(opts.name, 46)}</td>
      <td style="vertical-align:middle;">
        <div style="font-family:${FONT_HEAD};font-size:16px;font-weight:600;color:${BRAND.ink};">${escapeHtml(opts.name)}</div>
        ${opts.sub ? `<div style="font-size:13.5px;color:${BRAND.muted};margin-top:2px;">${opts.sub}</div>` : ""}
      </td>
      ${opts.right ? `<td style="text-align:right;vertical-align:middle;">${opts.right}</td>` : ""}
    </tr></table>
    ${
      opts.quote
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr><td bgcolor="${BRAND.fill}" style="background:${BRAND.fill};border-radius:12px;padding:12px 14px;font-size:14.5px;line-height:1.55;color:${BRAND.ink};">&ldquo;${escapeHtml(opts.quote)}&rdquo;</td></tr></table>`
        : ""
    }`);
}

/** Review card: avatar, name, stars, meta and the review text. */
export function emailReviewCard(opts: {
  name: string | null;
  rating: number;
  body: string | null;
  meta?: string;
  footer?: string;
}): string {
  const who = opts.name?.trim() || "Anonymous";
  const text = (opts.body ?? "").trim();
  return emailCard(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="52" style="width:52px;vertical-align:top;">${emailAvatar(who)}</td>
      <td style="vertical-align:top;">
        <div style="font-size:15px;font-weight:600;color:${BRAND.ink};">${escapeHtml(who)}</div>
        <div style="margin-top:2px;">${emailStars(opts.rating, 13)}${opts.meta ? `<span style="font-size:12.5px;color:${BRAND.muted};">&nbsp; ${escapeHtml(opts.meta)}</span>` : ""}</div>
      </td>
    </tr></table>
    ${text ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(text.length > 280 ? `${text.slice(0, 277)}…` : text)}</p>` : `<p style="margin:12px 0 0;font-size:14px;color:${BRAND.muted};">No written review, rating only.</p>`}
    ${opts.footer ?? ""}`);
}

/** White icon chip (static PNG from /assets/repulabs/email). */
export function emailIconChip(file: string, size = 38): string {
  const img = Math.round(size * 0.63);
  const pad = Math.round((size - img) / 2);
  return `<div style="width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.3)}px;background:#ffffff;"><img src="${emailAsset(file)}" width="${img}" height="${img}" alt="" style="display:block;width:${img}px;height:${img}px;padding:${pad}px;" /></div>`;
}

/** Icon rows on a grey fill, with an optional value on the right. */
export function emailActivityRows(
  rows: Array<{ icon: string; label: string; value?: string | number }>,
): string {
  return rows
    .map(
      (
        r,
      ) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr>
      <td bgcolor="${BRAND.fill}" style="background:${BRAND.fill};border-radius:14px;padding:11px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="52" style="width:52px;">${emailIconChip(r.icon)}</td>
          <td style="font-size:14.5px;color:${BRAND.ink};">${escapeHtml(r.label)}</td>
          ${r.value !== undefined ? `<td style="text-align:right;font-family:${FONT_NUM};font-size:16px;font-weight:800;color:${BRAND.ink};">${escapeHtml(String(r.value))}</td>` : ""}
        </tr></table>
      </td>
    </tr></table>`,
    )
    .join("");
}

/** Icon rows with a proportional bar under each label (Autopilot breakdown). */
export function emailBarRows(rows: Array<{ icon: string; label: string; value: number }>): string {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows
    .map((r) => {
      const pct = Math.max(4, Math.round((r.value / max) * 100));
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr>
      <td bgcolor="${BRAND.fill}" style="background:${BRAND.fill};border-radius:14px;padding:12px 14px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="52" style="width:52px;vertical-align:middle;">${emailIconChip(r.icon)}</td>
          <td style="vertical-align:middle;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-size:14.5px;color:${BRAND.ink};">${escapeHtml(r.label)}</td>
              <td style="text-align:right;font-family:${FONT_NUM};font-size:16px;font-weight:800;color:${BRAND.ink};">${r.value}</td>
            </tr></table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:7px;"><tr>
              <td width="${pct}%" bgcolor="${BRAND.primary}" style="height:6px;line-height:6px;font-size:0;background:${BRAND.primary};border-radius:99px;">&nbsp;</td>
              ${pct < 100 ? `<td style="height:6px;line-height:6px;font-size:0;">&nbsp;</td>` : ""}
            </tr></table>
          </td>
        </tr></table>
      </td>
    </tr></table>`;
    })
    .join("");
}

/** Label / value rows on a grey fill (booking details). Values are raw HTML. */
export function emailDetailCard(rows: Array<{ label: string; value: string }>): string {
  const body = rows
    .map(
      (r, i) => `<tr>
        <td style="padding:${i ? 10 : 0}px 12px 0 0;width:84px;font-size:15px;line-height:1.5;color:${BRAND.muted};vertical-align:top;">${escapeHtml(r.label)}</td>
        <td style="padding:${i ? 10 : 0}px 0 0;font-size:15px;line-height:1.5;color:${BRAND.ink};font-weight:500;">${r.value}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr>
    <td bgcolor="${BRAND.fill}" style="background:${BRAND.fill};border-radius:16px;padding:18px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
    </td>
  </tr></table>`;
}

/** Label/value rows, kept for older callers. Values are escaped. */
export function emailDetailRows(rows: Array<{ label: string; value: string }>): string {
  return emailDetailCard(rows.map((r) => ({ label: r.label, value: escapeHtml(r.value) })));
}

/** Tear-off calendar tile for the booking hero. */
export function emailCalendar(opts: { month: string; day: string; weekday: string }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 18px;"><tr>
    <td width="92" bgcolor="#ffffff" style="width:92px;background:#ffffff;border-radius:18px;box-shadow:${SHADOW};text-align:center;">
      <div style="background:${BRAND.primary};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.1em;padding:7px 0;border-radius:18px 18px 0 0;">${escapeHtml(opts.month.toUpperCase())}</div>
      <div style="font-family:${FONT_NUM};font-size:38px;line-height:1;font-weight:800;color:${BRAND.ink};padding:12px 0 2px;">${escapeHtml(opts.day)}</div>
      <div style="font-size:12px;color:${BRAND.muted};padding:0 0 12px;">${escapeHtml(opts.weekday)}</div>
    </td>
  </tr></table>`;
}

/** Big metric tiles. Kept to a table so Outlook lays it out. */
export function emailStatRow(
  stats: Array<{ value: string | number; label: string; icon?: string }>,
): string {
  if (stats.length === 0) return "";
  const cells = stats
    .map(
      (
        s,
        i,
      ) => `${i ? `<td width="10" style="width:10px;font-size:0;">&nbsp;</td>` : ""}<td style="vertical-align:top;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${BRAND.fill}" style="background:${BRAND.fill};border-radius:16px;padding:16px 14px;">
        ${s.icon ? `<div style="margin:0 0 12px;">${emailIconChip(s.icon, 40)}</div>` : ""}
        <div style="font-family:${FONT_NUM};font-size:26px;line-height:1.1;font-weight:800;letter-spacing:-0.02em;color:${BRAND.ink};">${escapeHtml(String(s.value))}</div>
        <div style="margin-top:4px;font-size:12.5px;color:${BRAND.ink2};">${escapeHtml(s.label)}</div>
      </td></tr></table>
    </td>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;table-layout:fixed;"><tr>${cells}</tr></table>`;
}

/** Rating summary card: big average, stars and a 5★ to 1★ bar breakdown. */
export function emailRatingSummary(opts: {
  average: number;
  count: number;
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}): string {
  const max = Math.max(1, ...([5, 4, 3, 2, 1] as const).map((s) => opts.breakdown[s]));
  const rows = ([5, 4, 3, 2, 1] as const)
    .map((s) => {
      const n = opts.breakdown[s];
      const pct = Math.round((n / max) * 100);
      return `<tr>
        <td style="width:28px;font-family:${FONT_NUM};font-size:12.5px;font-weight:700;color:${BRAND.ink2};padding:3px 0;">${s}<span style="color:${BRAND.star};">&#9733;</span></td>
        <td style="padding:3px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          ${
            n > 0
              ? `<td width="${pct}%" bgcolor="${BRAND.star}" style="height:8px;line-height:8px;font-size:0;background:${BRAND.star};border-radius:99px;">&nbsp;</td>${pct < 100 ? `<td style="height:8px;line-height:8px;font-size:0;">&nbsp;</td>` : ""}`
              : `<td bgcolor="${BRAND.starEmpty}" style="height:8px;line-height:8px;font-size:0;background:${BRAND.starEmpty};border-radius:99px;">&nbsp;</td>`
          }
        </tr></table></td>
        <td style="width:18px;text-align:right;font-family:${FONT_NUM};font-size:12.5px;font-weight:700;color:${BRAND.ink};">${n}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;"><tr>
    <td bgcolor="#ffffff" style="background:#ffffff;border-radius:18px;padding:20px 22px;box-shadow:${SHADOW};text-align:left;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="44%" style="vertical-align:middle;">
          <div class="rl-big" style="font-family:${FONT_NUM};font-size:50px;line-height:1;font-weight:800;letter-spacing:-0.03em;color:${BRAND.ink};">${opts.average.toFixed(2)}</div>
          <div style="margin-top:6px;">${emailStars(opts.average, 16)}</div>
          <div style="margin-top:6px;font-size:13px;color:${BRAND.muted};">from ${opts.count} new review${opts.count === 1 ? "" : "s"}</div>
        </td>
        <td style="vertical-align:middle;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td>
      </tr></table>
    </td>
  </tr></table>`;
}

/** Row of five tappable stars that all open `url` (no rating gating). */
export function emailStarRow(url: string): string {
  const star = `<td style="padding:0 4px;"><a href="${url}" target="_blank" style="display:block;width:46px;height:46px;line-height:46px;border-radius:14px;background:#ffffff;box-shadow:${SHADOW};text-align:center;font-size:24px;color:${BRAND.star};text-decoration:none;">&#9733;</a></td>`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:18px auto 0;"><tr>${star.repeat(5)}</tr></table>`;
}

/** 0 to 10 recommendation scale. `hrefFor(n)` builds each number's link. */
export function emailNpsScale(hrefFor: (n: number) => string): string {
  const tone = (i: number): [string, string] =>
    i <= 6
      ? [BRAND.dangerBg, BRAND.danger]
      : i <= 8
        ? [BRAND.warnBg, "#b45309"]
        : [BRAND.okBg, BRAND.ok];
  const cells = Array.from({ length: 11 }, (_, i) => {
    const [bg, fg] = tone(i);
    return `<td style="padding:0 2px;"><a href="${hrefFor(i)}" target="_blank" style="display:block;height:42px;line-height:42px;text-align:center;border-radius:11px;background:${bg};color:${fg};font-family:${FONT_NUM};font-size:15px;font-weight:800;text-decoration:none;">${i}</a></td>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;table-layout:fixed;"><tr>${cells}</tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-size:12.5px;color:${BRAND.muted};">Not likely</td>
    <td style="font-size:12.5px;color:${BRAND.muted};text-align:right;">Very likely</td>
  </tr></table>`;
}

/** Hero tint for a business's own accent colour (falls back to brand blue 50). */
export function emailAccentTint(accent: string | null | undefined): string {
  return accent ? tintOf(accent, 0.9) : BRAND.primary50;
}

/** Unsubscribe link for bulk mail. Transactional mail must NOT use this. */
export function emailUnsubscribeLine(url: string): string {
  return `<a href="${url}" style="color:${BRAND.muted};text-decoration:underline;">Unsubscribe</a>`;
}

// ============================================================
// Magic-link sign-in email
// ============================================================
export function magicLinkEmail(url: string): { html: string; text: string } {
  // The address is already in the NextAuth callback URL, so we can show who is
  // signing in without touching the auth wiring.
  let email: string | null = null;
  try {
    email = new URL(url).searchParams.get("email");
  } catch {
    email = null;
  }

  const hero = emailDarkHero(`
    <img src="${emailAsset("logo.png")}" width="68" height="68" alt="Repulabs" style="display:block;margin:0 auto 24px;width:68px;height:68px;border-radius:18px;box-shadow:0 0 0 8px rgba(255,255,255,.06),0 18px 40px -8px rgba(36,87,255,.85);" />
    <h1 class="rl-h1" style="margin:0;font-family:${FONT_HEAD};font-size:28px;line-height:1.25;font-weight:600;letter-spacing:-0.02em;color:#ffffff;">Your sign-in link is here</h1>
    <p style="margin:10px auto 0;max-width:400px;font-size:15.5px;line-height:1.6;color:#b9c3d8;">Tap the button to open your workspace. No password needed.</p>
    ${ctaButton({ url, label: "Sign in to Repulabs", variant: "light", margin: "26px auto 18px" })}
    <span style="display:inline-block;padding:7px 14px;border-radius:999px;background:#25304a;font-size:12.5px;color:#c9d3e6;">Expires in 15 minutes &nbsp;&middot;&nbsp; works once</span>
  `);

  const body = `
    ${
      email
        ? emailPanel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="52" style="width:52px;">${emailAvatar(email, 40, true)}</td>
            <td><div style="font-size:12.5px;color:${BRAND.muted};">Signing in as</div><div style="font-size:15px;font-weight:600;color:${BRAND.ink};margin-top:1px;">${escapeHtml(email)}</div></td>
          </tr></table>`)
        : ""
    }
    ${emailPanel(
      `<div style="font-size:12.5px;color:${BRAND.muted};margin-bottom:4px;">Button not working? Paste this into your browser</div>
      <a href="${url}" style="font-size:13px;line-height:1.6;color:${BRAND.primary};text-decoration:none;word-break:break-all;">${escapeHtml(url)}</a>`,
      "0",
    )}
    ${emailSmall("Didn't ask for this? Ignore this email and nothing will change.", "margin-top:20px;text-align:center;")}
  `;

  const html = emailShell({
    preheader: "Tap to sign in. The link works once and expires in 15 minutes.",
    title: "Sign in to Repulabs",
    hero,
    body,
  });

  const text = [
    "Your sign-in link for Repulabs",
    "",
    "Open the link below to sign in. It works once and expires in 15 minutes.",
    "",
    url,
    "",
    "Didn't ask for this? Ignore this email and nothing will change.",
    "",
    "Repulabs",
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
  const org = escapeHtml(opts.orgName);
  const inviter = escapeHtml(opts.inviterName);

  const visual = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px;"><tr>
    <td>${emailAvatar(opts.inviterName, 64, true)}</td>
    <td style="padding:0 12px;"><div style="width:40px;height:40px;border-radius:999px;background:#ffffff;box-shadow:${SHADOW};"><img src="${emailAsset("icon-send.png")}" width="24" height="24" alt="" style="display:block;width:24px;height:24px;padding:8px;" /></div></td>
    <td><div style="width:64px;height:64px;border-radius:999px;background:#ffffff;box-shadow:${SHADOW};"><img src="${emailAsset("hero-team.gif")}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;padding:10px;" /></div></td>
  </tr></table>`;

  const html = emailShell({
    preheader: `${opts.inviterName} invited you to join ${opts.orgName} on Repulabs.`,
    title: `Join ${opts.orgName} on Repulabs`,
    hero: emailHero({
      visual,
      title: `You're invited to ${org}`,
      sub: `${inviter} wants you on the team. Join to reply to reviews and keep an eye on customer feedback.`,
    }),
    body: `
      ${emailLabel("What you'll be able to do")}
      ${emailActivityRows([
        { icon: "icon-draft-replies.png", label: "Reply to reviews with AI drafts" },
        { icon: "icon-review-requests.png", label: "Send review requests to customers" },
        { icon: "icon-growth.png", label: "Track ratings across every location" },
      ])}
      ${ctaButton({ url: opts.acceptUrl, label: "Accept invitation" })}
      ${emailSmall("This invite expires in 7 days. Not expecting it? You can ignore this email.")}
    `,
  });

  const text = [
    `You're invited to ${opts.orgName}`,
    "",
    `${opts.inviterName} added you to the ${opts.orgName} workspace on Repulabs.`,
    "",
    `Accept here: ${opts.acceptUrl}`,
    "",
    "This invite expires in 7 days.",
    "",
    "Repulabs",
    siteUrl(),
  ].join("\n");

  return { html, text };
}

// ============================================================
// Review request email (kept for callers outside the dispatch path)
// ============================================================
export function reviewRequestEmail(opts: {
  customerName: string;
  businessName: string;
  reviewUrl: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const biz = escapeHtml(opts.businessName);
  const html = emailShell({
    preheader: `How was your visit to ${opts.businessName}?`,
    title: `How was your visit to ${opts.businessName}?`,
    brand: { name: opts.businessName },
    hero: emailHero({
      visual: emailHeroIcon("hero-star.gif"),
      title: `How was your visit, ${escapeHtml(emailFirstName(opts.customerName))}?`,
      sub: `Tap a star to leave ${biz} a review.`,
      extra: emailStarRow(opts.reviewUrl),
    }),
    body: `
      ${emailParagraph("Thanks for coming in. Your review helps other locals find us, and we read every single one.", "text-align:center;")}
      ${ctaButton({ url: opts.reviewUrl, label: "Leave a review" })}
      ${emailSmall(`Thank you,<br>${emailTeamName(opts.businessName)}`, `text-align:center;color:${BRAND.ink2};`)}
    `,
    footerNote: `You're getting this because you visited ${biz}. ${emailUnsubscribeLine(opts.unsubscribeUrl)}`,
  });

  const text = [
    `Hi ${opts.customerName},`,
    "",
    `Thanks for choosing ${opts.businessName}. If you have a moment, we'd love a review:`,
    "",
    opts.reviewUrl,
    "",
    `The ${opts.businessName} team`,
    "",
    `Unsubscribe: ${opts.unsubscribeUrl}`,
  ].join("\n");

  return { html, text };
}
