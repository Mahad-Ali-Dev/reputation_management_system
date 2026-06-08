"use client";

import { GettingStarted } from "@/components/getting-started";

/**
 * Surveys zero-state checklist (Module 11). A thin wrapper around the shared
 * `GettingStarted` primitive — passes the survey-specific 4-step list with
 * server-derived `done` flags. Dismissal (local + global) is handled by the
 * primitive; we namespace the local key with `surveys`.
 */
export function SurveysGettingStarted({
  facts,
}: {
  facts: {
    hasCampaign: boolean;
    hasContacts: boolean;
    hasSent: boolean;
    hasAutomation: boolean;
  };
}) {
  return (
    <GettingStarted
      checklistId="surveys"
      title="Get started with surveys"
      steps={[
        {
          key: "template",
          title: "Create your first survey",
          body: "Start with a 1-question NPS survey. Promoters auto-route to leave a Google review; detractors land in your private inbox.",
          done: facts.hasCampaign,
          cta: { label: "Create survey", href: "/surveys/new" },
        },
        {
          key: "contacts",
          title: "Add contacts",
          body: "Import or sync the customers you want to survey.",
          done: facts.hasContacts,
          cta: { label: "Add contacts", href: "/contacts" },
        },
        {
          key: "send",
          title: "Send your first survey",
          body: "Pick recipients and send. Each gets a single-use link that expires in 14 days.",
          done: facts.hasSent,
          cta: { label: "Send a survey", href: "/surveys/new" },
        },
        {
          key: "automation",
          title: "Set up an automation",
          body: "Send surveys automatically after a purchase, a visit, or an order from a connected system.",
          done: facts.hasAutomation,
          cta: { label: "Add automation", href: "/surveys?tab=automations" },
        },
      ]}
    />
  );
}
