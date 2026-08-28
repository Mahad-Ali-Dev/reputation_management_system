export const dynamic = "force-static";

export const metadata = {
  title: "Data Processing Addendum · Repulabs",
};

export default function DPAPage() {
  return (
    <>
      <h1>Data Processing Addendum</h1>
      <p className="text-sm text-muted-foreground">
        Effective: 2026-05-17 · Last updated: 2026-05-17
      </p>

      <p>
        This Data Processing Addendum (&ldquo;DPA&rdquo;) supplements the Repulabs Terms of Service
        (the &ldquo;Agreement&rdquo;) between Repulabs Pty Ltd (&ldquo;Repulabs&rdquo;,
        &ldquo;Processor&rdquo;) and the customer entity that has accepted the Agreement
        (&ldquo;Customer&rdquo;, &ldquo;Controller&rdquo;). Where the Customer is established in the
        EEA, UK, or Switzerland, this DPA forms part of the Agreement and governs Repulabs&rsquo;
        processing of personal data on the Customer&rsquo;s behalf.
      </p>

      <h2>1. Subject matter and duration</h2>
      <p>
        Repulabs processes personal data submitted by the Customer to provide the reputation
        management services described in the Agreement. Processing continues for the term of the
        Agreement and any applicable post-termination retention period.
      </p>

      <h2>2. Nature, purpose, and categories of data</h2>
      <ul>
        <li>
          <strong>Categories of data subjects</strong> the Customer&rsquo;s reviewers, recipients
          of review requests, callers to the AI receptionist, survey respondents, and authorized
          users of the Customer&rsquo;s workspace.
        </li>
        <li>
          <strong>Categories of personal data</strong> names, email addresses, phone numbers, IP
          addresses, review content, voice recordings (for AI phone calls), and free-text
          submissions in survey or feedback forms.
        </li>
        <li>
          <strong>Special categories</strong> none processed unless voluntarily submitted by a
          data subject in free-text fields. Repulabs does not request special-category data.
        </li>
        <li>
          <strong>Purpose</strong> providing the reputation management platform, including review
          syndication, outreach delivery, AI reply drafting, AI phone reception, and analytics.
        </li>
      </ul>

      <h2>3. Sub-processors</h2>
      <p>
        Repulabs engages sub-processors listed at{" "}
        <a href="/legal/subprocessors">/legal/subprocessors</a>. New sub-processors are notified by
        email at least 30 days in advance. The Customer may object in writing to{" "}
        <a href="mailto:info@repulabs.com">info@repulabs.com</a>; if Repulabs cannot accommodate the
        objection, the Customer may terminate the Agreement for the affected service.
      </p>

      <h2>4. International transfers</h2>
      <p>
        Repulabs stores primary production data in Neon&rsquo;s EU-Central-1 region. Where data is
        transferred outside the EEA, UK, or Switzerland, transfers are governed by the European
        Commission&rsquo;s Standard Contractual Clauses (Module 2: controller-to- processor) which
        are incorporated by reference into this DPA, supplemented by the UK Addendum where
        applicable.
      </p>

      <h2>5. Security measures</h2>
      <p>
        Repulabs maintains technical and organizational measures detailed at{" "}
        <a href="/legal/security">/legal/security</a>, including but not limited to:
      </p>
      <ul>
        <li>TLS 1.3 in transit; AES-256-GCM at rest for sensitive columns.</li>
        <li>Row-level-security tenant isolation enforced at the database layer.</li>
        <li>SOC 2 Type II compliance with annual independent audit.</li>
        <li>Access logging, MFA on admin accounts, principle of least privilege.</li>
        <li>72-hour breach notification per GDPR Article 33.</li>
      </ul>

      <h2>6. Data subject rights</h2>
      <p>
        Repulabs will assist the Customer in fulfilling data-subject requests (access, rectif-
        ication, erasure, restriction, portability, objection). Requests should be initiated from
        the Customer&rsquo;s workspace; tooling auto-pulls all data for the named subject across
        reviews, requests, recordings, and audit rows within 72 hours.
      </p>

      <h2>7. Audits</h2>
      <p>
        The Customer may audit Repulabs&rsquo; compliance with this DPA once per twelve-month period
        at the Customer&rsquo;s expense. In lieu of an on-site audit, Repulabs will provide its most
        recent SOC 2 Type II report under NDA.
      </p>

      <h2>8. Return and deletion</h2>
      <p>
        On termination of the Agreement, the Customer may export all personal data via the
        platform&rsquo;s export tooling for 30 days. After 30 days, Repulabs will delete all
        personal data within 60 days, except where retention is required by applicable law (e.g.,
        tax records for invoiced amounts).
      </p>

      <h2>9. Signing this DPA</h2>
      <p>
        This DPA is countersigned automatically by acceptance of the Agreement. A countersigned PDF
        is available on request at <a href="mailto:info@repulabs.com">info@repulabs.com</a>.
      </p>
    </>
  );
}
