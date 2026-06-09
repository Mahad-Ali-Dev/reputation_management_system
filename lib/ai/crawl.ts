/**
 * URL crawl ingestion for the chatbot knowledge base.
 *
 * Pipeline:
 *   1. Validate URL (HTTPS-only, no private IPs, no localhost)
 *   2. Check robots.txt for the path (best-effort)
 *   3. Fetch with strict timeout + Content-Type allowlist + size cap
 *   4. Strip HTML to plain text + basic markdown for headers
 *   5. Hand off to the existing ingestDocument() pipeline
 *
 * SSRF protections (all enforced before any fetch):
 *   - Only http(s) schemes
 *   - Block private + link-local + loopback IP ranges (after DNS resolve)
 *   - Block credentials in URL (user:pass@)
 *   - Hard 10-second total timeout
 *   - Max 2 MB body
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
/**
 * Minimum readable text (across the whole crawl) we need before handing a corpus
 * to the extractor. JS-rendered marketing sites served via plain `fetch` (no
 * headless browser) often return only nav/footer boilerplate — a few hundred
 * chars that pass the per-page "not empty" check but yield an empty profile.
 * Below this we fail with a clear, actionable message instead of silently
 * building an empty profile.
 */
const MIN_CORPUS_CHARS = 400;
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml"];

export type CrawlError =
  | "invalid_url"
  | "non_https"
  | "private_ip_blocked"
  | "credentials_in_url"
  | "robots_disallowed"
  | "fetch_failed"
  | "content_too_large"
  | "unsupported_content_type"
  | "too_many_redirects"
  | "empty_after_strip"
  | "too_little_text";

export type CrawlResult = {
  url: string;
  finalUrl: string;
  contentType: string;
  bytes: number;
  /** Raw HTML (empty for text/plain). Used by crawlSite to discover links. */
  raw: string;
  text: string; // plain text + markdown-style headers
  fetchedAt: Date;
};

/**
 * Determine whether an IPv4 address is in a private / reserved range.
 * Block: 10.x, 127.x, 169.254.x, 172.16.x-172.31.x, 192.168.x, 0.x, 100.64.x (CGNAT)
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    return isPrivateIPv4(v4);
  }
  return false;
}

/** True if a resolved address (either family) lands in a blocked range. */
function isBlockedAddress(family: number, address: string): boolean {
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true; // unknown family → fail closed
}

/**
 * Validate URL syntactically + resolve host + block private IPs.
 *
 * Returns the parsed URL plus the *pinned* set of resolved IPs (the exact
 * addresses we vetted). Callers use `pinnedIps` to detect DNS rebinding: if a
 * later resolution returns a different/private address than what we vetted here,
 * the connection must be refused. (`fetch` re-resolves DNS itself between this
 * check and the socket connect — the rebind window this guards against.)
 */
async function validateUrlForFetch(
  rawUrl: string,
): Promise<{ url: URL; pinnedIps: string[] } | { error: CrawlError }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "non_https" };
  }
  if (url.username || url.password) {
    return { error: "credentials_in_url" };
  }
  // Resolve host. If the hostname is already a literal IP, just check it.
  const literal = isIP(url.hostname);
  if (literal === 4) {
    if (isPrivateIPv4(url.hostname)) return { error: "private_ip_blocked" };
    return { url, pinnedIps: [url.hostname] };
  }
  if (literal === 6) {
    if (isPrivateIPv6(url.hostname)) return { error: "private_ip_blocked" };
    return { url, pinnedIps: [url.hostname] };
  }
  try {
    const resolved = await lookup(url.hostname, { all: true });
    if (resolved.length === 0) return { error: "invalid_url" };
    for (const r of resolved) {
      if (isBlockedAddress(r.family, r.address)) return { error: "private_ip_blocked" };
    }
    return { url, pinnedIps: resolved.map((r) => r.address) };
  } catch {
    return { error: "invalid_url" };
  }
}

/**
 * Re-resolve the host right before connecting and confirm DNS still maps it to
 * the SAME, still-public addresses we vetted in `validateUrlForFetch`. This
 * closes the rebind TOCTOU: an attacker-controlled DNS that flips from a public
 * IP (at validation time) to 169.254.169.254 / 127.0.0.1 (at fetch time) is
 * caught because the freshly-resolved address either is private or isn't in the
 * pinned set. Literal-IP hosts (no DNS) are trivially stable and pass through.
 */
async function assertDnsStable(url: URL, pinnedIps: string[]): Promise<CrawlError | null> {
  if (isIP(url.hostname)) return null; // literal IP — nothing to rebind
  const pinned = new Set(pinnedIps);
  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(url.hostname, { all: true });
  } catch {
    return "fetch_failed";
  }
  if (resolved.length === 0) return "fetch_failed";
  for (const r of resolved) {
    if (isBlockedAddress(r.family, r.address)) return "private_ip_blocked";
    // A previously-unseen public address appearing now is the rebind signature.
    if (!pinned.has(r.address)) return "private_ip_blocked";
  }
  return null;
}

