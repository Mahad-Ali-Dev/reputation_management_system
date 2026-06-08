import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import Link from "next/link";
import { AirbnbListingForm } from "./airbnb-listing-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Add an Airbnb listing · Repulabs",
};

/**
 * Airbnb-listing onboarding.
 *
 * This is a separate page from the standard `/establishments/new` because
 * STR hosts have a different mental model: they think in "listings" not
 * "establishments," and they want to set up house-rules + WiFi + listing
 * URL up front, not five minutes later in a settings page.
 *
 * The page is two columns on desktop, stacked on mobile (the design-system
 * grid handles that automatically). Left: the form. Right: a clear
 * explanation of how the inbound-email-forwarding pipeline works, since
 * that's the only non-obvious part of the setup.
 */
export default async function NewAirbnbListingPage() {
  const { org } = await getOrgContext();

  // The forward-to address that the host configures in their Gmail filter.
  // We derive it from the org slug at render time so it's always correct
  // (slug changes — rare but possible — flow through here).
  const forwardAddress = `reviews-${org.slug}@inbound.repulabs.com`;

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Establishments", "Add Airbnb listing"]}>
      <PageHeader
        kicker="Short-term rental"
        title="Add an Airbnb listing"
        description="Paste your Airbnb listing URL, set WiFi + house rules once, and we'll route every review you get into your unified inbox."
        actions={
          <Link href="/establishments" className="btn">
            <Icon name="chevL" size={12} />
            Back to establishments
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 18,
          alignItems: "flex-start",
        }}
        className="grid-2"
      >
        <section className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Listing details</h3>
            <span className="chip">Step 1 of 2</span>
          </div>
          <div className="ds-card__body">
            <AirbnbListingForm />
          </div>
        </section>

        <aside style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <section className="ds-card">
            <div className="ds-card__head">
              <h3 className="ds-card__title">How reviews flow in</h3>
            </div>
            <div
              className="ds-card__body"
              style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)" }}
            >
              <p style={{ marginTop: 0 }}>
                Airbnb doesn&rsquo;t expose a public API for review access. We use the email channel
                they already send you — set up one Gmail filter and reviews land in your Repulabs
                inbox automatically.
              </p>

              <ol
                style={{
                  paddingLeft: 18,
                  marginTop: 10,
                  marginBottom: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <li>
                  In Gmail, open{" "}
                  <strong>Settings → Filters and Blocked Addresses → Create filter</strong>.
                </li>
                <li>
                  In the <strong>From</strong> field paste:
                  <code
                    className="mono"
                    style={{
                      display: "block",
                      marginTop: 4,
                      padding: "6px 8px",
                      background: "var(--surface-2, #fafbf8)",
                      borderRadius: 6,
                      fontSize: 12,
                      border: "1px solid var(--line)",
                    }}
                  >
                    automated@airbnb.com OR express@airbnb.com OR noreply@airbnb.com
                  </code>
                </li>
                <li>
                  Click <strong>Create filter → Forward it to</strong> and set:
                  <code
                    className="mono"
                    style={{
                      display: "block",
                      marginTop: 4,
                      padding: "6px 8px",
                      background: "var(--surface-2, #fafbf8)",
                      borderRadius: 6,
                      fontSize: 12,
                      border: "1px solid var(--line)",
                      wordBreak: "break-all",
                    }}
                  >
                    {forwardAddress}
                  </code>
                </li>
                <li>
                  Gmail emails you to confirm the new forward address — click the confirmation link
                  and you&rsquo;re done.
                </li>
              </ol>

              <div
                style={{
                  marginTop: 14,
                  padding: 10,
                  background: "var(--pri-50, #ECFDF7)",
                  border: "1px solid var(--pri-100, #cffaf0)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "var(--pri-700, #0f766e)",
                  lineHeight: 1.55,
                }}
              >
                <strong>Privacy.</strong> We only parse the review fields out of each forwarded
                email (reviewer name, rating, body). We never read other emails — Gmail's filter
                sends us only the ones that match.
              </div>
            </div>
          </section>

          <section className="ds-card">
            <div className="ds-card__head">
              <h3 className="ds-card__title">What happens next</h3>
            </div>
            <div
              className="ds-card__body"
              style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}
            >
              <Step
                n={1}
                t="Review lands in your inbox"
                d="Each new Airbnb review appears under /reviews tagged with an Airbnb badge."
              />
              <Step
                n={2}
                t="AI drafts a reply in your voice"
                d="We use your prior approved replies (or your brand-voice doc) to draft three options — concise, warm, or detailed."
              />
              <Step
                n={3}
                t="One-click open in Airbnb"
                d="Click 'Reply on Airbnb' and we deep-link to the right review in your host dashboard. Paste, send, done."
              />
            </div>
          </section>
        </aside>
      </div>
    </AppShellServer>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "var(--pri-50, #ECFDF7)",
          color: "var(--pri, #2563eb)",
          display: "grid",
          placeItems: "center",
          fontWeight: 600,
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
        <div className="dim" style={{ fontSize: 12 }}>
          {d}
        </div>
      </div>
    </div>
  );
}
