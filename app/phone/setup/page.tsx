import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { registerPhoneNumber } from "@/lib/phone/actions";
import Link from "next/link";
import { WebhookField } from "./_components/webhook-field";
import "../phone-receptionist.css";

/**
 * Phone number setup — rebuilt to the delivered design kit
 * (designs/Ai phone receptionist/provision number). Four step cards:
 *   1. Buy a number in Twilio (checklist)
 *   2. Configure webhooks (copyable dark URL fields)
 *   3. Register the number here (form → existing `registerPhoneNumber` action)
 *   4. Configure the AI assistant (link to /phone/assistant)
 * plus a floating support button.
 *
 * The webhook URLs are the REAL live routes the Twilio integration listens on
 * (/api/voice/incoming + /api/voice/status), computed from NEXT_PUBLIC_APP_URL —
 * not the mockup's placeholder strings. Step 3 is the unchanged server-action
 * form, so registration keeps working exactly.
 */

export const dynamic = "force-dynamic";

export default async function PhoneSetupPage() {
  // Touch org context so the page stays per-tenant + redirects when logged out,
  // matching every other /phone route.
  await getOrgContext();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com";
  const voiceWebhookUrl = `${appUrl}/api/voice/incoming`;
  const statusCallbackUrl = `${appUrl}/api/voice/status`;

  return (
    <div className="pr">
      <AppShellServer topBar={<TopBar title="Phone number setup" />}>
        <PageHeader
          title="Phone number setup"
          description="Connect a Twilio number to start receiving calls."
          breadcrumb={[{ label: "AI Phone Receptionist", href: "/phone" }, { label: "Setup" }]}
          actions={
            <span
              className="pr-btn"
              aria-hidden="true"
              style={{
                background: "var(--pr-pri-soft)",
                color: "var(--pr-pri)",
                cursor: "default",
              }}
            >
              <Icon name="phone" size={14} />
              Phone number setup
            </span>
          }
        />

        <div className="pr-setup-stack">
          {/* ── Step 1 — Buy a number in Twilio ── */}
          <section className="pr-setup-card">
            <div className="pr-setup-icon">
              <Icon name="phone" size={36} />
              <span className="pr-setup-badge">1</span>
            </div>
            <div>
              <h2 className="pr-setup-title">Step 1 Buy a number in Twilio</h2>
              <ul className="pr-check-list">
                <li>
                  <span className="pr-check">
                    <Icon name="check" size={12} stroke={2.6} />
                  </span>
                  <span>
                    Go to{" "}
                    <a
                      href="https://console.twilio.com/us1/develop/phone-numbers/manage/search"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pr-link"
                    >
                      Twilio Console → Phone Numbers → Buy
                    </a>
                  </span>
                </li>
                <li>
                  <span className="pr-check">
                    <Icon name="check" size={12} stroke={2.6} />
                  </span>
                  <span>Pick a number with Voice capability (SMS optional).</span>
                </li>
                <li>
                  <span className="pr-check">
                    <Icon name="check" size={12} stroke={2.6} />
                  </span>
                  <span>After purchase, open the number's Configure page.</span>
                </li>
              </ul>
            </div>
            {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
            <img
              className="pr-setup-art"
              src="/assets/repulabs/phone/setup-twilio.svg"
              alt=""
              aria-hidden="true"
            />
          </section>

          {/* ── Step 2 — Configure webhooks ── */}
          <section className="pr-setup-card">
            <div className="pr-setup-icon">
              <Icon name="plug" size={36} />
              <span className="pr-setup-badge">2</span>
            </div>
            <div>
              <h2 className="pr-setup-title">Step 2 Configure webhooks</h2>
              <p className="pr-setup-sub">
                Paste these URLs into Twilio's number config.
              </p>
              <WebhookField
                label="A call comes in (Webhook)"
                url={voiceWebhookUrl}
                copyLabel="Copy incoming webhook URL"
              />
              <WebhookField
                label="Call status changes (Status callback)"
                url={statusCallbackUrl}
                copyLabel="Copy status callback URL"
              />
              <p className="pr-webhook__foot">
                Method: POST &nbsp;·&nbsp; Events: completed, no-answer, busy, failed
              </p>
            </div>
            {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
            <img
              className="pr-setup-art"
              src="/assets/repulabs/phone/setup-configure.svg"
              alt=""
              aria-hidden="true"
            />
          </section>

          {/* ── Step 3 — Register the number here ── */}
          <section className="pr-setup-card">
            <div className="pr-setup-icon pr-setup-icon--teal">
              <Icon name="user" size={34} />
              <span className="pr-setup-badge pr-setup-badge--teal">3</span>
            </div>
            <div>
              <h2 className="pr-setup-title">Step 3 Register the number here</h2>
              <p className="pr-setup-sub">
                From the Twilio number's Properties page.
              </p>
              <form action={registerPhoneNumber}>
                <div className="pr-register-grid">
                  <div>
                    <label className="pr-field-label" htmlFor="pr-e164">
                      Phone number (E.164)
                    </label>
                    <div className="pr-input-affix">
                      <span className="pr-input-affix__flag" aria-hidden="true">
                        🇺🇸
                      </span>
                      <input
                        id="pr-e164"
                        name="phoneE164"
                        required
                        pattern="^\+[1-9][0-9]{1,14}$"
                        placeholder="+15551234567"
                        style={{ fontFamily: "var(--f-mono)" }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="pr-field-label" htmlFor="pr-sid">
                      Twilio SID (starts with PN)
                    </label>
                    <input
                      id="pr-sid"
                      name="twilioSid"
                      required
                      placeholder="PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      className="pr-input pr-input--sm"
                      style={{ fontFamily: "var(--f-mono)" }}
                    />
                  </div>
                  <div>
                    <label className="pr-field-label" htmlFor="pr-friendly">
                      Friendly name (optional)
                    </label>
                    <input
                      id="pr-friendly"
                      name="friendlyName"
                      placeholder="Main line Springfield"
                      className="pr-input pr-input--sm"
                    />
                  </div>
                  <div>
                    <label className="pr-field-label" htmlFor="pr-forward">
                      Hand off to (optional)
                    </label>
                    <div className="pr-input-affix">
                      <span className="pr-input-affix__flag" aria-hidden="true">
                        🇺🇸
                      </span>
                      <input
                        id="pr-forward"
                        name="forwardToE164"
                        placeholder="+1 555 999 8888"
                        style={{ fontFamily: "var(--f-mono)" }}
                      />
                    </div>
                    <p className="pr-helper">
                      Forward calls here when the AI is disabled or after handoff.
                    </p>
                  </div>
                </div>
                <button
                  type="submit"
                  className="pr-btn pr-btn--pri"
                  style={{ marginTop: 16, height: 38 }}
                >
                  Register number
                  <Icon name="arrowR" size={14} />
                </button>
              </form>
            </div>
            {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
            <img
              className="pr-setup-art pr-setup-art--keypad"
              src="/assets/repulabs/phone/setup-phone-ui.svg"
              alt=""
              aria-hidden="true"
            />
          </section>

          {/* ── Step 4 — Configure the AI assistant ── */}
          <section className="pr-setup-card">
            <div className="pr-setup-icon">
              <Icon name="bot" size={36} />
              <span className="pr-setup-badge">4</span>
            </div>
            <div>
              <h2 className="pr-setup-title">Step 4 Configure the AI assistant</h2>
              <p className="pr-setup-sub" style={{ marginBottom: 0 }}>
                Set the greeting, voice, and behavior on the{" "}
                <Link href="/phone/assistant" className="pr-link">
                  assistant config page
                </Link>
                . Enable it when you're ready for the AI to start answering.
              </p>
            </div>
            {/* biome-ignore lint/performance/noImgElement: real kit raster-in-SVG illustration */}
            <img
              className="pr-setup-art pr-setup-art--robot"
              src="/assets/repulabs/phone/robot.svg"
              alt=""
              aria-hidden="true"
            />
          </section>
        </div>
      </AppShellServer>
    </div>
  );
}
