/**
 * SSRF guard for server-side `fetch` to URLs that originate from tenant input
 * (outbound webhooks, future integrations, etc.).
 *
 * This is the same private-range / DNS-rebind protection proven in
 * `lib/ai/crawl.ts` (the KB crawler), lifted into a shared module so every
 * server-issued request to a customer-supplied URL is vetted identically.
 * crawl.ts keeps its own internal copy for now (it has a dedicated test suite);
 * if you change the IP rules here, mirror them there.
 *
 * Threat model: a workspace admin can set an arbitrary webhook URL. Without this
 * guard they could point it at `http://169.254.169.254/…` (cloud metadata),
 * `http://127.0.0.1:port/…`, or an internal host and turn our server into a
 * blind SSRF proxy — including via a hostname that resolves to a public IP at
 * validation time and a private one at connect time (DNS rebinding).
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type SsrfError =
  | "invalid_url"
  | "non_http_scheme"
  | "credentials_in_url"
  | "private_ip_blocked";

/**
 * IPv4 in a private / reserved range.
 * Block: 10.x, 127.x, 169.254.x, 172.16–31.x, 192.168.x, 0.x, 100.64–127.x (CGNAT).
 */
export function isPrivateIPv4(ip: string): boolean {
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

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.slice(7)); // v4-mapped
  return false;
}

/** True if a resolved address (either family) lands in a blocked range. */
export function isBlockedAddress(family: number, address: string): boolean {
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true; // unknown family → fail closed
}

/**
 * Fast, synchronous, no-DNS sanity check. Use at WRITE time (e.g. when a user
 * saves a webhook URL) to reject the obvious cases immediately and give clear
 * feedback. It cannot catch a public-looking hostname that resolves to a private
 * IP — `validatePublicUrl` (DNS-resolving) is the load-bearing guard at fetch time.
 */
export function validatePublicUrlSync(rawUrl: string): SsrfError | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "invalid_url";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "non_http_scheme";
  if (url.username || url.password) return "credentials_in_url";
  const host = normalizeHost(url.hostname);
  if (host === "localhost" || host.endsWith(".localhost")) return "private_ip_blocked";
  const literal = isIP(host);
  if (literal === 4 && isPrivateIPv4(host)) return "private_ip_blocked";
  if (literal === 6 && isPrivateIPv6(host)) return "private_ip_blocked";
  return null;
}

/** Lower-case + strip the surrounding brackets the URL parser keeps on IPv6 literals. */
function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
}

/**
 * Validate URL syntactically, resolve the host, and block private IPs.
 *
 * Returns the parsed URL plus the *pinned* set of resolved IPs — pass those to
 * `assertDnsStable` immediately before connecting to detect DNS rebinding.
 */
export async function validatePublicUrl(
  rawUrl: string,
): Promise<{ url: URL; pinnedIps: string[] } | { error: SsrfError }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "non_http_scheme" };
  if (url.username || url.password) return { error: "credentials_in_url" };

  const host = normalizeHost(url.hostname);
  if (host === "localhost" || host.endsWith(".localhost")) return { error: "private_ip_blocked" };

  const literal = isIP(host);
  if (literal === 4) {
    if (isPrivateIPv4(host)) return { error: "private_ip_blocked" };
    return { url, pinnedIps: [host] };
  }
  if (literal === 6) {
    if (isPrivateIPv6(host)) return { error: "private_ip_blocked" };
    return { url, pinnedIps: [host] };
  }
  try {
    const resolved = await lookup(host, { all: true });
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
 * the SAME, still-public addresses vetted in `validatePublicUrl`. Closes the
 * rebind TOCTOU (`fetch` re-resolves DNS itself between the check and the socket
 * connect). Literal-IP hosts have no DNS and pass through.
 */
export async function assertDnsStable(url: URL, pinnedIps: string[]): Promise<SsrfError | null> {
  const host = normalizeHost(url.hostname);
  if (isIP(host)) return null; // literal IP (incl. bracketed IPv6) — no DNS to rebind
  const pinned = new Set(pinnedIps);
  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    return "invalid_url";
  }
  if (resolved.length === 0) return "invalid_url";
  for (const r of resolved) {
    if (isBlockedAddress(r.family, r.address)) return "private_ip_blocked";
    if (!pinned.has(r.address)) return "private_ip_blocked"; // rebind signature
  }
  return null;
}
