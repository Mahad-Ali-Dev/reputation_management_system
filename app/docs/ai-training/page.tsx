import { Block, Code, DocShell, List, Note } from "../_components/doc-shell";

export const dynamic = "force-static";

export const metadata = {
  title: "AI reply training · Repulabs Docs",
  description:
    "Teach the assistant your brand voice so AI-drafted replies sound like you wrote them — not like a corporate template.",
};

export default function AiTrainingPage() {
  return (
    <DocShell
      kicker="AI reply training"
      title="Make the AI sound like you, not like a press release."
      description="Feed it a little about your business and it stops writing “We value your feedback.”"
    >
      <Block title="Why bother">
        <p>
          Untrained, an AI writes safe corporate filler. Customers can tell, and a reply that reads
          like a template does more harm than no reply at all.
        </p>
        <p>
          Trained on your business, it references what you actually sell, uses the words your team
          uses, and knows the things you'd never say.
        </p>
      </Block>

      <Block title="What to give it">
        <p>
          Go to <Code>/ai</Code> and add your business knowledge. The three that move the needle
          most:
        </p>
        <List
          items={[
            <>
              <strong>What you do</strong> — services, specialities, what makes you different. Stops
              generic replies.
            </>,
            <>
              <strong>Tone</strong> — warm or brisk, first names or formal, emoji or never. Include
              phrases you'd never use.
            </>,
            <>
              <strong>Common situations</strong> — the complaints and compliments you get
              repeatedly, and how you like to answer each.
            </>,
          ]}
        />
      </Block>

      <Block title="Approve a few replies by hand">
        <p>
          The fastest training signal is your own edits. For the first week, read each drafted reply
          before it goes out and adjust the wording.
        </p>
        <p>
          A handful of approved replies teaches tone far better than a long style document, because
          it shows the model real examples rather than describing them.
        </p>
      </Block>

      <Block title="Then let autopilot take over">
        <p>
          Once drafts consistently read like you, turn on autopilot so routine replies go out
          without you. Keep a human in the loop for anything negative — that's where a wrong tone
          costs most.
        </p>
        <Note>
          Review the AI's output periodically even after it's dialled in. Your business changes —
          new staff, new services, new complaints — and the training should follow.
        </Note>
      </Block>

      <Block title="Good practice">
        <List
          items={[
            "Never have the AI dispute facts in a negative review — acknowledge, then take it offline.",
            "Keep replies short. Long replies read as defensive.",
            "Don't promise refunds or outcomes in an automated reply.",
            "Thank people by name where the platform gives you one.",
          ]}
        />
      </Block>
    </DocShell>
  );
}
