import { getConnectedProviders } from "@/lib/connections/status";
import { SEGMENTS } from "@/lib/contacts/segments";
import { CsvImporter } from "./csv-importer";
import { ShopifySyncCard } from "./shopify-sync-card";
import { ExportControls } from "./export-controls";

/**
 * Import / Export tab (server shell + client islands), re-skinned to the kit.
 * Two top cards (CSV importer + connection-gated Shopify sync) then a
 * full-width export card. All interactivity lives in the client islands;
 * connection state is read server-side and handed to the gated Shopify island.
 * RSC-safe; no live paid calls in default code paths (stubbed Shopify sync).
 */

export async function ImportExportPanel({ orgId }: { orgId: string }) {
  const connected = await getConnectedProviders(orgId);

  return (
    <div>
      <div className="cd-ie-grid" style={{ alignItems: "stretch" }}>
        <CsvImporter />
        {/* <ShopifySyncCard connected={connected.has("shopify")} /> */}
        <ExportControls
          segments={SEGMENTS.map((s) => ({ key: s.key, label: s.label }))}
        />
      </div>
    </div>
  );
}
