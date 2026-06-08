import QRCode from "qrcode";

/**
 * QR-with-center-logo generator — DEPENDENCY-LIGHT.
 *
 * Why SVG string composition (not a raster compositor):
 *   - `sharp` is NOT installed in every environment (CI / local). A static
 *     `import sharp` would crash module load. So the SVG path is pure string
 *     injection over `qrcode`'s SVG output, and the PNG path tries `sharp` via
 *     dynamic import and FALLS BACK to a plain (logo-less) PNG if it's absent.
 *   - QR codes at errorCorrectionLevel:'H' recover from ~30% damage, so a
 *     centered logo occluding the middle ~18-22% of modules still scans. We
 *     never go above ~24% of the symbol width for the white backing.
 *
 * The brand glyphs are hand-authored SVG fragments in a fixed 24x24 user space
 * (`GLYPH_VIEWBOX`). `qrSvgWithLogo` scales + translates them into the QR's
 * module-coordinate viewBox so the logo always lands dead-center regardless of
 * the QR's data density (module count) or the requested pixel width.
 *
 * Nothing here logs the encoded URL or any secret — these are pure renderers.
 */

export type QrPlatform = "google" | "instagram" | "facebook" | "star" | "repulabs" | "multi";

/** The 24x24 user-space every glyph below is authored in. */
const GLYPH_VIEWBOX = 24;

/**
 * Fraction of the QR symbol width the white logo backing occupies. 0.22 keeps
 * total center occlusion under the H-level (~30%) damage budget with margin to
 * spare. The glyph itself is inset inside the backing (see GLYPH_INSET).
 */
const BACKING_FRACTION = 0.22;

/** Glyph inset inside the white backing, as a fraction of the backing size. */
const GLYPH_INSET = 0.16;

/**
 * Inline brand glyphs, each authored in a 0..24 user space. These are
 * deliberately simplified, single-purpose marks (NOT the official multi-path
 * logos) so they stay crisp at the small center size and don't carry
 * trademarked gradients. `repulabs` and `multi` share a generic mark.
 *
 * IMPORTANT: keep these free of `<script>`, external refs, or `<image href>` —
 * the SVG is served from our origin and must not be an XSS / SSRF vector.
 */
