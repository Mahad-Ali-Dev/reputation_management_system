import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { ChevronLeft, CircleHelp, Code2, MessageSquareText, MousePointerClick } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { CopySnippet } from "./copy-snippet";
import "./chatbot-test.css";

export const dynamic = "force-dynamic";

/**
 * Chatbot tester (Apple look). Loads the real widget script with the given
 * public key, exactly as a customer's website would, so the owner can try it
 * without setting up an external host.
 *
 * Standalone chrome (its own slim frosted header, not the app shell).
 * Auth-gated: the key must belong to the current org, so this page is never an
 * oracle for arbitrary keys. (The widget's own origin check always allows the
 * app's origin, see lib/ai/widget-origin.ts, so the tester works even when the
 * key has an allowed-websites list.)
 */

const TRY = [
  "What are your opening hours?",
  "How much does it cost?",
  "Where are you located?",
  "Can I book an appointment?",
];

export default async function AiTestPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const { key } = await searchParams;

  const widget = key
    ? await withTenant(orgId, async (tx) =>
        tx.widgetKey.findFirst({
          where: { publicKey: key, status: "active" },
          select: { id: true, publicKey: true },
        }),
      )
    : null;

  if (!widget) {
    return (
      <TestShell>
        <div className="ct-missing">
          <span className="ct-badge" aria-hidden="true">
            <CircleHelp size={28} strokeWidth={1.7} />
          </span>
          <h1 className="ct-title ct-title--sm">
            {key ? "That key isn't active" : "No chatbot key"}
          </h1>
          <p className="ct-sub">
            {key
              ? "This widget key doesn't belong to your workspace, or it was revoked."
              : "Open the tester from AI Brain → Chat widget so we know which key to load."}
          </p>
          <Link href="/ai?tab=widget" className="ct-pill ct-pill--pri">
            Go to Chat widget
          </Link>
        </div>
      </TestShell>
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const snippet = `<script src="${appUrl}/widget?key=${widget.publicKey}" async></script>`;

  return (
    <TestShell>
      <header className="ct-hero">
        <span className="ct-eyebrow">Chatbot tester</span>
        <h1 className="ct-title">
          See it the way <em>your customers do.</em>
        </h1>
        <p className="ct-sub">
          This is the live chatbot, exactly as it appears on your website. Open it from the bottom
          right corner and ask it anything.
        </p>
      </header>

      <div className="ct-grid">
        <section className="ct-card" aria-labelledby="ct-try">
          <span className="ct-icon" aria-hidden="true">
            <MessageSquareText size={20} strokeWidth={1.8} />
          </span>
          <h2 id="ct-try" className="ct-card__title">
            Try asking
          </h2>
          <ul className="ct-list">
            {TRY.map((q) => (
              <li key={q}>&ldquo;{q}&rdquo;</li>
            ))}
            <li className="ct-list__note">
              And something it shouldn&apos;t know. A good chatbot says so and offers to put you in
              touch.
            </li>
          </ul>
          <p className="ct-foot">
            Want answer ratings and teaching? <Link href="/ai?tab=test">Use the in-app tester</Link>
          </p>
        </section>

        <section className="ct-card" aria-labelledby="ct-embed">
          <span className="ct-icon" aria-hidden="true">
            <Code2 size={20} strokeWidth={1.8} />
          </span>
          <h2 id="ct-embed" className="ct-card__title">
            Add it to your website
          </h2>
          <p className="ct-card__sub">
            Paste this one line before the closing <code>&lt;/body&gt;</code> tag on any page.
          </p>
          <CopySnippet snippet={snippet} />
        </section>
      </div>

      <p className="ct-hint">
        <MousePointerClick size={16} strokeWidth={1.8} aria-hidden="true" />
        The chat button is in the bottom-right corner of this page.
      </p>

      {/* Load the widget exactly as a customer would */}
      <Script src={`${appUrl}/widget?key=${widget.publicKey}`} strategy="afterInteractive" />
    </TestShell>
  );
}

function TestShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ct">
      <header className="ct-bar">
        <div className="ct-bar__in">
          <Link href="/ai?tab=widget" className="ct-back">
            <ChevronLeft size={18} strokeWidth={2} />
            AI Brain
          </Link>
          <span className="ct-bar__title">Chatbot tester</span>
          <span className="ct-bar__spacer" aria-hidden="true" />
        </div>
      </header>
      <main className="ct-main">{children}</main>
    </div>
  );
}
