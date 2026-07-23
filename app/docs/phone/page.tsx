import { Block, Code, DocShell, List, Note } from "../_components/doc-shell";

export const dynamic = "force-static";

export const metadata = {
  title: "AI phone receptionist · Repulabs Docs",
  description:
    "Set up the AI receptionist so missed calls stop becoming lost customers — number setup, voices, and reviewing what was said.",
};

export default function PhoneDocsPage() {
  return (
    <DocShell
      kicker="AI phone receptionist"
      title="Stop losing the customers who ring while you're busy."
      description="A missed call at a local business is usually a customer who rings the next place on the list."
    >
      <Block title="What it does">
        <p>
          The receptionist answers calls you can't, in a voice you choose. It handles the questions
          that make up most inbound volume — opening hours, location, whether you take walk-ins,
          rough pricing — and captures the caller's details when it can't.
        </p>
        <p>
          Every call is transcribed, so nothing depends on someone remembering to write it down.
        </p>
      </Block>

      <Block title="Setting it up">
        <p>
          Everything lives under <Code>/phone</Code>:
        </p>
        <List
          items={[
            <>
              <Code>/phone/setup</Code> — connect a number and choose when the AI answers: always,
              after hours, or only when the call goes unanswered.
            </>,
            <>
              <Code>/phone/voices</Code> — pick the voice callers hear.
            </>,
            <>
              <Code>/phone/assistant</Code> — what it knows and how it should handle calls it can't
              resolve.
            </>,
            <>
              <Code>/phone/calls</Code> — every call, with transcript and outcome.
            </>,
          ]}
        />
        <Note>
          Start with <strong>after-hours only</strong>. You get the safety net without changing
          anything about how calls work during trading, and you can read the transcripts before
          widening it.
        </Note>
      </Block>

      <Block title="Teach it your business">
        <p>
          The receptionist draws on the same business knowledge as your AI replies, so anything you
          add at <Code>/ai</Code> improves both. Worth adding specifically for calls: parking,
          access, whether you take bookings, and what to do with a supplier or sales call.
        </p>
      </Block>

      <Block title="Read the transcripts — especially early">
        <p>
          For the first week, read every transcript at <Code>/phone/calls</Code>. You'll find
          questions you didn't expect, and each one you answer in the assistant's knowledge is a
          call it handles cleanly next time.
        </p>
        <p>
          It's also the clearest picture most owners ever get of what people actually ring to ask.
        </p>
      </Block>

      <Block title="Worth knowing">
        <List
          items={[
            "Pro includes 200 minutes of AI phone time per month.",
            "The AI should hand off, not improvise — set it to take a message for anything it can't answer confidently.",
            "Tell your team it's on, so nobody is surprised by a transcript of a call they didn't take.",
          ]}
        />
      </Block>
    </DocShell>
  );
}
