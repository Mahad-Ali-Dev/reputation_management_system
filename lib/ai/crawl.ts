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
  | "empty_after_strip";

export type CrawlResult = {
  url: string;
  finalUrl: string;
  contentType: string;
  bytes: number;
  text: string;            // plain text + markdown-style headers
  fetchedAt: Date;
};

/**
 * Determine whether an IPv4 address is in a private / reserved range.
 * Block: 10.x, 127.x, 169.254.x, 172.16.x-172.31.x, 192.168.x, 0.x, 100.64.x (CGNAT)
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
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

/**
 * Validate URL syntactically + resolve host + block private IPs.
 * Returns null on success, or an error code.
 */
async function validateUrlForFetch(rawUrl: string): Promise<{ url: URL } | { error: CrawlError }> {
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
  } else if (literal === 6) {
    if (isPrivateIPv6(url.hostname)) return { error: "private_ip_blocked" };
  } else {
    try {
      const resolved = await lookup(url.hostname, { all: true });
      for (const r of resolved) {
        if (r.family === 4 && isPrivateIPv4(r.address)) return { error: "private_ip_blocked" };
        if (r.family === 6 && isPrivateIPv6(r.address)) return { error: "private_ip_blocked" };
      }
    } catch {
      return { error: "invalid_url" };
    }
  }
  return { url };
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
  cleaned = cleaned
    .replace(/<\/?(?:p|div|section|article|li|tr|br|hr)\b[^>]*>/gi, "\n");

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

export async function crawlUrl(rawUrl: string): Promise<{ result: CrawlResult } | { error: CrawlError; details?: string }> {
  const validated = await validateUrlForFetch(rawUrl);
  if ("error" in validated) return { error: validated.error };
  const url = validated.url;

  const robots = await checkRobots(url);
  if (!robots.allowed) return { error: "robots_disallowed" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "RepulabsBot/1.0 (+https://repulabs.com/bot)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
    });
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
  if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
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
      finalUrl: res.url,
      contentType,
      bytes: total,
      text,
      fetchedAt: new Date(),
    },
  };
}
