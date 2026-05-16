import { describe, it, expect } from "vitest";
import { htmlToText, crawlUrl } from "@/lib/ai/crawl";

describe("htmlToText", () => {
  it("strips script + style tags", () => {
    const html = `<html><head><style>body{color:red}</style></head><body><script>alert('x')</script><p>Hello world</p></body></html>`;
    const text = htmlToText(html);
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
    expect(text).toContain("Hello world");
  });

  it("converts headings to markdown", () => {
    const html = `<h1>Title</h1><h2>Subtitle</h2><p>Body</p>`;
    const text = htmlToText(html);
    expect(text).toMatch(/^#\s+Title/m);
    expect(text).toMatch(/^##\s+Subtitle/m);
  });

  it("decodes common HTML entities", () => {
    const html = `<p>Tom &amp; Jerry &quot;classic&quot;</p>`;
    expect(htmlToText(html)).toContain(`Tom & Jerry "classic"`);
  });

  it("removes HTML comments", () => {
    const html = `<p>visible</p><!-- secret tracking pixel -->`;
    const text = htmlToText(html);
    expect(text).toContain("visible");
    expect(text).not.toContain("secret");
  });

  it("normalizes whitespace", () => {
    const html = `<p>line one</p>\n\n\n\n\n<p>line two</p>`;
    const text = htmlToText(html);
    expect(text).not.toMatch(/\n{3,}/);
  });
});

describe("crawlUrl SSRF defenses", () => {
  it("rejects non-http(s) schemes", async () => {
    const result = await crawlUrl("file:///etc/passwd");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("non_https");
  });

  it("rejects javascript: URLs", async () => {
    const result = await crawlUrl("javascript:alert(1)");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("non_https");
  });

  it("rejects URLs with credentials", async () => {
    const result = await crawlUrl("https://user:pass@example.com");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("credentials_in_url");
  });

  it("rejects loopback IP", async () => {
    const result = await crawlUrl("http://127.0.0.1/admin");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("private_ip_blocked");
  });

  it("rejects RFC1918 10.x", async () => {
    const result = await crawlUrl("http://10.0.0.1/secret");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("private_ip_blocked");
  });

  it("rejects RFC1918 192.168.x", async () => {
    const result = await crawlUrl("http://192.168.1.1/router");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("private_ip_blocked");
  });

  it("rejects RFC1918 172.16-31.x", async () => {
    const result = await crawlUrl("http://172.20.0.1/internal");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("private_ip_blocked");
  });

  it("rejects link-local 169.254.x", async () => {
    const result = await crawlUrl("http://169.254.169.254/latest/meta-data/");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("private_ip_blocked");
  });

  it("rejects IPv6 loopback ::1", async () => {
    const result = await crawlUrl("http://[::1]/admin");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("private_ip_blocked");
  });

  it("rejects invalid URLs", async () => {
    const result = await crawlUrl("not a url");
    if (!("error" in result)) throw new Error("expected error");
    expect(result.error).toBe("invalid_url");
  });
});
