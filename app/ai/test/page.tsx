import Link from "next/link";
import Script from "next/script";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Icon } from "@/components/shell/icon";

export const dynamic = "force-dynamic";

/**
 * Test page for the embedded chatbot — repulabs v3 (cool-slate + blue).
 * Renders the widget loader script with the given public key so the founder
 * can interact with the AI without setting up an external host.
 *
 * Standalone chrome (its own slim header, NOT the dashboard app shell) but
 * styled with the v3 design-system classes / tokens since it lives inside the
 * authenticated app.
 *
 * Auth-gated: the key must belong to the current org. We don't want anonymous
 * users browsing arbitrary keys here (even though the widget endpoint itself
 * is public — the test page is a convenience for owners).
 */
export default async function AiTestPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { orgId } = await getOrgContext();

  const { key } = await searchParams;

  if (!key) {
    return (
      <TestShell>
        <h1 className="ph__title" style={{ fontSize: 24 }}>
          Test the chatbot
        </h1>
        <p className="dim" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
          Missing <code style={codeStyle}>?key=…</code> query parameter.{" "}
          <Link href="/ai" style={linkStyle}>
            Go to AI settings →
          </Link>
        </p>
      </TestShell>
    );
  }

  // Verify the key belongs to the current org so we don't expose an oracle for
  // arbitrary keys. The widget endpoint itself still enforces origin checks.
  const widget = await withTenant(orgId, async (tx) =>
    tx.widgetKey.findFirst({
      where: { publicKey: key, status: "active" },
      select: { id: true, publicKey: true },
    }),
  );

  if (!widget) {
    return (
      <TestShell>
        <h1 className="ph__title" style={{ fontSize: 24 }}>
          Key not found
        </h1>
        <p className="dim" style={{ marginTop: 8, fontSize: 14, lineHeight: 1.6 }}>
          That widget key isn&apos;t active for your organization.{" "}
          <Link href="/ai" style={linkStyle}>
            Manage keys →
          </Link>
        </p>
      </TestShell>
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const snippet = `<script src="${appUrl}/widget?key=${widget.publicKey}" async></script>`;

  return (
    <TestShell>
      <div className="col" style={{ gap: 18 }}>
        <div>
          <div className="ph__kicker">Chatbot tester</div>
          <h1 className="ph__title" style={{ fontSize: 28 }}>
            Try the chatbot
          </h1>
          <p className="ph__sub">
            The widget loaded in the bottom-right corner is exactly what your website
            visitors see. Ask it anything that your knowledge base should know.
          </p>
        </div>

        <section className="ds-card">
          <div className="ds-card__head">
            <h2 className="ds-card__title">Suggested test queries</h2>
          </div>
          <div className="ds-card__body" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                display: "flex",
                flexDirection: "column",
                gap: 6,
                color: "var(--ink-2)",
              }}
            >
              <li>&ldquo;What are your hours?&rdquo;</li>
              <li>&ldquo;How much does a haircut cost?&rdquo;</li>
              <li>&ldquo;Where are you located?&rdquo;</li>
              <li>
                A question your knowledge base <strong>doesn&apos;t</strong> cover the AI should
                gracefully say it doesn&apos;t know and offer to escalate.
              </li>
            </ul>
            <p className="dim" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
              Prefer the in-app tester (with answer ratings that feed your Learning Monitor)?{" "}
              <Link href="/ai?tab=test" style={linkStyle}>
                Open the Test AI tab →
              </Link>
            </p>
          </div>
        </section>

        <section className="ds-card">
          <div className="ds-card__head">
            <h2 className="ds-card__title">Embed snippet</h2>
            <span className="chip chip--pri">Copy to your site</span>
          </div>
          <div className="ds-card__body">
            <pre
              style={{
                margin: 0,
                padding: "14px 16px",
                background: "var(--ink)",
                color: "#e2e8f0",
                borderRadius: "var(--r-sm)",
                fontFamily: "var(--f-mono)",
                fontSize: 12,
                lineHeight: 1.6,
                overflowX: "auto",
                whiteSpace: "pre",
              }}
            >
              <code>{snippet}</code>
            </pre>
            <p className="dim" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
              When you embed this script tag on any HTML page, the chatbot button appears in the
              bottom-right corner.
            </p>
          </div>
        </section>
      </div>

      {/* Load the widget exactly as a customer would */}
      <Script src={`${appUrl}/widget?key=${widget.publicKey}`} strategy="afterInteractive" />
    </TestShell>
  );
}

function TestShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          className="row"
          style={{
            maxWidth: 720,
            margin: "0 auto",
            height: "var(--h-tb)",
            padding: "0 24px",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/ai"
            className="row"
            style={{ gap: 10, textDecoration: "none", color: "inherit" }}
          >
            <span className="sb__mark" aria-hidden style={{ width: 30, height: 30, fontSize: 15 }}>
              R
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.015em" }}>
              Chatbot test
            </span>
          </Link>
          <Link href="/ai" className="btn btn--sm">
            <Icon name="chevL" size={12} />
            AI settings
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "36px 24px 64px" }}>
        {children}
      </main>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--pri)",
  textDecoration: "none",
  fontWeight: 500,
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--f-mono)",
  fontSize: 12.5,
  background: "var(--surface-3)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "1px 6px",
};
