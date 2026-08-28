import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge, KpiCard } from "@/components/admin/admin-ui";
import { deleteFeatureFlag, upsertFeatureFlag } from "@/lib/admin/flags";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const KNOWN_FLAGS = [
  { key: "chatbot_reranker", description: "Two-pass retrieval with Haiku reranker" },
  { key: "ai_phone_receptionist", description: "Twilio Voice + Claude phone agent" },
  { key: "topic_extraction", description: "Auto-extract topic labels from reviews" },
  { key: "daily_digest", description: "Daily email digest to org owners" },
  { key: "bulk_csv_outreach", description: "Bulk CSV review-request page" },
  { key: "url_kb_ingest", description: "Crawl arbitrary URLs into chatbot KB" },
  { key: "survey_coupons", description: "Issue coupons to promoters" },
];

export default async function FlagsPage() {
  const [flags, orgs] = await Promise.all([
    prisma.featureFlag.findMany({
      orderBy: [{ key: "asc" }, { organizationId: { sort: "asc", nulls: "first" } }],
    }),
    prisma.organization.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const byKey: Record<string, typeof flags> = {};
  for (const f of flags) {
    if (!byKey[f.key]) byKey[f.key] = [];
    byKey[f.key]?.push(f);
  }

  const globalCount = flags.filter((f) => f.organizationId === null).length;
  const orgOverrideCount = flags.filter((f) => f.organizationId !== null).length;
  const enabledCount = flags.filter((f) => f.enabled).length;

  return (
    <>
      <AdminPageHeader
        title="Feature flags"
        description="Toggle features per-org or globally. Global default applies when no org-specific row exists. Rollout % is deterministic per (org, key)."
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard l="Flag definitions" v={String(KNOWN_FLAGS.length)} d="known keys in code" />
        <KpiCard l="Global defaults" v={String(globalCount)} d="apply to all tenants" />
        <KpiCard l="Org overrides" v={String(orgOverrideCount)} d="per-tenant rows" />
        <KpiCard
          l="Enabled"
          v={String(enabledCount)}
          d={`${flags.length - enabledCount} disabled`}
          up={enabledCount > 0}
        />
      </div>

      {/* Known flags reference */}
      <div className="ds-card" style={{ padding: 18, marginBottom: 16 }}>
        <h3 className="ds-card__title">Known flag keys</h3>
        <ul
          style={{
            marginTop: 10,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {KNOWN_FLAGS.map((f) => (
            <li key={f.key} style={{ fontSize: 13 }}>
              <code
                className="mono"
                style={{
                  background: "#eef2ff",
                  color: "#4338ca",
                  padding: "1px 7px",
                  borderRadius: 4,
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                {f.key}
              </code>
              <span style={{ color: "var(--rl-muted)", marginLeft: 8 }}>{f.description}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Upsert form */}
      <div className="ds-card" style={{ padding: 18, marginBottom: 16 }}>
        <h3 className="ds-card__title">Set / update a flag</h3>
        <form
          action={upsertFeatureFlag}
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <FormField label="Flag key">
            <input
              name="key"
              required
              pattern="^[a-z][a-z0-9_]*$"
              placeholder="chatbot_reranker"
              style={inputStyle}
            />
          </FormField>
          <FormField label="Org (blank = global)">
            <select name="organizationId" style={inputStyle}>
              <option value="">Global</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Rollout %">
            <input
              type="number"
              name="rolloutPct"
              min={0}
              max={100}
              defaultValue={100}
              style={inputStyle}
            />
            <span style={{ fontSize: 11, color: "var(--rl-muted)", marginTop: 4 }}>
              0 = off · 100 = on for everyone · 50 = on for half (deterministic per-org)
            </span>
          </FormField>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              alignSelf: "end",
              fontSize: 13,
              paddingBottom: 6,
            }}
          >
            <input type="checkbox" name="enabled" defaultChecked />
            <span style={{ fontWeight: 500 }}>Enabled</span>
          </label>
          <label style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10.5, color: "var(--rl-muted)", letterSpacing: "0.04em" }}>
              METADATA (OPTIONAL JSON)
            </span>
            <textarea
              name="metadata"
              rows={2}
              placeholder={'{"owner":"alice","expires_at":"2026-12-31"}'}
              style={{
                ...inputStyle,
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                resize: "vertical",
              }}
            />
          </label>
          <div style={{ gridColumn: "span 2" }}>
            <button
              type="submit"
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "none",
                background: "var(--pri, #2563eb)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Save flag
            </button>
          </div>
        </form>
      </div>

      {/* Existing flags */}
      <div className="ds-card" style={{ padding: 18 }}>
        <h3 className="ds-card__title">Current flags ({flags.length})</h3>
        {flags.length === 0 ? (
          <p style={{ marginTop: 10, fontSize: 13, color: "var(--rl-muted)" }}>
            No flags configured yet everything uses code-level defaults.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(byKey).map(([key, rows]) => {
              const orgsById = new Map(orgs.map((o) => [o.id, o.name]));
              return (
                <div
                  key={key}
                  style={{
                    border: "1px solid var(--line)",
                    background: "var(--surface-2, #fafbf8)",
                    borderRadius: 9,
                    padding: 12,
                  }}
                >
                  <code
                    className="mono"
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "#4338ca",
                    }}
                  >
                    {key}
                  </code>
                  <ul
                    style={{
                      marginTop: 8,
                      padding: 0,
                      listStyle: "none",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    {rows.map((f) => (
                      <li
                        key={f.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: 13,
                          padding: "4px 0",
                        }}
                      >
                        <span style={{ color: "var(--ink-2)" }}>
                          {f.organizationId
                            ? (orgsById.get(f.organizationId) ?? `org:${f.organizationId.slice(0, 8)}`)
                            : "Global default"}{" "}
                          {f.enabled ? (
                            <Badge tone="ok">
                              {f.rolloutPct < 100 ? `enabled @${f.rolloutPct}%` : "enabled"}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">disabled</Badge>
                          )}
                        </span>
                        <form action={deleteFeatureFlag}>
                          <input type="hidden" name="id" value={f.id} />
                          <button
                            type="submit"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--rl-muted)",
                              fontSize: 11.5,
                              cursor: "pointer",
                              textDecoration: "underline",
                            }}
                          >
                            Delete
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10.5, color: "var(--rl-muted)", letterSpacing: "0.04em" }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}
