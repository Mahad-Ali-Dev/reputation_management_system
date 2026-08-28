export const dynamic = "force-static";

export const metadata = {
  title: "Privacy Policy · Repulabs",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Effective: 2026-05-12 · Last updated: 2026-05-12</p>

      <p>
        Repulabs ("we") operates the reputation-management platform at{" "}
        <strong>repulabs.com</strong>. This policy explains what data we collect, why,
        and how you control it. By using the service you agree to this policy.
      </p>

      <h2>1. Data we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> your email, name, organization name, and Stripe
          customer ID. Magic-link tokens are hashed before storage and expire in 15 minutes.
        </li>
        <li>
          <strong>Business data</strong> establishment details, brand voice, hours, and
          the content of any documents you upload to the AI knowledge base.
        </li>
        <li>
          <strong>Connection tokens</strong> Google Business Profile OAuth tokens are
          stored encrypted at rest using AES-256-GCM with per-row IVs and per-org encryption context.
          We never log raw tokens.
        </li>
        <li>
          <strong>Review data</strong> reviews, ratings, and reviewer names we sync from
          connected providers (Google Business Profile). We retain the original{" "}
          <code>raw</code> JSON for audit purposes.
        </li>
        <li>
          <strong>Outreach data</strong> recipient phone numbers and emails you provide,
          along with SMS consent records (text hash, IP, timestamp).
        </li>
        <li>
          <strong>Operational logs</strong> request paths, IP addresses (truncated after
          30 days), user-agent strings, and audit-log entries for security-sensitive actions.
          Pino redaction strips authorization headers and tokens.
        </li>
        <li>
          <strong>Chatbot conversations</strong> visitor messages, AI responses, and
          retrieved chunk IDs. Visitors are identified by a non-PII visitor token issued in a
          JWT not by name or email unless they volunteer it during a handoff.
        </li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To run the service you signed up for (reviews, replies, surveys, chatbot).</li>
        <li>To improve AI-generated replies we never train external models on your data without your written consent.</li>
        <li>To prevent abuse, fraud, and policy violations.</li>
        <li>To comply with legal obligations (subpoenas, court orders).</li>
      </ul>

      <h2>3. Sharing</h2>
      <p>
        We share data only with the sub-processors listed at{" "}
        <a href="/legal/subprocessors">/legal/subprocessors</a> and only as needed to operate
        the service. We do not sell your data.
      </p>

      <h2>4. Retention</h2>
      <ul>
        <li>Account and business data: until you delete your organization, then 30 days.</li>
        <li>Audit logs: 7 years (immutable, append-only by trigger).</li>
        <li>Outbound message logs: 2 years.</li>
        <li>Chatbot conversations: 90 days, then anonymized.</li>
      </ul>

      <h2>5. Your rights</h2>
      <p>
        You can export, correct, or delete your data at any time. Email{" "}
        <a href="mailto:info@repulabs.com">info@repulabs.com</a>. Under GDPR and CCPA you
        have the right to access, rectify, delete, restrict processing, and port your data.
        We respond within 30 days.
      </p>

      <h2>6. Security</h2>
      <p>
        Multi-tenant data isolation is enforced by Postgres row-level security on every tenant
        table. OAuth tokens are envelope-encrypted. Webhook signatures are verified on every
        request. See <a href="/.well-known/security.txt">security.txt</a> for vulnerability
        disclosure.
      </p>

      <h2>7. Contact</h2>
      <p>
        Data Protection Officer and general inquiries:{" "}
        <a href="mailto:info@repulabs.com">info@repulabs.com</a>.
      </p>
    </>
  );
}
