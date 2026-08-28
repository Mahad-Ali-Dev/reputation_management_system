import { Block, Code, DocShell, List, Note } from "../_components/doc-shell";

export const dynamic = "force-static";

export const metadata = {
  title: "Concepts · Repulabs Docs",
  description:
    "Organizations, establishments, devices, connections and brand voice the mental model the rest of the docs assumes.",
};

export default function ConceptsPage() {
  return (
    <DocShell
      kicker="Concepts"
      title="The five things everything else is built on."
      description="Read this once and the rest of the documentation will make sense."
    >
      <Block title="Organization (your workspace)">
        <p>
          The top-level container. One organization per business or group, created automatically at
          signup. It owns your billing, your team and everything below.
        </p>
        <p>
          Team members are invited into the organization with a role. Billing is per{" "}
          <em>location</em>, not per seat adding a colleague doesn't change your bill.
        </p>
      </Block>

      <Block title="Establishment (a location)">
        <p>
          One physical address one Google Business Profile. Three cafés means three
          establishments. Each has its own reviews, devices, settings and brand voice, all under the
          same login.
        </p>
        <p>
          This is also the unit Pro is priced on, and the unit reporting is grouped by. Manage them
          at <Code>/establishments</Code>.
        </p>
      </Block>

      <Block title="Connection (a linked account)">
        <p>
          An authorisation to act on your behalf somewhere else Google Business Profile, a
          mailbox, a social account. Created at <Code>/connections</Code>.
        </p>
        <p>
          Tokens are encrypted at rest, and disconnecting revokes our access immediately. Repulabs
          only ever reaches accounts the connecting user already manages.
        </p>
      </Block>

      <Block title="Device (a card, plaque or stand)">
        <p>
          A physical QR/NFC item bound to one establishment. Each carries a unique code that routes
          a customer straight to your review page.
        </p>
        <p>
          A device is inert until <strong>activated</strong> that's what ties it to your business.
          See the{" "}
          <a href="/docs/hardware" style={{ textDecoration: "underline" }}>
            hardware guide
          </a>
          .
        </p>
      </Block>

      <Block title="Brand voice">
        <p>
          The tone the AI writes in. Rather than generic corporate replies, it learns how you
          actually speak warm or brisk, formal or casual, and the phrases you'd never use.
        </p>
        <p>
          Every AI-drafted reply, survey follow-up and social caption is generated against it. Train
          it at <Code>/ai</Code> see{" "}
          <a href="/docs/ai-training" style={{ textDecoration: "underline" }}>
            AI reply training
          </a>
          .
        </p>
      </Block>

      <Block title="How they fit together">
        <List
          items={[
            <>
              An <strong>organization</strong> contains one or more <strong>establishments</strong>.
            </>,
            <>
              Each establishment has <strong>connections</strong> (its Google listing) and{" "}
              <strong>devices</strong> (its cards and stands).
            </>,
            <>
              Reviews arrive via the connection; requests go out via outreach; both are written in
              your <strong>brand voice</strong>.
            </>,
          ]}
        />
        <Note>
          Rule of thumb: if it's a physical place with its own Google listing, it's an
          establishment. If it's a thing a customer taps or scans, it's a device.
        </Note>
      </Block>
    </DocShell>
  );
}
