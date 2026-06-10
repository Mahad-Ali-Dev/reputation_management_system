import { Icon } from "@/components/shell/icon";
import { rotateApiKey, saveWebhook } from "@/lib/account/actions";
import { NEW_API_KEY_COOKIE } from "@/lib/account/constants";
import { cookies } from "next/headers";
import { FormField } from "../_components/fields";
import { loadSettingsData } from "../_lib/data";

/**
 * API & webhooks — API key rotation + webhook endpoint. Bound to the existing
 * rotateApiKey / saveWebhook server actions. A freshly generated key is
 * surfaced exactly once via the NEW_API_KEY_COOKIE short-lived cookie.
 */
export const dynamic = "force-dynamic";

export default async function ApiSettingsPage() {
  const { settingsObj } = await loadSettingsData();
  const apiSettings = settingsObj.api ?? {};
  const newApiKey = (await cookies()).get(NEW_API_KEY_COOKIE)?.value ?? null;

  return (
    <section className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">API &amp; webhooks</h3>
          <div className="ds-card__sub">Programmatic access to your workspace</div>
        </div>
      </div>
      <div className="ds-card__body">
        {newApiKey && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "var(--ok-soft)",
              border: "1px solid var(--ok)",
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ok)" }}>
              New API key — copy it now. It won&apos;t be shown again.
            </div>
            <code
              style={{
                display: "block",
                marginTop: 8,
                padding: "8px 10px",
                borderRadius: 6,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                wordBreak: "break-all",
              }}
            >
              {newApiKey}
            </code>
          </div>
        )}

        <div className="lbl-mono">API key</div>
        <div className="row" style={{ justifyContent: "space-between", gap: 12, marginTop: 6 }}>
          <div>
            {apiSettings.keyPrefix ? (
              <>
                <span className="mono" style={{ fontSize: 13 }}>
                  {apiSettings.keyPrefix}
                  {"••••••••••••"}
                </span>
                <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                  Created{" "}
                  {apiSettings.keyCreatedAt
                    ? new Date(apiSettings.keyCreatedAt).toLocaleDateString()
                    : "—"}
                </div>
              </>
            ) : (
              <span className="dim" style={{ fontSize: 12.5 }}>
                No API key generated yet.
              </span>
            )}
          </div>
          <form action={rotateApiKey}>
            <button type="submit" className="btn btn--sm">
              <Icon name="bolt" size={11} />
              {apiSettings.keyPrefix ? "Rotate key" : "Generate key"}
            </button>
          </form>
        </div>

        <div className="divider" />

        <form action={saveWebhook}>
          <FormField
            label="Webhook endpoint URL"
            name="webhookUrl"
            type="url"
            defaultValue={apiSettings.webhookUrl ?? ""}
            placeholder="https://your-server.com/webhooks/repulabs"
          />
          {apiSettings.webhookSecret && (
            <div style={{ marginTop: 8 }}>
              <div className="lbl-mono">Signing secret</div>
              <code
                style={{
                  display: "block",
                  marginTop: 4,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                  fontFamily: "var(--f-mono)",
                  fontSize: 12,
                  wordBreak: "break-all",
                }}
              >
                {apiSettings.webhookSecret}
              </code>
              <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
                We sign every webhook payload with this secret (header{" "}
                <span className="mono">X-Repulabs-Signature</span>).
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn--pri">
              <Icon name="check" size={12} />
              Save webhook
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
