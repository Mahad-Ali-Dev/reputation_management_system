import { Icon } from "@/components/shell/icon";
import { rotateApiKey, saveWebhook } from "@/lib/account/actions";
import { NEW_API_KEY_COOKIE } from "@/lib/account/constants";
import { cookies } from "next/headers";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";

/**
 * API & webhooks (designs/settings/API n webbooks/API.png).
 *
 * Indigo-accent API-key card (masked key + rotate) + emerald-accent webhook
 * card (endpoint URL + verify banner). Bound to the existing rotateApiKey /
 * saveWebhook server actions. A freshly generated key is surfaced exactly once
 * via the NEW_API_KEY_COOKIE short-lived cookie.
 *
 * Note: the kit mockup swaps the page H1 to "API & webhooks". This route lives
 * inside the shared settings shell (one persistent "Settings" hero), so that
 * emphasis lives on the card title + active sub-nav instead — consistent with
 * the other sub-pages.
 */
export const dynamic = "force-dynamic";

const ASSET = "/assets/repulabs/settings";

function formatCreated(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ApiSettingsPage() {
  const { settingsObj } = await loadSettingsData();
  const apiSettings = settingsObj.api ?? {};
  const newApiKey = (await cookies()).get(NEW_API_KEY_COOKIE)?.value ?? null;
  const createdLabel = formatCreated(apiSettings.keyCreatedAt);
  const webhookUrl = apiSettings.webhookUrl ?? "";

  return (
    <SettingsFrame>
      {/* ── API key ─────────────────────────────────────────────────── */}
      <section className="set-card set-card--accent set-card--accent-indigo">
        <div className="set-sec-head">
          <span className="set-tile set-tile--indigo">
            {/* biome-ignore lint/a11y/useAltText: decorative key art */}
            <img src={`${ASSET}/api-key.svg`} alt="" aria-hidden="true" />
          </span>
          <div>
            <h2 className="set-card__title set-card__title--sm">API key</h2>
            <p className="set-card__sub">Use this key to authenticate API requests.</p>
          </div>
        </div>

        {newApiKey && (
          <div className="set-callout set-callout--success" style={{ marginTop: 16 }}>
            <Icon name="checkCircle" size={16} className="set-callout__ic" />
            <div>
              <strong>New API key — copy it now.</strong> It won&apos;t be shown again.
              <code
                style={{
                  display: "block",
                  marginTop: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#fff",
                  border: "1px solid #a7f3d0",
                  fontFamily: "var(--f-mono, monospace)",
                  fontSize: 12.5,
                  color: "var(--set-ink)",
                  wordBreak: "break-all",
                }}
              >
                {newApiKey}
              </code>
            </div>
          </div>
        )}

        <div className="set-keyrow">
          <div className="set-key-field">
            {apiSettings.keyPrefix ? (
              <span>
                {apiSettings.keyPrefix}
                {"••••••••••••••••••••••••"}
              </span>
            ) : (
              <span className="set-dim">No API key generated yet.</span>
            )}
          </div>
          <form action={rotateApiKey}>
            <button type="submit" className="set-btn">
              <Icon name="refresh" size={16} className="set-btn__ic" />
              {apiSettings.keyPrefix ? "Rotate key" : "Generate key"}
            </button>
          </form>
        </div>

        {createdLabel && (
          <div className="set-meta">
            <Icon name="cal" size={14} />
            Created on {createdLabel}
          </div>
        )}

        <div className="set-callout set-callout--info" style={{ marginTop: 18 }}>
          <Icon name="info" size={16} className="set-callout__ic" />
          <span>
            Keep your API key secure. Do not share it publicly or expose it in client-side code.
          </span>
        </div>
      </section>

      {/* ── Webhook endpoint ────────────────────────────────────────── */}
      <section className="set-card set-card--accent set-card--accent-emerald">
        <div className="set-sec-head">
          <span className="set-tile set-tile--emerald">
            {/* biome-ignore lint/a11y/useAltText: decorative webhook art */}
            <img src={`${ASSET}/api-webhook.svg`} alt="" aria-hidden="true" />
          </span>
          <div>
            <h2 className="set-card__title set-card__title--sm">Webhook endpoint URL</h2>
            <p className="set-card__sub">Send real-time event notifications to your endpoint.</p>
          </div>
        </div>

        <form action={saveWebhook}>
          <div className="set-url-field">
            <Icon name="globe" size={16} className="set-url-field__ic" />
            <input
              type="url"
              name="webhookUrl"
              defaultValue={webhookUrl}
              placeholder="https://your-server.com/webhooks/repulabs"
              aria-label="Webhook endpoint URL"
            />
            {webhookUrl && (
              <span className="set-pill set-pill--ok">
                <Icon name="check" size={12} />
                Verified
              </span>
            )}
          </div>

          {apiSettings.webhookSecret && (
            <div style={{ marginTop: 14 }}>
              <div className="set-dl__label">Signing secret</div>
              <code
                style={{
                  display: "block",
                  marginTop: 6,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "#f8fafc",
                  border: "1px solid var(--set-line)",
                  fontFamily: "var(--f-mono, monospace)",
                  fontSize: 12.5,
                  wordBreak: "break-all",
                }}
              >
                {apiSettings.webhookSecret}
              </code>
              <div className="set-field__hint" style={{ marginTop: 4 }}>
                We sign every webhook payload with this secret (header{" "}
                <span style={{ fontFamily: "var(--f-mono, monospace)" }}>X-Repulabs-Signature</span>
                ).
              </div>
            </div>
          )}

          <div className="set-callout set-callout--success" style={{ marginTop: 16 }}>
            <Icon name="checkCircle" size={16} className="set-callout__ic" />
            <span>We will send a test request to this URL to verify the connection.</span>
          </div>

          <div className="set-actions">
            <button type="submit" className="set-btn set-btn--primary">
              <Icon name="check" size={16} className="set-btn__ic" />
              Save webhook
            </button>
          </div>
        </form>
      </section>
    </SettingsFrame>
  );
}