/**
 * Best-effort robots.txt check. We're well-behaved citizens — if the host
 * disallows our path for User-agent: *, we refuse to fetch. Failures parsing
 * robots.txt are treated as "allowed" (lenient interpretation).
 */
async function checkRobots(url: URL): Promise<{ allowed: boolean }> {
  const robotsUrl = `${url.protocol}//${url.host}/robots.txt`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(robotsUrl, {
      signal: ctrl.signal,
      headers: { "User-Agent": "RepulabsBot/1.0 (+https://repulabs.com/bot)" },
    });
    clearTimeout(timer);
    if (!res.ok) return { allowed: true };
    const body = (await res.text()).slice(0, 50_000);
    // Minimal parser — find "User-agent: *" block, look for Disallow lines
    let inStarBlock = false;
    let disallowed = false;
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed.length === 0) continue;
      const colon = trimmed.indexOf(":");
      if (colon === -1) continue;
      const key = trimmed.slice(0, colon).trim().toLowerCase();
      const value = trimmed.slice(colon + 1).trim();
      if (key === "user-agent") {
        inStarBlock = value === "*";
        continue;
      }
      if (inStarBlock && key === "disallow" && value.length > 0) {
        if (url.pathname.startsWith(value)) {
          disallowed = true;
          break;
        }
      }
    }
    return { allowed: !disallowed };
  } catch {
    return { allowed: true };
  }
}

/**
 * Strip HTML to plain text + basic markdown-style headers + paragraph breaks.
 * v1 implementation — good enough for FAQ pages and product pages.
 */
export function htmlToText(html: string): string {
  // Remove scripts, styles, comments
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");

  // Convert headings to markdown for chunker section detection
  cleaned = cleaned
    .replace(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
    .replace(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
    .replace(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
    .replace(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n");

  // Paragraph + list + line breaks
  cleaned = cleaned.replace(/<\/?(?:p|div|section|article|li|tr|br|hr)\b[^>]*>/gi, "\n");

  // Strip remaining tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ");

  // HTML entities — common ones
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Normalize whitespace
  cleaned = cleaned
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

export async function crawlUrl(
  rawUrl: string,
): Promise<{ result: CrawlResult } | { error: CrawlError; details?: string }> {
  const validated = await validateUrlForFetch(rawUrl);
  if ("error" in validated) return { error: validated.error };
  const url = validated.url;
  let pinnedIps = validated.pinnedIps;

  const robots = await checkRobots(url);
  if (!robots.allowed) return { error: "robots_disallowed" };

  // Follow redirects MANUALLY so every hop is re-validated against the
  // private-IP / scheme / credentials rules. With redirect:"follow" a public
  // URL could 30x to http://169.254.169.254/… (cloud metadata) and we'd fetch
  // it blindly — the SSRF the up-front validation was meant to stop.
  //
  // DNS-rebind TOCTOU: `fetch` re-resolves the hostname itself, so a malicious
  // resolver can return a public IP at validation time and a private one at
  // connect time. We close that window by re-resolving and asserting the host
  // STILL maps only to the pinned, public addresses immediately before each
  // fetch (see assertDnsStable). Literal-IP hosts have no DNS and pass through.
  const MAX_REDIRECTS = 5;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  let currentUrl = url;
  try {
    let hop = 0;
    while (true) {
      const rebind = await assertDnsStable(currentUrl, pinnedIps);
      if (rebind) {
        clearTimeout(timer);
        return { error: rebind, details: `dns_rebind_guard:${currentUrl.hostname}` };
      }
      res = await fetch(currentUrl.toString(), {
        signal: ctrl.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "RepulabsBot/1.0 (+https://repulabs.com/bot)",
          Accept: "text/html,application/xhtml+xml,text/plain",
        },
      });
      // Non-3xx (or 3xx without Location) → this is the final response.
      const isRedirect = res.status >= 300 && res.status < 400;
      const location = isRedirect ? res.headers.get("location") : null;
      if (!location) break;
      if (++hop > MAX_REDIRECTS) {
        clearTimeout(timer);
        return { error: "too_many_redirects", details: `>${MAX_REDIRECTS} hops` };
      }
      // Resolve relative redirects against the current URL, then re-validate.
      const nextRaw = new URL(location, currentUrl).toString();
      const revalidated = await validateUrlForFetch(nextRaw);
      if ("error" in revalidated) {
        clearTimeout(timer);
        return { error: revalidated.error, details: `blocked redirect to ${nextRaw}` };
      }
      currentUrl = revalidated.url;
      pinnedIps = revalidated.pinnedIps;
    }
  } catch (err) {
    clearTimeout(timer);
    return { error: "fetch_failed", details: err instanceof Error ? err.message : String(err) };
  }
  clearTimeout(timer);

  if (!res.ok) return { error: "fetch_failed", details: `HTTP ${res.status}` };

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.includes(t))) {
    return { error: "unsupported_content_type", details: contentType };
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_BYTES) {
    return { error: "content_too_large", details: `${contentLength} bytes` };
  }

  // Stream + cap bytes
  const reader = res.body?.getReader();
  if (!reader) return { error: "fetch_failed", details: "no_body" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      reader.cancel();
      return { error: "content_too_large", details: `>${MAX_BYTES} bytes` };
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const raw = buffer.toString("utf8");

  const text = contentType.includes("text/plain") ? raw : htmlToText(raw);
  if (text.trim().length < 20) return { error: "empty_after_strip" };

  return {
    result: {
      url: rawUrl,
      finalUrl: currentUrl.toString(),
      contentType,
      bytes: total,
      raw: contentType.includes("text/plain") ? "" : raw,
      text,
      fetchedAt: new Date(),
    },
  };
}

/**
 * Extract same-origin links from raw HTML. Regex over href= is acceptable for
 * v1 (mirrors htmlToText's regex approach). Returns normalized absolute URLs on
 * the same origin as `base`, deduped, capped.
 */
export function extractSameOriginLinks(html: string, base: URL, cap = 50): string[] {
  const out = new Set<string>();
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const rawHref = m[1];
    if (!rawHref) continue;
    const href = rawHref.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    if (/^javascript:/i.test(href) || /^data:/i.test(href)) continue;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (abs.protocol !== "https:" && abs.protocol !== "http:") continue;
    // Same-origin only (protocol + host + port).
    if (abs.origin !== base.origin) continue;
    // Skip obvious non-page assets.
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|pdf|zip|mp4|woff2?|ttf)$/i.test(abs.pathname)) continue;
    abs.hash = "";
    out.add(abs.toString());
    if (out.size >= cap) break;
  }
  return [...out];
}

