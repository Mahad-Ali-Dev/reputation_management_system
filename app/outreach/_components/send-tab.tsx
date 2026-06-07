import { withTenant } from "@/lib/db/with-tenant";
import { SendComposer } from "./send-composer";

/**
 * Send Request panel (server). Loads establishments, saved templates, and the
 * org brand name/logo, then renders the client composer island.
 */
export async function SendTab({ orgId }: { orgId: string }) {
  const { establishments, templates, org } = await withTenant(orgId, async (tx) => {
    const [establishments, templates, org] = await Promise.all([
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      tx.outreachTemplate
        .findMany({
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          select: { id: true, name: true, channel: true, subject: true, body: true },
        })
        .catch(() => []),
      tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    ]);
    return { establishments, templates, org };
  });

  if (establishments.length === 0) {
    return (
      <div className="ds-card" style={{ padding: 40, textAlign: "center" }}>
        <p className="dim" style={{ fontSize: 13 }}>
          Add a business location first to send review requests.
        </p>
      </div>
    );
  }

  return (
    <div className="ds-card">
      <SendComposer
        establishments={establishments}
        templates={templates}
        businessName={org?.name ?? "Your Business"}
        logoUrl={org?.logoUrl ?? null}
      />
    </div>
  );
}
