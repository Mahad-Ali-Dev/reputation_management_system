import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  ActionLink,
  Badge,
  KpiCard,
  TableCard,
  THead,
  Th,
  Td,
} from "@/components/admin/admin-ui";
import { Icon } from "@/components/shell/icon";
import { prisma } from "@/lib/db/client";
import Link from "next/link";

/**
 * Admin hardware page — bulk QR generation for factory production runs.
 *
 * Workflow:
 *   1. Pick product SKU (e.g., "plaque-brass" or "stand-acrylic")
 *   2. Pick quantity (1-500 per batch)
 *   3. Submit form → /api/admin/hardware/batch generates devices + streams CSV
 *   4. Admin downloads CSV with (slug, activation_code, qr_url, serial) per row
 *   5. CSV goes to the factory; factory prints QR + activation code on each plaque
 *
 * The activation codes are SHA-256-hashed at generation — the plaintext only
 * exists in the CSV response. If the admin loses the CSV, the batch is wasted
 * inventory because nobody can activate those plaques. The page warns about
 * this explicitly.
 */

export const dynamic = "force-dynamic";

export default async function AdminHardwarePage() {
  const [products, unactivated, activeCount, retiredCount, recentBatches] =
    await Promise.all([
      prisma.hardwareProduct.findMany({
        where: { isActive: true },
        select: {
          sku: true,
          name: true,
          description: true,
          priceCents: true,
          currency: true,
          unitsPerPack: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.device.count({ where: { status: "unactivated" } }),
      prisma.device.count({ where: { status: "active" } }),
      prisma.device.count({ where: { status: "retired" } }),
      // Pull recent hardware.batch.generated audit rows to list past batches.
      prisma.auditLog.findMany({
        where: { action: "hardware.batch.generated" },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          actorId: true,
          afterData: true,
        },
      }),
    ]);

  return (
    <>
      <AdminPageHeader
        title="Hardware batches"
        description="Generate QR codes + activation codes in bulk for factory production. Downloads as a single ZIP with the manifest CSV and a high-res PNG + scalable SVG of each QR — ready to send straight to the factory."
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
          d="QRs generated, not yet redeemed"
        />
        <KpiCard
          l="Active QRs"
          v={activeCount.toLocaleString()}
          d="redeemed + redirecting"
          up={activeCount > 0}
        />
        <KpiCard
          l="Retired"
          v={retiredCount.toLocaleString()}
          d="soft-deleted by tenants"
        />
        <KpiCard
          l="Batches generated"
          v={recentBatches.length.toLocaleString()}
          d="last 10 shown below"
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
        <strong>⚠ Activation codes are one-time-view.</strong> They're SHA-256
        hashed on insert — the plaintext only exists in the ZIP that downloads
        right after you click Generate. <strong>Save that ZIP immediately.</strong>{" "}
        Once the tab closes, the codes are unrecoverable and the whole batch is
        wasted hardware (no plaque can be activated without its printed code).
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
            Pick a product SKU + quantity. We'll mint that many{" "}
            <code className="mono" style={chipStyle}>
              Device
            </code>{" "}
            rows with status=<code className="mono" style={chipStyle}>unactivated</code>,
            generate unique slugs + activation codes for each, stream a CSV
            back to your browser, and audit-log the batch.
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
                  — Pick a product —
                </option>
                {products.length === 0 ? (
                  <option value="" disabled>
                    No active products in catalog
                  </option>
                ) : (
                  products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.sku} — {p.name} (${(p.priceCents / 100).toFixed(2)} {p.currency})
                    </option>
                  ))
                )}
              </select>
              {products.length === 0 ? (
                <span style={hintStyle}>
                  No active hardware products. Seed one via Prisma:{" "}
                  <code className="mono" style={chipStyle}>
                    INSERT INTO hardware_products (sku, name, price_cents) VALUES ('plaque-brass', 'Brass Plaque', 4900)
                  </code>
                </span>
              ) : null}
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
                Each unit = one Device row + one QR + one activation code. Max 500 per batch.
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
                Recorded on the audit log only — not printed on the plaque or shared with the factory.
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
                Browser saves the ZIP automatically. Large batches (500+) take 10-20s — wait
                for the download.
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
            <li>Generate the batch — save the ZIP file.</li>
            <li>
              Send the ZIP to your factory. Inside they'll find:
              <ul style={{ marginTop: 4, paddingLeft: 16, lineHeight: 1.55 }}>
                <li>
                  <strong>README.txt</strong> — print instructions
                </li>
                <li>
                  <strong>manifest.csv</strong> — slug ↔ code ↔ serial table
                </li>
                <li>
                  <strong>qr-png/&lt;slug&gt;.png</strong> — 1024×1024 print-ready PNG per plaque
                </li>
                <li>
                  <strong>qr-svg/&lt;slug&gt;.svg</strong> — vector QR for huge prints
                </li>
              </ul>
            </li>
            <li>
              Factory prints each plaque with its QR image + the matching{" "}
              <strong>activation_code_display</strong> (XXXX-XXXX format) printed below or beside the QR.
            </li>
            <li>
              Customer redeems via{" "}
              <code className="mono" style={chipStyle}>
                /activate
              </code>{" "}
              — verifies activation_code, picks business, pastes Google review
              URL. QR goes live.
            </li>
          </ol>
        </div>
      </div>

      {/* Recent batches */}
      <div className="ds-card">
        <div className="ds-card__head">
          <h3 className="ds-card__title">Recent batches</h3>
          <span className="mono dim" style={{ fontSize: 10.5 }}>
            10 MOST RECENT
          </span>
        </div>
        <TableCard
          empty={recentBatches.length === 0}
          emptyText="No batches generated yet. Generate one above to start."
        >
          <THead>
            <Th>When</Th>
            <Th>Generated by</Th>
            <Th>Product</Th>
            <Th align="right">Qty</Th>
            <Th>Notes</Th>
          </THead>
          <tbody>
            {recentBatches.map((row) => {
              const data = (row.afterData ?? {}) as {
                productSku?: string;
                productName?: string;
                quantity?: number;
                notes?: string | null;
              };
              return (
                <tr key={row.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <Td mono>{row.createdAt.toISOString().replace("T", " ").slice(0, 19)}</Td>
                  <Td mono>admin:{row.actorId.slice(0, 8)}</Td>
                  <Td>
                    {data.productSku ? (
                      <Badge tone="info">{data.productSku}</Badge>
                    ) : (
                      "—"
                    )}
                    {data.productName && (
                      <div style={{ fontSize: 11, color: "var(--rl-muted)", marginTop: 2 }}>
                        {data.productName}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <strong>{data.quantity ?? "—"}</strong>
                  </Td>
                  <Td>
                    <span style={{ fontSize: 12, color: "var(--rl-muted)" }}>
                      {data.notes || "—"}
                    </span>
                  </Td>
                </tr>
              );
            })}
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
          ⚠ The ZIP for each past batch is NOT recoverable. If you need to re-export, you'd
          have to generate a fresh batch — the old plaques are stuck with their
          original (now-lost) activation codes. Always save the ZIP at generation
          time.
        </p>
      </div>
    </>
  );
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

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, color: "var(--rl-muted)", letterSpacing: "0.04em", fontWeight: 600 }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
