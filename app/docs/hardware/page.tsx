import { Code, DocShell, List, Note, Step } from "../_components/doc-shell";

export const dynamic = "force-static";

export const metadata = {
  title: "QR cards, plaques & stands · Repulabs Docs",
  description:
    "Order, activate and manage Repulabs review hardware. How activation codes work and what to do when one won't take.",
};

export default function HardwareDocsPage() {
  return (
    <DocShell
      kicker="Hardware"
      title="Cards, plaques and stands from box to first scan."
      description="Every device carries a unique code that routes customers straight to your Google review page."
    >
      <Step n={1} title="Order your devices">
        <p>
          Hardware is sold separately from your subscription. Cards suit tables, staff and takeaway
          bags; plaques and stands suit a counter or reception desk.
        </p>
        <p>
          The software works fine without hardware a device just removes the friction of asking.
        </p>
      </Step>

      <Step n={2} title="Activate each device">
        <p>Every device ships with an activation card in the package. To activate:</p>
        <List
          items={[
            <>
              Scan the device's QR code, or go to <Code>/activate</Code>.
            </>,
            <>
              Enter the <strong>5-character code</strong> printed on the card inside the package.
            </>,
            <>Choose which establishment it belongs to, and confirm.</>,
          ]}
        />
        <p>
          That binds the device to your business. From then on, every scan or tap lands the customer
          on that location's review page.
        </p>
        <Note>
          Activation codes are <strong>one-time-use</strong> once a device is redeemed, that code
          can't be reused. Activate each device with the card that came in its own package.
        </Note>
      </Step>

      <Step n={3} title="Manage them">
        <p>
          <Code>/hardware</Code> lists every device, which establishment it's bound to, and whether
          it's been activated. Add devices at <Code>/hardware/new</Code> and edit an existing one
          from its row.
        </p>
        <p>
          Because each device has its own code, you can see which placements actually earn reviews
          the stand by the till versus the cards in takeaway bags.
        </p>
      </Step>

      <Step n={4} title="Placement that works">
        <List
          items={[
            "At the till, facing the customer the single highest-traffic spot.",
            "On the table or with the bill, where there's a natural pause.",
            "Reception desks and waiting areas, where people are already looking around.",
            "In takeaway bags the review often lands after they get home.",
          ]}
        />
      </Step>

      <Note>
        <strong>A code won't activate?</strong> Check you're using the card from that device's own
        package, and that the code hasn't already been redeemed. Codes are 5 characters dashes and
        spaces are ignored. Still stuck?{" "}
        <a href="/contact" style={{ textDecoration: "underline" }}>
          Contact support
        </a>{" "}
        with the device's QR link and we'll sort it.
      </Note>
    </DocShell>
  );
}