export const PLATFORM_GLYPHS: Record<QrPlatform, string> = {
  // Google "G" — four-color arcs approximated with solid wedges + center gap.
  google: [
    '<path fill="#4285F4" d="M12 9.8v4.6h6.4c-.28 1.5-1.12 2.76-2.38 3.6v3h3.84C22.1 22 23.4 18.94 23.4 15.3c0-.86-.08-1.7-.22-2.5z"/>',
    '<path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.94-2.92l-3.84-3c-1.06.72-2.42 1.14-4.1 1.14-3.16 0-5.84-2.14-6.8-5.02H1.2v3.1C3.16 21.42 7.24 24 12 24z"/>',
    '<path fill="#FBBC05" d="M5.2 14.2c-.24-.72-.38-1.5-.38-2.3s.14-1.58.38-2.3V6.5H1.2C.44 8.02 0 9.96 0 11.9s.44 3.88 1.2 5.4z"/>',
    '<path fill="#EA4335" d="M12 4.76c1.78 0 3.38.62 4.64 1.82l3.4-3.4C17.94 1.18 15.22 0 12 0 7.24 0 3.16 2.58 1.2 6.5l4 3.1C6.16 6.9 8.84 4.76 12 4.76z"/>',
  ].join(""),
  // Instagram camera — rounded square + lens + corner dot, single brand color.
  instagram: [
    '<rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke="#E1306C" stroke-width="2.4"/>',
    '<circle cx="12" cy="12" r="5" fill="none" stroke="#E1306C" stroke-width="2.4"/>',
    '<circle cx="17.6" cy="6.4" r="1.5" fill="#E1306C"/>',
  ].join(""),
  // Facebook "f" inside the brand-blue rounded square.
  facebook: [
    '<rect x="1" y="1" width="22" height="22" rx="5" fill="#1877F2"/>',
    '<path fill="#ffffff" d="M14.7 12.4h2.1l.4-2.7h-2.5V8c0-.78.26-1.32 1.4-1.32h1.2V4.26C18.4 4.18 17.6 4.1 16.66 4.1c-2 0-3.36 1.22-3.36 3.46v1.93H11v2.7h2.3V20h2.4z"/>',
  ].join(""),
  // Generic 5-point star (used for star / fallback contexts).
  star: '<path fill="#F5A623" d="M12 2.2l2.9 6.06 6.66.86-4.9 4.56 1.26 6.58L12 17.7l-5.92 3.12 1.26-6.58L2.44 9.68l6.66-.86z"/>',
  // Repulabs generic mark — rounded "R"-ish chat-leaf in brand blue.
  repulabs: [
    '<rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="#2563EB"/>',
    '<path fill="#ffffff" d="M8 6.4h5.1c2.5 0 4 1.5 4 3.8 0 1.7-.9 2.95-2.4 3.5l2.7 4.3h-3l-2.4-3.95H10.8V18.4H8zm2.8 2.3v3h2.1c1.05 0 1.6-.6 1.6-1.5s-.55-1.5-1.6-1.5z"/>',
  ].join(""),
  // Multi-platform picker — three overlapping discs (generic).
  multi: [
    '<circle cx="9" cy="9" r="6.5" fill="#2563EB"/>',
    '<circle cx="15" cy="9" r="6.5" fill="#7C3AED" opacity="0.85"/>',
    '<circle cx="12" cy="15" r="6.5" fill="#0EA5E9" opacity="0.85"/>',
  ].join(""),
};

/** Stable, ordered list of supported platform keys (handy for tests / pickers). */
export const PLATFORM_GLYPH_KEYS = Object.keys(PLATFORM_GLYPHS) as QrPlatform[];

/**
 * Normalize an arbitrary platform-ish string to a supported glyph key. Anything
 * unknown (or a plain QR) maps to the generic `repulabs` mark so callers can
 * pass a raw `device.productKind` / source without a guard. `null`/`undefined`
 * also yield `repulabs`.
 */
export function resolvePlatform(input: string | null | undefined): QrPlatform {
  const k = (input ?? "").toLowerCase().trim();
  if (k === "google" || k === "google_business" || k === "gbp") return "google";
  if (k === "instagram" || k === "ig") return "instagram";
  if (k === "facebook" || k === "fb" || k === "meta") return "facebook";
  if (k === "star" || k === "review") return "star";
  if (k === "multi" || k === "multi_platform") return "multi";
  return "repulabs";
}

/** Parse `viewBox="0 0 N N"` → N (module count). Falls back to 33 on a miss. */
function parseViewBoxSize(svg: string): number {
  const m = svg.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  if (!m) return 33;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 33;
}

/**
 * Build the centered-logo `<g>` overlay in the QR's own viewBox coordinate
 * space (0..size). White rounded backing + the inset platform glyph, scaled
 * from the 24x24 glyph space.
 */
function buildLogoOverlay(size: number, platform: QrPlatform): string {
  const backing = size * BACKING_FRACTION;
  const backingX = (size - backing) / 2;
  const backingY = (size - backing) / 2;
  // Rounded-rect radius ~22% of the backing for a soft "app icon" look.
  const radius = backing * 0.22;

  const glyphBox = backing * (1 - GLYPH_INSET * 2);
  const glyphX = (size - glyphBox) / 2;
  const glyphY = (size - glyphBox) / 2;
  const glyphScale = glyphBox / GLYPH_VIEWBOX;

  const glyph = PLATFORM_GLYPHS[platform] ?? PLATFORM_GLYPHS.repulabs;

  // round to 3 decimals to keep the markup compact + deterministic
  const r = (v: number) => Math.round(v * 1000) / 1000;

  return [
    // White backing with a faint stroke so it reads as a deliberate badge.
    `<rect x="${r(backingX)}" y="${r(backingY)}" width="${r(backing)}" height="${r(backing)}" rx="${r(radius)}" ry="${r(radius)}" fill="#ffffff" stroke="#ffffff" stroke-width="${r(size * 0.004)}"/>`,
    // Glyph group, scaled from 24x24 into the inset region.
    `<g transform="translate(${r(glyphX)} ${r(glyphY)}) scale(${r(glyphScale)})">${glyph}</g>`,
  ].join("");
}

