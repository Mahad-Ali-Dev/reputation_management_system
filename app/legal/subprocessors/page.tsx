export const dynamic = "force-static";

export const metadata = {
  title: "Sub-processors · Repulabs",
};

const SUBPROCESSORS = [
  {
    name: "Vercel",
    purpose: "Application hosting (Next.js)",
    location: "USA (multi-region)",
    dataTypes: "All",
    dpa: "https://vercel.com/legal/dpa",
  },
  {
    name: "Neon",
    purpose: "Managed Postgres + pgvector",
    location: "USA (us-east-2)",
    dataTypes: "All",
    dpa: "https://neon.tech/dpa",
  },
  {
    name: "Stripe",
    purpose: "Payment processing, subscriptions, billing portal",
    location: "USA, Ireland",
    dataTypes: "Billing email, last-4 card digits, transaction history",
    dpa: "https://stripe.com/legal/dpa",
  },
  {
    name: "Anthropic",
    purpose: "Large language model (Claude) for review-reply drafting, safety classification, chatbot",
    location: "USA",
    dataTypes: "Review content, knowledge-base docs, chatbot turns opt-out of training enabled",
    dpa: "https://www.anthropic.com/legal/dpa",
  },
  {
    name: "Voyage AI",
    purpose: "Text embeddings for chatbot RAG retrieval",
    location: "USA",
    dataTypes: "Knowledge-base document chunks + chatbot queries",
    dpa: "https://voyageai.com/dpa",
  },
  {
    name: "Resend",
    purpose: "Transactional email (magic links, review requests, survey invites)",
    location: "USA, EU",
    dataTypes: "Recipient email, message body, delivery events",
    dpa: "https://resend.com/legal/dpa",
  },
  {
    name: "Twilio",
    purpose: "SMS delivery for review requests + outreach",
    location: "USA, EU",
    dataTypes: "Recipient phone, message body, delivery events, consent records",
    dpa: "https://www.twilio.com/legal/dpa",
  },
  {
    name: "Cloudflare",
    purpose: "DNS, DDoS protection, edge caching for QR redirects",
    location: "Global (200+ edge POPs)",
    dataTypes: "IP addresses, user-agent strings, geo metadata",
    dpa: "https://www.cloudflare.com/cloudflare-customer-dpa/",
  },
  {
    name: "Google (Business Profile API)",
    purpose: "Read reviews + post review replies for connected establishments",
    location: "USA",
    dataTypes: "OAuth access/refresh tokens (envelope-encrypted), review payloads",
    dpa: "https://cloud.google.com/terms/data-processing-addendum",
  },
];

export default function SubprocessorsPage() {
  return (
    <>
      <h1>Sub-processors</h1>
      <p className="text-sm text-muted-foreground">Last updated: 2026-05-12</p>

      <p>
        Repulabs uses the following sub-processors to operate the Service. Each is bound by a
        Data Processing Agreement (DPA) consistent with our Privacy Policy and applicable law.
        We'll notify customers at least 30 days before adding a new sub-processor that has
        access to personal data.
      </p>

      <table>
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Purpose</th>
            <th>Location</th>
            <th>Data types</th>
            <th>DPA</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td><strong>{s.name}</strong></td>
              <td>{s.purpose}</td>
              <td>{s.location}</td>
              <td>{s.dataTypes}</td>
              <td>
                <a href={s.dpa} target="_blank" rel="noopener noreferrer">View</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Notification</h2>
      <p>
        To receive sub-processor change notifications, email{" "}
        <a href="mailto:info@repulabs.com">info@repulabs.com</a> with the subject
        "subprocessor notifications".
      </p>
    </>
  );
}
