import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { Icon } from "@/components/shell/icon";
import { getOrgContext } from "@/lib/auth/org-context";
// Side-effect import: installs the AiAssist escalation hook so low-confidence
// inbox AI is routed to a flagged thread. Importing the barrel registers it.
import "@/lib/inbox";
import Link from "next/link";
import { InboxShell, type InboxSearchParams } from "./_components/inbox-shell";

/**
 * Unified Inbox — the tabbed customer hub (Module 09, Wave 3c).
 *
 * SERVER component: reads org context, renders the app chrome + page header, then
 * delegates to <InboxShell> (also server) which renders the persistent tab nav
 * (a small client island) plus the active tab's server panel. All interactivity
 * lives in `'use client'` islands under `_components/` — this file + the shell do
 * DB reads only (RSC-safe; no onClick here).
 *
 * Phase 1 (this build) ships the SHELL + Conversations + AI Suggest. The Comments
 * and Moderation panels are built by the sibling coder and rendered by the shell
 * from their exact paths. Live Chat / Automation / Analytics tabs deep-link to
 * the existing pages until phase 3.
 */

export const dynamic = "force-dynamic";

export default async function SupportInboxPage({
  searchParams,
}: {
  searchParams: Promise<InboxSearchParams>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;

  return (
    <AppShellServer topBar={<TopBar title="Unified Inbox" />} crumbs={["Engagement", "Unified Inbox"]}>
      <PageHeader
        kicker="Real-time customer hub"
        title="Unified Inbox"
        description="DMs, comments, website chat, SMS, email, and phone callbacks in one queue."
        breadcrumb={[{ label: "Engagement" }, { label: "Unified Inbox" }]}
        actions={
          <Link href="/connections" className="btn btn--sm">
            <Icon name="plug" size={13} />
            Connect channels
          </Link>
        }
      />

      <InboxShell orgId={orgId} searchParams={sp} />
    </AppShellServer>
  );
}
