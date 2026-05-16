import Link from "next/link";
import Script from "next/script";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

/**
 * Test page for the embedded chatbot.
 * Renders the widget loader script with the given public key so the founder
 * can interact with the AI without setting up an external host.
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
      <main className="container py-12 max-w-2xl">
        <h1 className="text-2xl font-bold">Test the chatbot</h1>
        <p className="mt-2 text-muted-foreground">
          Missing <code>?key=...</code> query parameter.{" "}
          <Link href="/ai" className="text-primary hover:underline">
            Go to AI settings →
          </Link>
        </p>
      </main>
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
      <main className="container py-12 max-w-2xl">
        <h1 className="text-2xl font-bold">Key not found</h1>
        <p className="mt-2 text-muted-foreground">
          That widget key isn't active for your organization.{" "}
          <Link href="/ai" className="text-primary hover:underline">
            Manage keys →
          </Link>
        </p>
      </main>
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/ai" className="text-xl font-bold">Repulabs · Chatbot test</Link>
          <Link href="/ai" className="text-sm text-muted-foreground hover:underline">
            ← AI settings
          </Link>
        </div>
      </header>

      <section className="container py-12 max-w-2xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Try the chatbot</h1>
          <p className="text-muted-foreground">
            The widget loaded in the bottom-right corner is exactly what your website
            visitors see. Ask it anything that your knowledge base should know.
          </p>
        </div>

        <div className="rounded-lg border bg-white p-6 text-sm space-y-3">
          <h2 className="font-semibold">Suggested test queries</h2>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>"What are your hours?"</li>
            <li>"How much does a haircut cost?"</li>
            <li>"Where are you located?"</li>
            <li>
              A question your knowledge base <strong>doesn't</strong> cover — the AI should
              gracefully say it doesn't know and offer to escalate.
            </li>
          </ul>
        </div>

        <div className="rounded-lg border bg-slate-900 text-slate-100 p-4 text-xs font-mono overflow-x-auto">
          {`<script src="${appUrl}/widget?key=${widget.publicKey}" async></script>`}
        </div>

        <p className="text-xs text-muted-foreground">
          When you embed this script tag on any HTML page, the chatbot button
          appears in the bottom-right corner.
        </p>
      </section>

      {/* Load the widget exactly as a customer would */}
      <Script src={`${appUrl}/widget?key=${widget.publicKey}`} strategy="afterInteractive" />
    </main>
  );
}
