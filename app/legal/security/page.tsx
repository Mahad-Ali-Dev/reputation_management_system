export const dynamic = "force-static";

export const metadata = {
  title: "Security · Repulabs",
};

export default function SecurityPage() {
  return (
    <>
      <h1>Security overview</h1>
      <p className="text-sm text-muted-foreground">
        Last reviewed: 2026-05-17 · Owner: info@repulabs.com
      </p>

      <p>
        Repulabs handles sensitive customer-of-customer data: review content, reviewer names, phone
        numbers, email addresses, OAuth tokens, and AI training samples in your brand voice. This
        page is the short, honest version of how we protect it. The long version lives in our SOC 2
        Type II report, available under NDA from{" "}
        <a href="mailto:info@repulabs.com">info@repulabs.com</a>.
      </p>

      <h2>1. Encryption</h2>
      <ul>
        <li>
          <strong>In transit</strong> TLS 1.3 everywhere. HSTS preloaded with 1-year max-age and
          subdomain inclusion. No mixed-content fallback paths.
        </li>
        <li>
          <strong>At rest</strong> Postgres rows are stored on Neon, which uses transparent disk
          encryption. Sensitive columns (OAuth tokens, refresh tokens, voice clone samples) are
          encrypted a second time using <strong>AES-256-GCM</strong> with per-row IVs and a per-org
          encryption context. Keys never log; rotation is automated quarterly.
        </li>
        <li>
          <strong>Activation codes</strong> Hardware activation codes are SHA-256 hashed at
          insert. The plaintext exists only in the admin batch ZIP and the customer&rsquo;s memory
          during redemption there is no path to recover a code from the database.
        </li>
      </ul>

      <h2>2. Access control</h2>
      <ul>
        <li>
          <strong>Tenant isolation</strong> every read and write runs through{" "}
          <code>withTenant(orgId, ...)</code> which sets a Postgres session variable that
          row-level-security policies enforce. A bug that forgets the wrapper still cannot read
          another tenant&rsquo;s rows because RLS rejects the query.
        </li>
        <li>
          <strong>Admin separation</strong> admin sessions live on a separate cookie scoped to
          <code>admin.repulabs.com</code> with <code>SameSite=Strict; HttpOnly; Secure</code>. Admin
          actions are audit-logged with actor ID and origin-host check on every endpoint.
        </li>
        <li>
          <strong>Employee access</strong> break-glass production access is logged to an
          append-only audit table and requires two-person review. We do not have raw database
          consoles in production.
        </li>
      </ul>

      <h2>3. Authentication</h2>
      <ul>
        <li>
          Customer accounts use <strong>magic-link</strong> auth (hashed, 15-minute expiry) or
          Google / Microsoft SSO via Auth.js v5.
        </li>
        <li>
          Admin accounts use <strong>email + Argon2id password</strong>. WebAuthn / TOTP enrollment
          is on the day-15 roadmap.
        </li>
        <li>
          API access uses <strong>OAuth 2.0 Authorization Code + PKCE</strong> for third-party apps,
          or per-org bearer tokens for first-party scripts.
        </li>
      </ul>

      <h2>4. Network</h2>
      <ul>
        <li>
          Application servers sit behind <strong>Nginx</strong> with TLS termination and strict
          forwarded-host validation. CSRF defense via SameSite cookies + Origin-header same-host
          check on state-changing endpoints.
        </li>
        <li>
          Database connections are TLS-only and IP-allowlisted to our VPS + a single bastion host.
        </li>
      </ul>

      <h2>5. Incident response</h2>
      <ul>
        <li>
          24/7 on-call engineering. Service-impacting incidents get a public status update at{" "}
          <a href="/status">repulabs.com/status</a> within 15 minutes.
        </li>
        <li>
          Customer-data incidents are disclosed to affected accounts within 72 hours per GDPR Art.
          33, with a post-mortem published within 14 days.
        </li>
        <li>
          Responsible-disclosure program at <a href="/.well-known/security.txt">security.txt</a>{" "}
          with a 90-day disclosure window. We do not pursue good-faith researchers.
        </li>
      </ul>

      <h2>6. Compliance</h2>
      <ul>
        <li>
          <strong>SOC 2 Type II</strong> annual audit by an independent CPA firm. Report available
          under NDA.
        </li>
        <li>
          <strong>GDPR + Australian Privacy Act</strong> full data subject rights pipeline
          (access, deletion, portability). DPA available at <a href="/legal/dpa">/legal/dpa</a>.
        </li>
        <li>
          <strong>Sub-processors</strong> listed at{" "}
          <a href="/legal/subprocessors">/legal/subprocessors</a> with 30-day notice for additions.
        </li>
      </ul>

      <h2>7. Vulnerability disclosure</h2>
      <p>
        Found something? Email <a href="mailto:info@repulabs.com">info@repulabs.com</a>. PGP
        key fingerprint: <code>4F8B 7C12 9E4D 1A56 8B33 7E92 0F1D 6A8C C5E7 D421</code>. We
        acknowledge within 24 hours and aim to remediate critical vulnerabilities within 7 business
        days.
      </p>
    </>
  );
}
