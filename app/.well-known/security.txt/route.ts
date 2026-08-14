import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const runtime = "nodejs";

/**
 * RFC 9116 — security.txt
 *
 * Lets researchers know how to report vulnerabilities responsibly.
 * Update the contact + expiry yearly; the spec requires Expires to be in the future.
 *
 * Hosted at: /.well-known/security.txt
 */
export function GET() {
  // Expires roughly 1 year from now. Keep this updated.
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    "Contact: mailto:info@repulabs.com",
    `Expires: ${expires}`,
    "Preferred-Languages: en",
    "Canonical: https://repulabs.com/.well-known/security.txt",
    "Policy: https://repulabs.com/legal/security-policy",
    "",
    "# We appreciate responsible disclosure. Please give us 90 days before public disclosure.",
    "# Out of scope: denial-of-service, social engineering, physical attacks, third-party services.",
    "",
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}
