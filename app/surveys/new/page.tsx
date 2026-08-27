import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { listCampaigns } from "@/lib/surveys/queries";
import { CreateWizard, type WizardContact, type WizardTemplate } from "../_components/create-wizard";

/**
 * Create Survey — the 3-step wizard host (Module 11). Fetches contacts (for
 * recipient selection), templates (existing campaigns), and the default
 * establishment, then renders the client wizard. The contacts read fail-soft on
 * an un-migrated DB → empty list (manual entry still works).
 */

export const dynamic = "force-dynamic";

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ contacts?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;

  // Deep-linked pre-selection from /contacts (?contacts=id,id,…).
  const preselectedIds = (sp.contacts ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    .slice(0, 500);

  const [contacts, campaigns, establishments] = await Promise.all([
    loadContacts(orgId),
    listCampaigns(orgId),
    withTenant(orgId, async (tx) =>
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      }),
    ).catch(() => [] as { id: string }[]),
  ]);

  // Ensure any pre-selected contact (with an email) is present in the list even
  // if it falls outside the default page — so the checkbox can be pre-checked.
  const mergedContacts =
    preselectedIds.length > 0 ? await mergePreselected(orgId, contacts, preselectedIds) : contacts;

  const templates: WizardTemplate[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    questionCount: 0, // count not needed here; editor shows full detail
  }));

  return (
    <AppShellServer topBar={<TopBar title="New Survey" />} crumbs={["Reputation", "Customer Feedback", "New"]}>
      <PageHeader
        kicker="Send in 3 steps"
        title="New survey"
        description="Pick who to ask, choose a template, then send or schedule. Promoters auto-route to leave a Google review; detractors land in your private inbox."
        breadcrumb={[{ label: "Surveys", href: "/surveys" }, { label: "New" }]}
      />
      <CreateWizard
        contacts={mergedContacts}
        templates={templates}
        defaultEstablishmentId={establishments[0]?.id}
        preselectedContactIds={preselectedIds}
      />
    </AppShellServer>
  );
}

/** Fetch any pre-selected contacts (with email) missing from the loaded list. */
async function mergePreselected(
  orgId: string,
  contacts: WizardContact[],
  ids: string[],
): Promise<WizardContact[]> {
  const have = new Set(contacts.map((c) => c.id));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length === 0) return contacts;
  try {
    const rows = await withTenant(orgId, async (tx) =>
      tx.contact.findMany({
        where: { id: { in: missing }, email: { not: null } },
        select: { id: true, name: true, email: true },
      }),
    );
    const extra: WizardContact[] = rows
      .filter((c): c is { id: string; name: string | null; email: string } => !!c.email)
      .map((c) => ({ id: c.id, name: c.name, email: c.email }));
    return [...extra, ...contacts];
  } catch {
    return contacts;
  }
}

/** Contacts with a valid email for recipient selection. Fail-soft → []. */
async function loadContacts(orgId: string): Promise<WizardContact[]> {
  try {
    return await withTenant(orgId, async (tx) => {
      const rows = await tx.contact.findMany({
        where: { email: { not: null } },
        select: { id: true, name: true, email: true },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return rows
        .filter((c): c is { id: string; name: string | null; email: string } => !!c.email)
        .map((c) => ({ id: c.id, name: c.name, email: c.email }));
    });
  } catch {
    return [];
  }
}