/**
 * Generate a QR code as an SVG string with a centered platform logo injected.
 *
 * - errorCorrectionLevel: 'H' (mandatory — the center occlusion needs the
 *   highest recovery budget).
 * - The logo `<g>` is appended immediately before the closing `</svg>` so it
 *   paints on top of the QR modules.
 *
 * @param url       the URL the QR encodes (e.g. https://repulabs.com/r/<slug>)
 * @param platform  brand glyph to center; unknown values fall back to repulabs
 * @param opts.width pixel width attribute (default 1024 for print)
 * @param opts.margin quiet-zone modules (default 2)
 */
export async function qrSvgWithLogo(
  url: string,
  platform: QrPlatform | string = "repulabs",
  opts?: { width?: number; margin?: number },
): Promise<string> {
  const plat = typeof platform === "string" ? resolvePlatform(platform) : platform;
  const baseSvg = await QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "H",
    width: opts?.width ?? 1024,
    margin: opts?.margin ?? 2,
  });

  const size = parseViewBoxSize(baseSvg);
  const overlay = buildLogoOverlay(size, plat);

  // Inject right before the final </svg>. `qrcode` always emits a single
  // top-level <svg>...</svg>, so a lastIndexOf is safe + cheap.
  const idx = baseSvg.lastIndexOf("</svg>");
  if (idx === -1) return baseSvg + overlay; // defensive: never throw on render
  return `${baseSvg.slice(0, idx)}${overlay}${baseSvg.slice(idx)}`;
}

/**
 * Generate a QR code as a PNG Buffer.
 *
 * Tries to rasterize the SVG-with-logo via `sharp` (dynamic import — NEVER a
 * static import, since sharp isn't installed everywhere). If sharp is absent or
 * rasterization fails for any reason, falls back to a plain (logo-less) PNG via
 * `qrcode.toBuffer` so the caller always gets a scannable PNG.
 *
 * @returns `{ buffer, hasLogo }` — `hasLogo` is false when we fell back.
 */
export async function qrPngWithLogo(
  url: string,
  platform: QrPlatform | string = "repulabs",
  opts?: { width?: number; margin?: number },
): Promise<{ buffer: Buffer; hasLogo: boolean }> {
  const width = opts?.width ?? 1024;
  const margin = opts?.margin ?? 2;

  // Attempt the high-fidelity SVG→PNG path. Wrapped so a missing/failing sharp
  // never bubbles — we always have the plain-PNG fallback below.
  try {
    // biome-ignore lint/suspicious/noExplicitAny: optional dep, no types guaranteed
    // Variable specifier (typed `string`) so tsc/webpack don't try to resolve an
    // optional dep that isn't installed in every environment.
    const sharpName: string = "sharp";
    const sharpMod: any = await import(sharpName).catch(() => null);
    const sharp = sharpMod?.default ?? sharpMod;
    if (sharp) {
      const svg = await qrSvgWithLogo(url, platform, { width, margin });
      const buffer = await sharp(Buffer.from(svg, "utf8"), { density: 300 })
        .resize(width, width, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
      return { buffer, hasLogo: true };
    }
  } catch {
    // fall through to plain PNG
  }

  const buffer = await QRCode.toBuffer(url, {
    type: "png",
    width,
    margin,
    errorCorrectionLevel: "H",
  });
  return { buffer, hasLogo: false };
}
