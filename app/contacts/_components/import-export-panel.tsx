import { getConnectedProviders } from "@/lib/connections/status";
import { SEGMENTS } from "@/lib/contacts/segments";
import { CsvImporter } from "./csv-importer";
import { ShopifySyncCard } from "./shopify-sync-card";
import { ExportControls } from "./export-controls";

/**
 * Import / Export tab (server shell + client islands). Renders the CSV importer
 * (drag-drop + column-mapping + dedupe), the connection-gated Shopify sync card,
 * and export controls (all / current filter / a chosen segment → CSV). RSC-safe;
 * connection state is read server-side and handed to the gated island.
 */

export async function ImportExportPanel({ orgId }: { orgId: string }) {
  const connected = await getConnectedProviders(orgId);

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <CsvImporter />
        <ShopifySyncCard connected={connected.has("shopify")} />
      </div>
      <ExportControls segments={SEGMENTS.map((s) => ({ key: s.key, label: s.label }))} />
    </div>
  );
}
