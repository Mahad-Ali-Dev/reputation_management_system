import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { formatAddress } from "@/lib/outreach/merge-tags";
import { notFound } from "next/navigation";
import { TemplateEditor } from "./_components/template-editor";

/**
 * Full-page Template Editor (the marquee ENHANCE) — handles both `new` and an
 * existing template id. NOT a modal (AC). Breadcrumb + two-column editor island.
 *
 * Logo resolution order (the spec's "auto-pull from Establishment"):
 *   template.logoUrl ?? establishment.imageUrl ?? organization.logoUrl ?? null
 * ("Change logo" deep-links to /establishments/[id], where imageUrl is edited.)
 */
export const dynamic = "force-dynamic";

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId, org } = await getOrgContext();
  const { id } = await params;
  const isNew = id === "new";

  const { template, establishments } = await withTenant(orgId, async (tx) => {
    const [template, establishments] = await Promise.all([
      isNew
        ? Promise.resolve(null)
        : tx.outreachTemplate
            .findUnique({ where: { id } })
            .catch(() => null),
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, imageUrl: true, address: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return { template, establishments };
  });

  if (!isNew && !template) notFound();

  // Resolve the default establishment for logo/address sample data.
  const firstEstab = establishments[0] ?? null;
  const resolvedLogo = template?.logoUrl ?? firstEstab?.imageUrl ?? org.logoUrl ?? null;
  const sampleAddress = formatAddress(firstEstab?.address);

  const initial = {
    id: template?.id ?? null,
    name: template?.name ?? "",
    channel: (template?.channel === "sms" ? "sms" : "email") as "email" | "sms",
    subject: template?.subject ?? "",
    body:
      template?.body ??
      "Hi {{first_name}},\n\nThanks for choosing {{business_name}}! If you have a moment, we'd love your feedback:\n\n{{review_link}}",
    logoUrl: resolvedLogo ?? "",
    isDefault: template?.isDefault ?? false,
  };

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Review Outreach", "Templates"]}>
      <PageHeader
        title={isNew ? "New template" : initial.name || "Edit template"}
        description="Edit on the left, preview exactly what the recipient sees on the right."
        breadcrumb={[
          { label: "Review Requests", href: "/outreach" },
          { label: "Templates", href: "/outreach?tab=templates" },
          { label: isNew ? "New" : initial.name || "Edit" },
        ]}
      />
      <TemplateEditor
        initial={initial}
        businessName={org.name}
        sampleAddress={sampleAddress}
        changeLogoHref={firstEstab ? `/establishments/${firstEstab.id}` : "/settings/brand"}
      />
    </AppShellServer>
  );
}
