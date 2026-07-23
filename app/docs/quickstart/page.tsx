import { TRIAL_DAYS } from "@/lib/billing/plans";
import { Code, DocShell, List, Note, Step } from "../_components/doc-shell";

export const dynamic = "force-static";

export const metadata = {
  title: "Quickstart · Repulabs Docs",
  description:
    "Sign up, connect your Google Business Profile, and send your first review request — in about ten minutes.",
};

export default function QuickstartPage() {
  return (
    <DocShell
      kicker="Quickstart"
      title="From signup to your first review request in ten minutes."
      description="Four steps. You'll need admin access to the Google account that manages your Business Profile."
    >
      <Step n={1} title="Create your workspace">
        <p>
          Sign up at <Code>/signup</Code> with email or Google. Your first workspace — the
          organisation everything else hangs off — is created automatically, with you as owner.
        </p>
        <p>
          New workspaces start on a <strong>{TRIAL_DAYS}-day Pro trial</strong>, so AI replies,
          unlimited requests and the phone receptionist are all unlocked while you evaluate.
        </p>
      </Step>

      <Step n={2} title="Connect your Google Business Profile">
        <p>
          Go to <Code>/connections</Code> and choose <strong>Google Business Profile</strong>.
          You'll be sent to Google's consent screen, then back to Repulabs.
        </p>
        <p>
          Pick the locations you want to manage. Each one becomes an <em>establishment</em> — its
          own reviews, devices and brand voice, all under the same login.
        </p>
        <Note>
          Connect with the Google account that already manages the listing. Repulabs can only ever
          see locations that account manages — it can't reach anyone else's business.
        </Note>
      </Step>

      <Step n={3} title="Let your reviews sync">
        <p>
          Once connected, Repulabs pulls your existing reviews and then re-checks every{" "}
          <strong>15 minutes</strong>. Your back-catalogue appears under <Code>/reviews</Code>{" "}
          within a few minutes of connecting.
        </p>
        <p>From there you can reply directly, or have the AI draft a reply in your brand voice.</p>
      </Step>

      <Step n={4} title="Send your first review request">
        <p>
          Open <Code>/outreach</Code>, add a customer (or import a list), and send a request by
          email or SMS. Pick a template or write your own — you can save it for reuse.
        </p>
        <p>Then, to make asking effortless in person:</p>
        <List
          items={[
            <>
              Set up a QR or NFC device — see the{" "}
              <a href="/docs/hardware" style={{ textDecoration: "underline" }}>
                hardware guide
              </a>
              .
            </>,
            <>
              Teach the assistant your tone — see{" "}
              <a href="/docs/ai-training" style={{ textDecoration: "underline" }}>
                AI reply training
              </a>
              .
            </>,
          ]}
        />
      </Step>

      <Note>
        Stuck on any step?{" "}
        <a href="/contact" style={{ textDecoration: "underline" }}>
          Talk to us
        </a>{" "}
        — we'll walk you through the connection live.
      </Note>
    </DocShell>
  );
}