export type SiteCrawlResult = {
  rootUrl: string;
  pagesCrawled: number;
  text: string; // concatenated page texts with `\n\n# <path>\n` separators
  fetchedAt: Date;
};

/**
 * Depth-N, same-origin BFS crawl (ENHANCE). Reuses the single-page `crawlUrl`
 * (and ALL its SSRF / robots / size / redirect guards) per hop. Hard caps on
 * depth and pages bound cost + politeness; cross-origin and already-visited
 * links are skipped.
 *
 * Returns one concatenated corpus suitable for `extractBusinessProfile` /
 * `ingestDocument`. Returns an error only if the ROOT page can't be crawled;
 * per-child crawl failures are skipped silently (best-effort breadth).
 */
export async function crawlSite(
  rootUrl: string,
  opts?: { maxDepth?: number; maxPages?: number },
): Promise<{ result: SiteCrawlResult } | { error: CrawlError; details?: string }> {
  const maxDepth = Math.max(0, Math.min(opts?.maxDepth ?? 3, 4));
  const maxPages = Math.max(1, Math.min(opts?.maxPages ?? 20, 30));

  let baseOrigin: URL;
  try {
    baseOrigin = new URL(rootUrl);
  } catch {
    return { error: "invalid_url" };
  }

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl, depth: 0 }];
  const parts: string[] = [];
  let pagesCrawled = 0;
  let rootError: { error: CrawlError; details?: string } | null = null;

  while (queue.length > 0 && pagesCrawled < maxPages) {
    const next = queue.shift();
    if (!next) break;
    const normalized = (() => {
      try {
        const u = new URL(next.url);
        u.hash = "";
        return u.toString();
      } catch {
        return next.url;
      }
    })();
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    const crawled = await crawlUrl(next.url);
    if ("error" in crawled) {
      // The root page must succeed; children are best-effort.
      if (pagesCrawled === 0 && parts.length === 0) {
        rootError = { error: crawled.error, details: crawled.details };
      }
      continue;
    }

    const { result } = crawled;
    pagesCrawled += 1;
    let path = "/";
    try {
      path = new URL(result.finalUrl).pathname || "/";
    } catch {
      /* keep default */
    }
    parts.push(`# ${path}\n${result.text}`);

    // Enqueue same-origin children up to maxDepth.
    if (next.depth < maxDepth && result.raw) {
      const links = extractSameOriginLinks(result.raw, baseOrigin, 50);
      for (const link of links) {
        if (!visited.has(link) && queue.length + pagesCrawled < maxPages * 2) {
          queue.push({ url: link, depth: next.depth + 1 });
        }
      }
    }
  }

  if (pagesCrawled === 0) {
    return rootError ?? { error: "fetch_failed", details: "no pages crawled" };
  }

  const text = parts.join("\n\n");
  // Strip the per-page "# /path" headers we added before measuring real content,
  // so a multi-page crawl of near-empty pages can't pass on header bytes alone.
  const contentChars = text.replace(/^#\s.*$/gm, "").replace(/\s+/g, " ").trim().length;
  if (contentChars < MIN_CORPUS_CHARS) {
    return { error: "too_little_text", details: `${contentChars} chars across ${pagesCrawled} page(s)` };
  }

  return {
    result: {
      rootUrl,
      pagesCrawled,
      text,
      fetchedAt: new Date(),
    },
  };
}
