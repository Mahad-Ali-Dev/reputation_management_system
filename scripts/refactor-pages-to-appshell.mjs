#!/usr/bin/env node
/**
 * One-shot refactor: replace per-page `<main>` + `<header>` + `<section>` chrome
 * with `<AppShellServer>` + `<TopBar>` + `<PageHeader>` + `<div>`.
 *
 * Idempotent: skips files that already use AppShellServer.
 *
 * Each page's content inside the wrapper is preserved verbatim. We only swap
 * the outer chrome.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// All authenticated pages that still need refactoring (38 files).
const FILES = [
  "app/phone/page.tsx",
  "app/phone/campaigns/page.tsx",
  "app/phone/booking/page.tsx",
  "app/phone/voices/page.tsx",
  "app/phone/calls/[id]/page.tsx",
  "app/phone/setup/page.tsx",
  "app/phone/assistant/page.tsx",
  "app/settings/account/page.tsx",
  "app/support/comments/page.tsx",
  "app/social/posts/page.tsx",
  "app/support/chat-automation/page.tsx",
  "app/support/customers/page.tsx",
  "app/support/live-chat/page.tsx",
  "app/support/dms/page.tsx",
  "app/connections/page.tsx",
  "app/contacts/page.tsx",
  "app/subscription/page.tsx",
  "app/reviews/dispute/page.tsx",
  "app/support/blacklist/page.tsx",
  "app/ai/training/page.tsx",
  "app/faqs/page.tsx",
  "app/outreach/templates/page.tsx",
  "app/outreach/send/page.tsx",
  "app/surveys/coupons/page.tsx",
  "app/reviews/[id]/page.tsx",
  "app/ai/page.tsx",
  "app/outreach/bulk/page.tsx",
  "app/analytics/page.tsx",
  "app/surveys/[id]/page.tsx",
  "app/surveys/new/page.tsx",
  "app/surveys/page.tsx",
  "app/outreach/page.tsx",
  "app/hardware/page.tsx",
  "app/establishments/page.tsx",
  "app/establishments/new/page.tsx",
  "app/hardware/orders/[id]/page.tsx",
  "app/establishments/[id]/page.tsx",
];

// Page-specific titles + descriptions. Falls back to "(Page)" if not listed.
const PAGE_META = {
  "app/phone/page.tsx": { title: "AI Phone Receptionist", description: "Claude answers your phone 24/7.", breadcrumb: [{ label: "Home", href: "/dashboard" }, { label: "AI Phone" }] },
  "app/phone/campaigns/page.tsx": { title: "Outbound campaigns", description: "AI-powered review request, NPS survey, and win-back calls.", breadcrumb: [{ label: "AI Phone", href: "/phone" }, { label: "Campaigns" }] },
  "app/phone/booking/page.tsx": { title: "Booking integration", description: "Let the AI book appointments directly into your calendar.", breadcrumb: [{ label: "AI Phone", href: "/phone" }, { label: "Booking" }] },
  "app/phone/voices/page.tsx": { title: "Voice cloning", description: "Replace stock voices with a custom ElevenLabs clone.", breadcrumb: [{ label: "AI Phone", href: "/phone" }, { label: "Voices" }] },
  "app/phone/calls/[id]/page.tsx": { title: "Call detail", description: "Full transcript + lead info.", breadcrumb: [{ label: "AI Phone", href: "/phone" }, { label: "Call" }] },
  "app/phone/setup/page.tsx": { title: "Phone number setup", description: "Connect a Twilio number to start receiving calls.", breadcrumb: [{ label: "AI Phone", href: "/phone" }, { label: "Setup" }] },
  "app/phone/assistant/page.tsx": { title: "Phone assistant config", description: "How your AI receptionist sounds and behaves.", breadcrumb: [{ label: "AI Phone", href: "/phone" }, { label: "Assistant" }] },
  "app/settings/account/page.tsx": { title: "Account Settings", description: "Business profile, logo, owner info.", breadcrumb: [{ label: "Settings" }, { label: "Account" }] },
  "app/support/comments/page.tsx": { title: "Comment Inbox", description: "Public comments from Facebook + Instagram pages.", breadcrumb: [{ label: "Customer Hub", href: "/support/comments" }, { label: "Comments" }] },
  "app/social/posts/page.tsx": { title: "Social Posts", description: "Create + schedule posts across Facebook, Instagram, X, LinkedIn.", breadcrumb: [{ label: "Social" }, { label: "Posts" }] },
  "app/support/chat-automation/page.tsx": { title: "Chat Automation", description: "Customize when your chatbot speaks first.", breadcrumb: [{ label: "Customer Hub" }, { label: "Chat Automation" }] },
  "app/support/customers/page.tsx": { title: "Live Chat Visitors", description: "Track chatbot visitors in real time.", breadcrumb: [{ label: "Customer Hub" }, { label: "Visitors" }] },
  "app/support/live-chat/page.tsx": { title: "LiveChat Inbox", description: "Real-time conversations from your website chatbot widget.", breadcrumb: [{ label: "Customer Hub" }, { label: "Live Chat" }] },
  "app/support/dms/page.tsx": { title: "DM Inbox", description: "Direct messages from Facebook, Instagram, email.", breadcrumb: [{ label: "Customer Hub" }, { label: "DMs" }] },
  "app/connections/page.tsx": { title: "Connections", description: "Plug Repulabs into the tools you already use.", breadcrumb: [{ label: "Settings" }, { label: "Connections" }] },
  "app/contacts/page.tsx": { title: "Contacts", description: "Cross-channel customer pool.", breadcrumb: [{ label: "Outreach", href: "/outreach" }, { label: "Contacts" }] },
  "app/subscription/page.tsx": { title: "Subscription", description: "Pick a plan that fits your business.", breadcrumb: [{ label: "Settings" }, { label: "Subscription" }] },
  "app/reviews/dispute/page.tsx": { title: "Dispute Reviews", description: "AI-flagged reviews that may be eligible for dispute.", breadcrumb: [{ label: "Reviews", href: "/reviews" }, { label: "Disputes" }] },
  "app/support/blacklist/page.tsx": { title: "Keyword Blacklist", description: "Comments matching active keywords are auto-hidden.", breadcrumb: [{ label: "Customer Hub" }, { label: "Blacklist" }] },
  "app/ai/training/page.tsx": { title: "AI Training & Customization", description: "Teach Repulabs about your business.", breadcrumb: [{ label: "AI", href: "/ai" }, { label: "Training" }] },
  "app/faqs/page.tsx": { title: "FAQs", description: "Used by the chatbot when no document matches.", breadcrumb: [{ label: "AI" }, { label: "FAQs" }] },
  "app/outreach/templates/page.tsx": { title: "Outreach Templates", description: "Save reusable email + SMS bodies.", breadcrumb: [{ label: "Outreach", href: "/outreach" }, { label: "Templates" }] },
  "app/outreach/send/page.tsx": { title: "Send One-Off Review Request", description: "Live preview as you compose.", breadcrumb: [{ label: "Outreach", href: "/outreach" }, { label: "Send" }] },
  "app/surveys/coupons/page.tsx": { title: "Survey Coupons", description: "One-time codes issued to promoters.", breadcrumb: [{ label: "Surveys", href: "/surveys" }, { label: "Coupons" }] },
  "app/reviews/[id]/page.tsx": { title: "Review", breadcrumb: [{ label: "Reviews", href: "/reviews" }, { label: "Detail" }] },
  "app/ai/page.tsx": { title: "AI Chatbot", description: "Upload FAQ, get a JS snippet, embed it on your website.", breadcrumb: [{ label: "AI" }, { label: "Chatbot" }] },
  "app/outreach/bulk/page.tsx": { title: "Bulk Send", description: "Upload a CSV of past customers.", breadcrumb: [{ label: "Outreach", href: "/outreach" }, { label: "Bulk" }] },
  "app/analytics/page.tsx": { title: "Analytics", description: "Last 30 days · auto-refreshed.", breadcrumb: [{ label: "Home", href: "/dashboard" }, { label: "Analytics" }] },
  "app/surveys/[id]/page.tsx": { title: "Survey Campaign", breadcrumb: [{ label: "Surveys", href: "/surveys" }, { label: "Detail" }] },
  "app/surveys/new/page.tsx": { title: "New Survey Campaign", breadcrumb: [{ label: "Surveys", href: "/surveys" }, { label: "New" }] },
  "app/surveys/page.tsx": { title: "Surveys", description: "NPS campaigns with smart routing.", breadcrumb: [{ label: "Home", href: "/dashboard" }, { label: "Surveys" }] },
  "app/outreach/page.tsx": { title: "Outreach", description: "Review requests via email + SMS.", breadcrumb: [{ label: "Home", href: "/dashboard" }, { label: "Outreach" }] },
  "app/hardware/page.tsx": { title: "Review Stands", description: "Physical QR + NFC stands for your front desk.", breadcrumb: [{ label: "Home", href: "/dashboard" }, { label: "Hardware" }] },
  "app/establishments/page.tsx": { title: "Establishments", description: "Locations you manage.", breadcrumb: [{ label: "Home", href: "/dashboard" }, { label: "Establishments" }] },
  "app/establishments/new/page.tsx": { title: "Add Establishment", breadcrumb: [{ label: "Establishments", href: "/establishments" }, { label: "New" }] },
  "app/hardware/orders/[id]/page.tsx": { title: "Hardware Order", breadcrumb: [{ label: "Review Stands", href: "/hardware" }, { label: "Order" }] },
  "app/establishments/[id]/page.tsx": { title: "Establishment", breadcrumb: [{ label: "Establishments", href: "/establishments" }, { label: "Detail" }] },
};

const REQUIRED_IMPORTS = `import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
`;

// Match the page's <main>...<header>...</header><section ...> opener.
// Greedy with [\s\S]*? to allow any header content. Captures the section className.
const OPENER_RE =
  /<main className="min-h-screen bg-slate-50">\s*<header className="border-b bg-white">[\s\S]*?<\/header>\s*<section className="container py-10[^"]*"\s*(?:[^>]*)>/m;

// Match the closing </section></main>
const CLOSER_RE = /<\/section>\s*<\/main>\s*\);\s*\}\s*$/m;

let touched = 0;
let skipped = 0;

for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.log(`  ⚠ not found: ${rel}`);
    skipped++;
    continue;
  }
  let content = fs.readFileSync(abs, "utf8");

  if (content.includes("<AppShellServer")) {
    console.log(`  ✓ already refactored: ${rel}`);
    skipped++;
    continue;
  }

  if (!OPENER_RE.test(content)) {
    console.log(`  ⚠ opener pattern not matched: ${rel}`);
    skipped++;
    continue;
  }

  const meta = PAGE_META[rel] ?? { title: "Page", breadcrumb: [{ label: "Home", href: "/dashboard" }] };
  const breadcrumbJson = JSON.stringify(meta.breadcrumb ?? [{ label: "Home", href: "/dashboard" }]);
  const descAttr = meta.description ? `\n        description=${JSON.stringify(meta.description)}` : "";

  // 1. Add imports if missing (place right after last "import" line)
  if (!content.includes('from "@/components/app-shell-server"')) {
    const lastImport = content.lastIndexOf("import ");
    const lineEnd = content.indexOf("\n", lastImport) + 1;
    content = content.slice(0, lineEnd) + REQUIRED_IMPORTS + content.slice(lineEnd);
  }

  // 2. Swap opener
  const opener = `<AppShellServer topBar={<TopBar title=${JSON.stringify(meta.title)} />}>
      <PageHeader
        title=${JSON.stringify(meta.title)}${descAttr}
        breadcrumb={${breadcrumbJson}}
      />

      <div className="space-y-6">`;
  content = content.replace(OPENER_RE, opener);

  // 3. Swap closer
  content = content.replace(CLOSER_RE, `</div>
    </AppShellServer>
  );
}
`);

  fs.writeFileSync(abs, content);
  touched++;
  console.log(`  ✓ refactored: ${rel}`);
}

console.log(`\n${touched} refactored · ${skipped} skipped (already done or pattern mismatch)`);
