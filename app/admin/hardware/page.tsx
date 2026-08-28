import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ActionLink, Badge, KpiCard, THead, TableCard, Td, Th } from "@/components/admin/admin-ui";
import { Icon } from "@/components/shell/icon";
import { prisma } from "@/lib/db/client";

/**
 * Admin hardware page — bulk QR/NFC generation for factory production runs.
 *
 * Workflow:
 *   1. Pick product SKU + kind (QR plaque or NFC card) + quantity (1-500)
 *   2. Submit form → /api/admin/hardware/batch mints devices, persists an
 *      envelope-encrypted batch row, and STREAMS a ZIP back (incrementally, so
 *      nginx never trips its read timeout — the old 502-on-500 bug).
 *   3. Admin saves the ZIP (manifest + QR/NFC encode assets per unit).
 *
 * The activation codes are SHA-256-hashed on the device row — the plaintext only
 * exists in the ZIP. To survive a lost download, the batch row keeps the codes
 * ENVELOPE-ENCRYPTED for a one-time re-download (see the "Recent batches" list
 * below). After the first re-download (or the TTL) the blob is purged and the
 * codes are gone for good.
 */

export const dynamic = "force-dynamic";

type BatchRow = {
  id: string;
  createdAt: Date;
  productSku: string;
  productKind: string;
  quantity: number;
  status: string;
  downloadCount: number;
  notes: string | null;
  createdByAdminId: string | null;
  expiresAt: Date | null;
  canRedownload: boolean;
};

/**
 * Load recent batches from hardware_batches. Fails soft to an empty list if the
 * table isn't migrated yet (build rule: no `prisma migrate` — the founder runs
 * the SQL manually post-deploy), so the page still renders + generates batches.
 */
async function loadRecentBatches(): Promise<{ rows: BatchRow[]; tableMissing: boolean }> {
  try {
    const batches = await prisma.hardwareBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        createdAt: true,
        productSku: true,
        productKind: true,
        quantity: true,
        status: true,
        downloadCount: true,
        notes: true,
        createdByAdminId: true,
        expiresAt: true,
        // We don't select encryptedCodes (sensitive + large) — derive
        // re-downloadability from status + expiresAt instead.
      },
    });
    const now = Date.now();
    return {
      tableMissing: false,
      rows: batches.map((b) => ({
        ...b,
        canRedownload:
          b.status === "ready" && (!b.expiresAt || b.expiresAt.getTime() > now),
      })),
    };
  } catch (err) {
    if (isMissingRelation(err)) return { rows: [], tableMissing: true };
    throw err;
  }
}

function isMissingRelation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703") return true;
  const metaCode = (err as { meta?: { code?: string } } | null)?.meta?.code;
  return metaCode === "42P01" || metaCode === "42703";
}

