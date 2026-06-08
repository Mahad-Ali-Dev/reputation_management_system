import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractSameOriginLinks } from "@/lib/ai/crawl";

describe("extractSameOriginLinks", () => {
  const base = new URL("https://shop.example.com/");

  it("keeps same-origin links, drops cross-origin + assets + anchors", () => {
    const html = `
      <a href="/about">About</a>
      <a href="https://shop.example.com/pricing">Pricing</a>
      <a href="https://other.com/x">Other</a>
      <a href="#section">Anchor</a>
      <a href="mailto:hi@x.com">Mail</a>
      <a href="/logo.png">Logo</a>
      <a href="/menu.pdf">Menu</a>
    `;
    const links = extractSameOriginLinks(html, base);
    expect(links).toContain("https://shop.example.com/about");
    expect(links).toContain("https://shop.example.com/pricing");
    expect(links.some((l) => l.includes("other.com"))).toBe(false);
    expect(links.some((l) => l.includes("#section"))).toBe(false);
    expect(links.some((l) => l.includes("mailto"))).toBe(false);
    expect(links.some((l) => l.endsWith(".png"))).toBe(false);
    expect(links.some((l) => l.endsWith(".pdf"))).toBe(false);
  });

  it("dedups and caps", () => {
    const html = Array.from({ length: 100 }, (_, i) => `<a href="/p${i % 3}">x</a>`).join("");
    const links = extractSameOriginLinks(html, base, 10);
    expect(links.length).toBeLessThanOrEqual(10);
    // /p0 /p1 /p2 deduped to 3 unique
    expect(new Set(links).size).toBe(links.length);
  });
});

describe("crawlSite (mocked fetch + DNS)", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    // Resolve every hostname to a public IP so SSRF validation passes without DNS.
    vi.doMock("node:dns/promises", () => ({
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    }));
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.doUnmock("node:dns/promises");
    vi.resetModules();
  });

  function htmlPage(title: string, links: string[]): string {
    const anchors = links.map((l) => `<a href="${l}">link</a>`).join("");
    return `<html><body><h1>${title}</h1><p>${"content ".repeat(10)}</p>${anchors}</body></html>`;
  }

  it("follows same-origin links to maxDepth and concatenates with path separators", async () => {
    const pages: Record<string, string> = {
      "https://example.com/": htmlPage("Home", ["/about", "/pricing", "https://other.com/skip"]),
      "https://example.com/about": htmlPage("About Us", []),
      "https://example.com/pricing": htmlPage("Pricing", []),
    };

    globalThis.fetch = (async (input: unknown) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.endsWith("/robots.txt")) {
        return new Response("", { status: 404 });
      }
      const body = pages[url] ?? pages[url.replace(/\/$/, "")] ?? null;
      if (body == null) return new Response("not found", { status: 404 });
      const stream = new Response(body).body;
      return new Response(stream, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const { crawlSite } = await import("@/lib/ai/crawl");
    const result = await crawlSite("https://example.com/", { maxDepth: 2, maxPages: 10 });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);

    expect(result.result.pagesCrawled).toBeGreaterThanOrEqual(2);
    expect(result.result.text).toContain("# /");
    expect(result.result.text).toContain("# /about");
    // cross-origin link was never crawled
    expect(result.result.text).not.toContain("other.com");
  });

  it("respects maxPages", async () => {
    const links = Array.from({ length: 10 }, (_, i) => `/p${i}`);
    const home = htmlPage("Home", links);
    globalThis.fetch = (async (input: unknown) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      const stream = new Response(home).body;
      return new Response(stream, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const { crawlSite } = await import("@/lib/ai/crawl");
    const result = await crawlSite("https://example.com/", { maxDepth: 3, maxPages: 3 });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.result.pagesCrawled).toBeLessThanOrEqual(3);
  });

  it("returns an error when the root page can't be fetched", async () => {
    globalThis.fetch = (async (input: unknown) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
      return new Response("nope", { status: 500 });
    }) as typeof fetch;

    const { crawlSite } = await import("@/lib/ai/crawl");
    const result = await crawlSite("https://example.com/", { maxDepth: 1, maxPages: 5 });
    expect("error" in result).toBe(true);
  });
});
