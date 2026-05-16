import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Badge, KpiCard, TableCard, THead, Th, Td } from "@/components/admin/admin-ui";
import { prisma } from "@/lib/db/client";
import { CATEGORY_LABELS, getProvidersByCategory } from "@/lib/providers/registry";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Admin overview of provider OAuth app configurations.
 *
 * For each provider in the registry, shows:
 *   - configured (has client_id) → ready for tenants to connect
 *   - unconfigured → admin needs to paste credentials
 *   - disabled → admin has explicitly disabled
 */
export default async function ProvidersAdminPage() {
  const apps = await prisma.providerApp.findMany({
    select: { provider: true, status: true, updatedAt: true },
  });
  const appByProvider = new Map(apps.map((a) => [a.provider, a]));
  const grouped = getProvidersByCategory();

  const allProviders = Object.values(grouped).flat();
  const configuredCount = allProviders.filter(
    (p) => appByProvider.get(p.id)?.status === "configured",
  ).length;
  const readyCount = allProviders.filter((p) => p.ready).length;

  return (
    <>
      <AdminPageHeader
        title="Provider OAuth apps"
        description="Paste OAuth credentials from each platform's developer portal. Once configured, tenants can connect via /connections."
      />

      <div className="grid-4" style={{ gap: 12, marginBottom: 18 }}>
        <KpiCard l="Providers in registry" v={String(allProviders.length)} d="defined in code" />
        <KpiCard
          l="Configured"
          v={String(configuredCount)}
          d={`${allProviders.length - configuredCount} to set up`}
          up={configuredCount > 0}
        />
        <KpiCard
          l="Code-ready"
          v={String(readyCount)}
          d={`${allProviders.length - readyCount} need code work`}
        />
        <KpiCard l="Categories" v={String(Object.keys(grouped).length)} d="of integrations" />
      </div>

      {Object.entries(grouped).map(([cat, list]) => (
        <div key={cat} className="ds-card" style={{ marginBottom: 14 }}>
          <div className="ds-card__head">
            <h3 className="ds-card__title">
              {CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}
            </h3>
          </div>
          <TableCard>
            <THead>
              <Th>Provider</Th>
              <Th>Status</Th>
              <Th>Last updated</Th>
              <Th align="center">Code ready?</Th>
              <Th align="right" />
            </THead>
            <tbody>
              {list.map((p) => {
                const app = appByProvider.get(p.id);
                const status = app?.status ?? "unconfigured";
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <Td>
                      <span style={{ marginRight: 6 }}>{p.logoEmoji}</span>
                      {p.displayName}
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          status === "configured"
                            ? "ok"
                            : status === "disabled"
                              ? "bad"
                              : "neutral"
                        }
                      >
                        {status}
                      </Badge>
                    </Td>
                    <Td>
                      <span style={{ fontSize: 11.5, color: "var(--rl-muted)" }}>
                        {app ? new Date(app.updatedAt).toLocaleDateString() : "—"}
                      </span>
                    </Td>
                    <Td align="center">
                      {p.ready ? (
                        <span style={{ color: "#15803d", fontWeight: 700, fontSize: 14 }}>✓</span>
                      ) : (
                        <span
                          title={p.blockerNote}
                          style={{
                            color: "#a16207",
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: "help",
                          }}
                        >
                          ⚠
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      <Link
                        href={`/admin/providers/${p.id}`}
                        style={{
                          color: "#4f46e5",
                          fontSize: 12,
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        Configure →
                      </Link>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableCard>
        </div>
      ))}
    </>
  );
}