export default async function AdminHardwarePage() {
  const [products, unactivated, activeCount, retiredCount, recent] = await Promise.all([
    prisma.hardwareProduct.findMany({
      where: { isActive: true },
      select: {
        sku: true,
        name: true,
        priceCents: true,
        currency: true,
      },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.device.count({ where: { status: "unactivated" } }),
    prisma.device.count({ where: { status: "active" } }),
    prisma.device.count({ where: { status: "retired" } }),
    loadRecentBatches(),
  ]);

  return (
    <>
      <AdminPageHeader
        title="Hardware batches"
        description="Generate QR + NFC activation codes in bulk for factory production. Downloads as a single ZIP streamed incrementally so even 500-unit runs never time out with the manifest and per-unit QR/NFC assets ready for the factory."
        actions={
          <ActionLink href="/admin/audit?action=hardware.batch" icon="lock">
            View batch audit log
          </ActionLink>
        }
      />

      {/* KPI strip */}
      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard
          l="Unactivated inventory"
          v={unactivated.toLocaleString()}
          d="QRs/NFC generated, not yet redeemed"
        />
        <KpiCard
          l="Active units"
          v={activeCount.toLocaleString()}
          d="redeemed + redirecting"
          up={activeCount > 0}
        />
        <KpiCard l="Retired" v={retiredCount.toLocaleString()} d="soft-deleted by tenants" />
        <KpiCard
          l="Batches generated"
          v={recent.rows.length.toLocaleString()}
          d="last 15 shown below"
        />
      </div>

      {/* CRITICAL WARNING */}
      <div
        className="ds-card"
        style={{
          padding: "12px 16px",
          marginBottom: 14,
          background: "#fffbeb",
          border: "1px solid #fde68a",
          color: "#92400e",
          fontSize: 12.5,
          lineHeight: 1.55,
        }}
      >
        <strong>⚠ Save the ZIP immediately.</strong> Activation codes are SHA-256 hashed on the
        device row the plaintext only lives in the ZIP. The batch keeps an encrypted copy so you
        can re-download <strong>once</strong> from the list below if the original download is lost;
        after that re-download (or after 7 days) the codes are purged and unrecoverable.
      </div>

      {/* Generation form + product list */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div className="ds-card" style={{ padding: 18 }}>
          <h3 className="ds-card__title">Generate a new batch</h3>
          <p
            style={{
              fontSize: 13,
              color: "var(--rl-muted)",
              marginTop: 6,
              marginBottom: 16,
              lineHeight: 1.55,
            }}
          >
            Pick a product SKU, the unit kind, and quantity. We'll mint that many{" "}
            <code className="mono" style={chipStyle}>
              Device
            </code>{" "}
            rows with status=
            <code className="mono" style={chipStyle}>
              unactivated
            </code>
            , persist an encrypted batch record for re-download, then stream a ZIP back to your
            browser.
          </p>

          {/* Native HTML form: browser-native download on submit; no JS needed. */}
          <form
            method="post"
            action="/api/admin/hardware/batch"
            encType="application/x-www-form-urlencoded"
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <FormField label="Product SKU">
              <select name="productSku" required style={inputStyle} defaultValue="">
                <option value="" disabled>
                  Pick a product
                </option>
                {products.length === 0 ? (
                  <option value="" disabled>
                    No active products in catalog
                  </option>
                ) : (
                  products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.sku} {p.name} (${(p.priceCents / 100).toFixed(2)} {p.currency})
                    </option>
                  ))
                )}
              </select>
              {products.length === 0 ? (
                <span style={hintStyle}>
                  No active hardware products. Seed one via Prisma:{" "}
                  <code className="mono" style={chipStyle}>
                    INSERT INTO hardware_products (sku, name, price_cents) VALUES ('plaque-brass',
                    'Brass Plaque', 4900)
                  </code>
                </span>
              ) : null}
            </FormField>

            <FormField label="Product kind">
              <select name="productKind" required style={inputStyle} defaultValue="qr">
                <option value="qr">QR plaque print-ready PNG + SVG per unit</option>
                <option value="nfc">NFC card encode URL manifest + small QR companion</option>
                <option value="wifi">WiFi NFC card same encode kit as NFC</option>
                <option value="multi_platform">
                  Multi-platform QR picker QR with the multi glyph
                </option>
              </select>
              <span style={hintStyle}>
                <strong>QR</strong> emits 1024px print PNGs + vector SVGs. <strong>NFC/WiFi</strong>{" "}
                emit a manifest with the per-card encode URL (write it to the chip) plus a small QR
                companion no heavy PNGs.
              </span>
            </FormField>

            <FormField label="Quantity">
              <input
                type="number"
                name="quantity"
                min={1}
                max={500}
                defaultValue={50}
                required
                style={inputStyle}
              />
              <span style={hintStyle}>
                Each unit = one Device row + one activation code. Max 500 per batch.
              </span>
            </FormField>

            <FormField label="Internal notes (optional)">
              <input
                type="text"
                name="notes"
                placeholder="e.g. PO-2026-08, Factory X, July run"
                maxLength={500}
                style={inputStyle}
              />
              <span style={hintStyle}>
                Recorded on the batch + audit log only not printed on the unit or shared with the
                factory.
              </span>
            </FormField>

            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                type="submit"
                style={{
                  padding: "10px 18px",
                  borderRadius: 9,
                  border: "none",
                  background: "var(--pri, #2563eb)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="download" size={12} />
                Generate batch + download ZIP
              </button>
              <span style={{ alignSelf: "center", fontSize: 11.5, color: "var(--rl-muted)" }}>
                The ZIP streams as it builds the download starts immediately even for 500-unit
                runs.
              </span>
            </div>
          </form>
        </div>

        {/* Side: how the workflow ends at the factory */}
        <div className="ds-card" style={{ padding: 18 }}>
          <h3 className="ds-card__title">ZIP → factory workflow</h3>
          <ol
            style={{
              marginTop: 10,
              paddingLeft: 22,
              fontSize: 12.5,
              color: "var(--ink-2)",
              lineHeight: 1.7,
            }}
          >
            <li>Generate the batch the ZIP streams down. Save it.</li>
            <li>
              Send the ZIP to your factory. Inside they'll find:
              <ul style={{ marginTop: 4, paddingLeft: 16, lineHeight: 1.55 }}>
                <li>
                  <strong>README.txt</strong> print / encode instructions
                </li>
                <li>
                  <strong>manifest.csv</strong> slug ↔ code ↔ serial table (NFC adds an{" "}
                  <strong>encode_url</strong> column)
                </li>
                <li>
                  <strong>qr-png/&lt;slug&gt;.png</strong> 1024×1024 print PNG (QR kind only)
                </li>
                <li>
                  <strong>qr-svg/&lt;slug&gt;.svg</strong> vector QR with centered logo
                </li>
              </ul>
            </li>
            <li>
              QR: print the QR image + the matching <strong>activation_code</strong>. NFC: write the{" "}
              <strong>encode_url</strong> to each chip + print the activation code.
            </li>
            <li>
              Customer redeems via{" "}
              <code className="mono" style={chipStyle}>
                /activate
              </code>{" "}
              the unit goes live.
            </li>
          </ol>
        </div>
      </div>

      {/* Recent batches */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Recent batches</h3>
          <span className="mono dim" style={{ fontSize: 10.5 }}>
            15 MOST RECENT
          </span>
        </div>
        <TableCard
          empty={recent.rows.length === 0}
          emptyText={
            recent.tableMissing
              ? "Batch history table not migrated yet. Run the hardware_batches migration to enable re-download."
              : "No batches generated yet. Generate one above to start."
          }
        >
          <THead>
            <Th>When</Th>
            <Th>Generated by</Th>
            <Th>Product</Th>
            <Th>Kind</Th>
            <Th align="right">Qty</Th>
            <Th>Status</Th>
            <Th>Notes</Th>
            <Th align="right">Re-download</Th>
          </THead>
          <tbody>
            {recent.rows.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid var(--line)" }}>
                <Td mono>{row.createdAt.toISOString().replace("T", " ").slice(0, 19)}</Td>
                <Td mono>{row.createdByAdminId ? `admin:${row.createdByAdminId.slice(0, 8)}` : "—"}</Td>
                <Td>
                  <Badge tone="info">{row.productSku}</Badge>
                </Td>
                <Td>
                  <Badge tone={row.productKind === "qr" ? "neutral" : "warn"}>
                    {row.productKind}
                  </Badge>
                </Td>
                <Td align="right">
                  <strong>{row.quantity}</strong>
                </Td>
                <Td>
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                  {row.downloadCount > 0 && (
                    <span style={{ fontSize: 10.5, color: "var(--rl-muted)", marginLeft: 6 }}>
                      ×{row.downloadCount}
                    </span>
                  )}
                </Td>
                <Td>
                  <span style={{ fontSize: 12, color: "var(--rl-muted)" }}>{row.notes || "—"}</span>
                </Td>
                <Td align="right">
                  {row.canRedownload ? (
                    <form
                      method="post"
                      action={`/api/admin/hardware/batch/${row.id}/download`}
                      style={{ display: "inline" }}
                    >
                      <button
                        type="submit"
                        title="One-time recovery download. Purges the stored codes afterward."
                        style={redownloadBtnStyle}
                      >
                        <Icon name="download" size={11} />
                        Re-download
                      </button>
                    </form>
                  ) : (
                    <span style={{ fontSize: 11.5, color: "var(--rl-muted)" }}>
                      {row.status === "expired" ? "purged" : "unavailable"}
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            fontSize: 11.5,
            color: "var(--rl-muted)",
            borderTop: "1px solid var(--line)",
          }}
        >
          Re-download is a <strong>one-time recovery</strong>: it rebuilds the exact ZIP from the
          encrypted codes, then purges them (status → <code className="mono">expired</code>). Codes
          also expire automatically 7 days after generation. Save your ZIP at generation time
          whenever possible.
        </p>
      </div>
    </>
  );
}

function statusTone(status: string): "ok" | "warn" | "bad" | "info" | "neutral" {
  if (status === "ready") return "ok";
  if (status === "downloaded") return "info";
  if (status === "expired") return "neutral";
  return "neutral";
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

const hintStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--rl-muted)",
  marginTop: 4,
  lineHeight: 1.5,
};

const chipStyle: React.CSSProperties = {
  background: "var(--surface-2, #fafbf8)",
  padding: "1px 6px",
  borderRadius: 4,
  fontSize: 11.5,
};

const redownloadBtnStyle: React.CSSProperties = {
  padding: "5px 10px",
  borderRadius: 7,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--pri, #2563eb)",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          color: "var(--rl-muted)",
          letterSpacing: "0.04em",
          fontWeight: 600,
        }}
      >
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
