import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge } from "@/components/admin/admin-ui";
import { disableProviderApp, saveProviderApp } from "@/lib/admin/providers";
import { META_PROVIDER } from "@/lib/connections/adapters/meta-overlay";
import { prisma } from "@/lib/db/client";
import { PROVIDERS, authorizeRouteSlug } from "@/lib/providers/registry";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProviderConfigurePage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const { provider } = await params;

  // `facebook` and `instagram` are LEGACY registry entries. The live connector
  // is the combined `meta` one (/api/connections/meta), and their setup text
  // pointed at /api/connections/facebook/callback — a route that doesn't exist.
  // Worse, saving here wrote a ProviderApp row keyed "facebook", which
  // loadProviderApp("meta") never reads: credentials that silently do nothing.
  if (provider === "facebook" || provider === "instagram") {
    redirect("/admin/providers/meta");
  }

  // `meta` is an OVERLAY, not a registry entry, so a bare PROVIDERS lookup 404'd
  // and Meta could not be configured at all. Resolve it the same way the
  // customer-facing connections page does.
  const entry = provider === "meta" ? META_PROVIDER : PROVIDERS[provider];
  if (!entry) notFound();

  const app = await prisma.providerApp.findUnique({
    where: { provider },
    select: { provider: true, clientId: true, scopes: true, status: true, updatedAt: true },
  });

  return (
    <div style={{ maxWidth: 760 }}>
      <Link
        href="/admin/providers"
        style={{
          fontSize: 12,
          color: "var(--rl-muted)",
          textDecoration: "none",
          marginBottom: 8,
          display: "inline-block",
        }}
      >
        ← All providers
      </Link>

      <AdminPageHeader
        title={`${entry.logoEmoji} ${entry.displayName}`}
        description={
          <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <span>{entry.description}</span>
            {app?.status === "configured" && <Badge tone="ok">configured</Badge>}
            {app?.status === "disabled" && <Badge tone="bad">disabled</Badge>}
            {!app && <Badge tone="neutral">unconfigured</Badge>}
          </span>
        }
        actions={
          entry.docsUrl ? (
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12,
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--surface)",
                color: "var(--ink-2)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Open developer docs ↗
            </a>
          ) : undefined
        }
      />

      {entry.blockerNote && (
        <div
          className="ds-card"
          style={{
            padding: 14,
            marginBottom: 14,
            border: "1px solid #fde68a",
            background: "#fffbeb",
            fontSize: 13,
            color: "#92400e",
          }}
        >
          <strong>Heads up:</strong> {entry.blockerNote}
        </div>
      )}

      {/* Credentials form */}
      <div className="ds-card" style={{ padding: 18, marginBottom: 14 }}>
        <h3 className="ds-card__title">OAuth credentials</h3>
        {app?.status === "configured" && (
          <p
            style={{
              fontSize: 11.5,
              color: "#15803d",
              marginTop: 6,
              marginBottom: 14,
            }}
          >
            ✓ Configured · last updated {new Date(app.updatedAt).toLocaleString()}
          </p>
        )}
        <form
          action={saveProviderApp}
          style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}
        >
          <input type="hidden" name="provider" value={provider} />

          <FormField label="Client ID">
            <input
              name="clientId"
              required
              defaultValue={app?.clientId ?? ""}
              placeholder="From the platform's developer portal"
              style={inputStyle}
            />
          </FormField>

          <FormField label="Client Secret">
            <input
              type="password"
              name="clientSecret"
              required
              placeholder={
                app?.status === "configured"
                  ? "•••••••• (paste to update)"
                  : "From the platform's developer portal"
              }
              style={inputStyle}
            />
            <span style={{ fontSize: 11, color: "var(--rl-muted)", marginTop: 2 }}>
              Stored envelope-encrypted (AES-256-GCM with per-provider AAD).
            </span>
          </FormField>

          <FormField label="Scopes">
            <textarea
              name="scopes"
              defaultValue={(app?.scopes ?? entry.scopes ?? []).join("\n")}
              rows={3}
              style={{
                ...inputStyle,
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                resize: "vertical",
              }}
            />
            <span style={{ fontSize: 11, color: "var(--rl-muted)", marginTop: 2 }}>
              One per line or comma-separated. Defaults shown.
            </span>
          </FormField>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
            <button
              type="submit"
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "none",
                background: "var(--pri, #2563eb)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save credentials
            </button>
          </div>
        </form>

        {app?.status === "configured" && (
          <form
            action={disableProviderApp}
            style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--line)" }}
          >
            <input type="hidden" name="provider" value={provider} />
            <button
              type="submit"
              style={{
                background: "transparent",
                border: "none",
                color: "#b91c1c",
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
              }}
            >
              Disable this provider
            </button>
          </form>
        )}
      </div>

      {/* Setup instructions */}
      <div className="ds-card" style={{ padding: 18 }}>
        <h3 className="ds-card__title">Setup instructions</h3>
        <ol
          style={{
            marginTop: 10,
            paddingLeft: 22,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.55,
          }}
        >
          <li>
            Go to{" "}
            <a
              href={entry.docsUrl ?? "#"}
              style={{ color: "#4f46e5", textDecoration: "underline" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {entry.displayName}'s developer portal
            </a>{" "}
            and register a new OAuth app.
          </li>
          <li>
            Set the redirect URI to:{" "}
            <code className="mono" style={chipCode}>
              {`${(process.env.NEXT_PUBLIC_APP_URL ?? "https://repulabs.com").replace(/\/+$/, "")}/api/connections/${authorizeRouteSlug(provider)}/callback`}
            </code>
          </li>
          <li>Request the scopes listed above (some platforms call these "permissions").</li>
          <li>Copy the client ID + client secret into the form above.</li>
          {!entry.ready && (
            <li style={{ color: "#a16207" }}>
              Submit for App Review if the platform requires it before public users can authorize.
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 13,
  outline: "none",
  width: "100%",
  color: "var(--ink)",
};

const chipCode: React.CSSProperties = {
  background: "var(--surface-2, #fafbf8)",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 11,
  fontFamily: "var(--f-mono)",
  wordBreak: "break-all",
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          color: "var(--rl-muted)",
          letterSpacing: "0.04em",
          fontWeight: 600,
        }}
      >
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
