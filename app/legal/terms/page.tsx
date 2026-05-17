export const dynamic = "force-static";

export const metadata = {
  title: "Terms of Service · Repulabs",
};

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Effective: 2026-05-12 · Last updated: 2026-05-12</p>

      <p>
        These Terms govern your use of the Repulabs platform ("Service") at{" "}
        <strong>repulabs.com</strong>. By signing up you agree to these Terms.
      </p>

      <h2>1. Account</h2>
      <p>
        You must be 18+ and authorized to bind the business you sign up for. You're
        responsible for keeping your credentials safe and for everything done through your account.
      </p>

      <h2>2. Acceptable use</h2>
      <ul>
        <li>Don't use the Service to send unsolicited messages or violate TCPA, CAN-SPAM, GDPR, or similar laws.</li>
        <li>Don't post or generate content that's defamatory, deceptive, infringing, or illegal.</li>
        <li>Don't try to circumvent rate limits, RLS, or any security measure.</li>
        <li>Don't reverse-engineer the AI prompts or extract our system prompts.</li>
        <li>Don't impersonate another business or reviewer.</li>
      </ul>

      <h2>3. AI-generated content</h2>
      <p>
        The Service uses third-party language models to draft replies, classify safety, and
        power the chatbot. You are the author of the replies you publish — review and approve
        each one before it goes live. We don't guarantee any AI-generated content is accurate,
        non-infringing, or appropriate. You bear final responsibility for what you publish.
      </p>

      <h2>4. Billing</h2>
      <p>
        Subscriptions and hardware are billed via Stripe. Subscription fees recur monthly or
        annually; you can cancel any time and your access continues through the end of the
        current period. Hardware is non-refundable once shipped. Disputes within 60 days of
        the charge.
      </p>

      <h2>5. Hardware</h2>
      <p>
        Review Stands are licensed to you for use during your subscription. Each device has a
        unique signed slug; activation is one-time and bound to your organization. Tampering
        with the signed redirect breaks the warranty.
      </p>

      <h2>6. Service availability</h2>
      <p>
        We target 99.5% monthly uptime. Downtime, scheduled maintenance, and force-majeure
        events are excluded from credits. Status: <a href="/status">/status</a>.
      </p>

      <h2>7. Termination</h2>
      <p>
        You can delete your organization at any time from the dashboard. We can suspend or
        terminate your account for breach of these Terms with notice (or immediately for
        material breach: spam, abuse, fraud).
      </p>

      <h2>8. Liability</h2>
      <p>
        TO THE FULLEST EXTENT PERMITTED BY LAW, OUR AGGREGATE LIABILITY IS LIMITED TO THE
        FEES YOU PAID US IN THE PRIOR 12 MONTHS. WE DISCLAIM INDIRECT, INCIDENTAL, AND
        CONSEQUENTIAL DAMAGES.
      </p>

      <h2>9. Governing law</h2>
      <p>Delaware, USA. Disputes go to the state and federal courts of Delaware.</p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms; we'll email you 30 days before material changes. Continued
        use after the effective date constitutes acceptance.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:legal@repulabs.com">legal@repulabs.com</a>
      </p>
    </>
  );
}
