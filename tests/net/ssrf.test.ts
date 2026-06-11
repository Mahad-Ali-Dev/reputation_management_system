import { describe, expect, it } from "vitest";
import { isPrivateIPv4, isPrivateIPv6, validatePublicUrl, validatePublicUrlSync } from "@/lib/net/ssrf";

/**
 * Guards the SSRF protection used by outbound webhooks (lib/notifications/webhook.ts).
 * Only the deterministic, DNS-free paths are exercised here — literal IPs and the
 * synchronous check — so the suite needs no network.
 */

describe("validatePublicUrlSync", () => {
  it("rejects non-http(s) schemes", () => {
    expect(validatePublicUrlSync("file:///etc/passwd")).toBe("non_http_scheme");
    expect(validatePublicUrlSync("gopher://x/")).toBe("non_http_scheme");
    expect(validatePublicUrlSync("ftp://example.com")).toBe("non_http_scheme");
  });

  it("rejects embedded credentials", () => {
    expect(validatePublicUrlSync("https://user:pass@example.com/hook")).toBe("credentials_in_url");
  });

  it("rejects localhost and literal private/loopback/metadata IPs", () => {
    expect(validatePublicUrlSync("http://localhost/hook")).toBe("private_ip_blocked");
    expect(validatePublicUrlSync("http://api.localhost/hook")).toBe("private_ip_blocked");
    expect(validatePublicUrlSync("http://127.0.0.1/hook")).toBe("private_ip_blocked");
    expect(validatePublicUrlSync("http://10.0.0.5/hook")).toBe("private_ip_blocked");
    expect(validatePublicUrlSync("http://192.168.1.10/hook")).toBe("private_ip_blocked");
    expect(validatePublicUrlSync("http://169.254.169.254/latest/meta-data")).toBe("private_ip_blocked");
    expect(validatePublicUrlSync("http://[::1]/hook")).toBe("private_ip_blocked");
  });

  it("accepts a normal public https URL", () => {
    expect(validatePublicUrlSync("https://hooks.example.com/inbound")).toBeNull();
    expect(validatePublicUrlSync("https://1.1.1.1/hook")).toBeNull(); // public literal
  });

  it("rejects malformed input", () => {
    expect(validatePublicUrlSync("not a url")).toBe("invalid_url");
  });
});

describe("validatePublicUrl (literal IPs — no DNS)", () => {
  it("blocks cloud-metadata and loopback literals", async () => {
    expect(await validatePublicUrl("http://169.254.169.254/")).toEqual({ error: "private_ip_blocked" });
    expect(await validatePublicUrl("http://127.0.0.1:9000/x")).toEqual({ error: "private_ip_blocked" });
  });

  it("pins a public literal IP without resolving DNS", async () => {
    const r = await validatePublicUrl("https://1.1.1.1/hook");
    expect("error" in r).toBe(false);
    if (!("error" in r)) expect(r.pinnedIps).toEqual(["1.1.1.1"]);
  });
});

describe("IP range helpers", () => {
  it("classifies IPv4 ranges", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "169.254.0.1", "172.16.0.1", "192.168.0.1", "100.64.0.1", "0.0.0.0"]) {
      expect(isPrivateIPv4(ip)).toBe(true);
    }
    for (const ip of ["1.1.1.1", "8.8.8.8", "172.15.0.1", "172.32.0.1"]) {
      expect(isPrivateIPv4(ip)).toBe(false);
    }
  });

  it("classifies IPv6 ranges", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("fe80::1")).toBe(true);
    expect(isPrivateIPv6("fd00::1")).toBe(true);
    expect(isPrivateIPv6("2606:4700:4700::1111")).toBe(false);
  });
});
