import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { getSurveyTemplate } from "@/lib/surveys/templates";
import { notFound } from "next/navigation";
import { SurveyTemplateEditorClient } from "./editor";

/**
 * Template editor route (Module 11). Server-loads the template + business name,
 * then renders the two-column live-preview editor client component.
 */

export const dynamic = "force-dynamic";

export default async function SurveyTemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, org } = await getOrgContext();

  const template = await getSurveyTemplate(orgId, id);
  if (!template) notFound();

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["CRM", "Customer Feedback", "Templates", "Edit"]}>
      <PageHeader
        kicker="Live preview · updates as you type"
        title={template.name}
        description="Build your question set and branding on the left; the customer preview on the right updates in real time."
        breadcrumb={[
          { label: "Surveys", href: "/surveys" },
          { label: "Templates", href: "/surveys/templates" },
          { label: "Edit" },
        ]}
      />
      <SurveyTemplateEditorClient template={template} businessName={org.name ?? "your business"} />
    </AppShellServer>
  );
}
