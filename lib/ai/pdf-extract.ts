/**
 * PDF text extraction (Module 05 — ENHANCE).
 *
 * `extractPdfText(buf)` returns plain text from a PDF buffer, or "" if the PDF
 * has no extractable text / can't be parsed (caller treats "" as "no usable
 * text" and rejects the upload — never a 500).
 *
 * Strategy (all server-safe, no native binary):
 *   1. Lazily `await import("unpdf")` — a pure-JS PDF text extractor. The import
 *      is dynamic + try/caught so a MISSING dependency can't break `next build`
 *      of unrelated routes (the dep is optional; see CODE_RESULT issues).
 *   2. If unpdf isn't installed, fall back to a minimal in-house extractor that
 *      pulls text from uncompressed PDF content streams. Good enough for simple
 *      text PDFs; returns "" for image-only / fully-compressed PDFs.
 *
 * Whitespace is collapsed with the same normalize tail as crawl.ts#htmlToText.
 */

import { logger } from "@/lib/logger";

const MAX_OUTPUT_CHARS = 200_000;

function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/ /g, " ") // non-breaking space → normal space
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_OUTPUT_CHARS);
}

/**
 * Try the optional `unpdf` dependency. Returns null if it isn't installed or
 * throws — the caller then falls back to the in-house extractor.
 */
type UnpdfModule = {
  extractText?: (
    data: Uint8Array,
    opts?: { mergePages?: boolean },
  ) => Promise<{ text: string | string[] }>;
};

async function tryUnpdf(buf: Buffer): Promise<string | null> {
  try {
    // `unpdf` is an OPTIONAL dependency that may not be installed (see
    // CODE_RESULT issues). A bare `import("unpdf")` makes tsc try to resolve the
    // literal specifier and fail with TS2307. Building the specifier at runtime
    // keeps the import dynamic-only: tsc can't statically resolve it (so no
    // hard dependency on the type decls), and `next build` of unrelated routes
    // can't break if the dep is absent. The `.catch` then no-ops to the naive
    // fallback when the module genuinely isn't there.
    const specifier = ["un", "pdf"].join("");
    const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ specifier).catch(
      () => null,
    )) as UnpdfModule | null;
    if (!mod?.extractText) return null;
    const { text } = await mod.extractText(new Uint8Array(buf), { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    return typeof joined === "string" ? joined : null;
  } catch (err) {
    logger.warn(
      { event: "kb.pdf.unpdf_failed", error: err instanceof Error ? err.message : String(err) },
    );
    return null;
  }
}

/**
 * Minimal fallback: extract text from PDF content streams. Handles the common
 * `(literal) Tj` and `[(a) (b)] TJ` text-showing operators in UNCOMPRESSED
 * streams. Returns "" for PDFs whose streams are all FlateDecode-compressed
 * (i.e. most real-world PDFs) — in that case the upload is rejected with a clear
 * message and the owner can paste the text instead.
 */
function naiveExtract(buf: Buffer): string {
  const s = buf.toString("latin1");
  const out: string[] = [];

  // Pull text from `( ... ) Tj` and `[ ... ] TJ` show operators.
  const showRe = /(\((?:\\.|[^\\()])*\)|\[(?:[^\][]|\\.)*\])\s*T[jJ]/g;
  const litRe = /\((?:\\.|[^\\()])*\)/g;
  for (const match of s.matchAll(showRe)) {
    const blob = match[1] ?? "";
    // Extract each (...) literal inside the operand.
    for (const lit of blob.matchAll(litRe)) {
      out.push(decodePdfString(lit[0].slice(1, -1)));
    }
    out.push(" ");
  }
  return out.join("");
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct: string) => {
      const code = Number.parseInt(oct, 8);
      return Number.isNaN(code) ? "" : String.fromCharCode(code);
    });
}

export async function extractPdfText(buf: Buffer): Promise<string> {
  if (!buf || buf.length === 0) return "";
  // PDFs start with "%PDF". Bail early on non-PDF input.
  if (buf.subarray(0, 5).toString("latin1").indexOf("%PDF") === -1) {
    return "";
  }

  try {
    const viaUnpdf = await tryUnpdf(buf);
    if (viaUnpdf && viaUnpdf.trim().length >= 20) {
      return normalize(viaUnpdf);
    }
    const viaNaive = naiveExtract(buf);
    if (viaNaive.trim().length >= 20) {
      return normalize(viaNaive);
    }
    return "";
  } catch (err) {
    logger.warn(
      { event: "kb.pdf.extract_failed", error: err instanceof Error ? err.message : String(err) },
    );
    return "";
  }
}
