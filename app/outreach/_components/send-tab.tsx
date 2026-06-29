import { logger } from "@/lib/logger";
import { withTenant } from "@/lib/db/with-tenant";
import { SendComposer } from "./send-composer";

/**
 * Send Request panel (server). Loads establishments, saved templates, and the
 * org brand name/logo, then renders the client composer island.
 *
 * The templates read runs in its OWN tenant transaction: a failed query
 * inside a Postgres transaction aborts the WHOLE transaction (25P02), so the
 * old in-transaction `.catch(() => [])` didn't actually contain an unmigrated
 * `outreach_templates` table — the sibling queries then failed too and the
 * panel threw a Server Components render error (bug 010 in the June 2026
 * assessment). Isolated, a failure degrades to "no templates".
 */
export async function SendTab({ orgId }: { orgId: string }) {
  const { establishments, org } = await withTenant(orgId, async (tx) => {
    const [establishments, org] = await Promise.all([
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    ]);
    return { establishments, org };
  });

  let templates: { id: string; name: string; channel: string; subject: string | null; body: string }[] = [];
  try {
    templates = await withTenant(orgId, (tx) =>
      tx.outreachTemplate.findMany({
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: { id: true, name: true, channel: true, subject: true, body: true },
      }),
    );
  } catch (err) {
    logger.warn({
      orgId,
      event: "outreach.send_tab.templates_failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (establishments.length === 0) {
    return (
      <div className="rr-card" style={{ padding: 40, textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "var(--rr-muted)" }}>
          Add a business location first to send review requests.
        </p>
      </div>
    );
  }

  return (
    <SendComposer
      establishments={establishments}
      templates={templates}
      businessName={org?.name ?? "Your Business"}
      logoUrl={org?.logoUrl ?? null}
    />
  );
}
