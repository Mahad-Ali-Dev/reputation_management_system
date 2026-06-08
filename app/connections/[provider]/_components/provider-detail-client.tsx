"use client";

/**
 * Per-provider MANAGE detail (client island) — module 14_connections.
 *
 * Renders the connection state for a single provider: a status hero
 * (Connected / Needs attention / Not connected), last-sync time, the live
 * account label, reconnect + disconnect + manual re-sync controls, a provider
 * settings strip (connection type · what it syncs · live sync error), and a
 * recent-sync-results table.
 *
 * RSC SAFETY: this is the ONLY place onClick/state live. It receives fully
 * serialized, JSON-safe props from the server page — never Prisma rows or Date
 * objects. Connect/Reconnect are plain anchors to the existing authorize route;
 * Disconnect + Re-sync delegate to the shared server actions (the same ones the
 * accordion + table use), so all DB work stays server-side.
 */

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  type ConnPillTone,
  type SerializedConnection,
  connectionPill,
  isConnected,
  newestSync,
  relativeTime,
} from "../../_lib/format";
import { DisconnectDialog } from "../../_components/disconnect-dialog";
import type { SerializedSyncLog } from "./widget-embed-panel";

const PILL_CLASS: Record<ConnPillTone, string> = {
  ok: "chip chip--ok",
  warn: "chip chip--warn",
  bad: "chip chip--bad",
  neutral: "chip chip--out",
};

/** The provider facts the detail view renders. All JSON-safe. */
export type ProviderInfo = {
  id: string;
  displayName: string;
  description: string;
  ready: boolean;
  blockerNote: string | null;
  docsUrl: string | null;
  connType: "oauth" | "api_key" | "embed" | "csv";
  syncs: "contacts" | "social" | "reviews" | null;
  syncsLabel: string | null;
  /** True when a real (non-noop) sync adapter is registered for this provider. */
  hasRealAdapter: boolean;
};

function ResyncButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn--sm" disabled={pending} title="Pull recent customers now">
      <Icon name="refresh" size={12} />
      {pending ? "Syncing…" : "Re-sync now"}
    </button>
  );
}

function syncLogTone(status: string): ConnPillTone {
  if (status === "ok") return "ok";
  if (status === "error") return "bad";
  return "neutral"; // skipped / other
}

export function ProviderDetailClient({
  provider,
  connections,
  syncLogs,
  disconnectAction,
  resyncAction,
}: {
  provider: ProviderInfo;
  connections: SerializedConnection[];
  syncLogs: SerializedSyncLog[];
  disconnectAction: (formData: FormData) => void | Promise<void>;
  resyncAction: (formData: FormData) => void | Promise<void>;
}) {
  const connected = isConnected(connections);
  const liveConn = connections.find((c) => c.status === "active") ?? connections[0] ?? null;
  const pill = connectionPill(connections);
  const lastSync = newestSync(connections);
  const canResync = provider.syncs === "contacts" && liveConn?.status === "active";

  // The authorize route the Connect / Reconnect anchors hit.
  const authorizeHref = `/api/connections/${provider.id}/authorize`;

  return (
    <div className="col" style={{ gap: 16 }}>
      {/* ── Status hero ─────────────────────────────────────────────────── */}
      <div className="ds-card">
        <div className="ds-card__body" style={{ padding: 18 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
          >
            <div className="row" style={{ gap: 12, minWidth: 0 }}>
              <span className={PILL_CLASS[pill.tone]}>
                {pill.tone !== "neutral" && <span className="dot" />}
                {pill.label}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>
                  {liveConn?.accountLabel ?? provider.displayName}
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {connected
                    ? `Last sync ${relativeTime(lastSync)}`
                    : "No active connection"}
                </div>
              </div>
            </div>

            <div className="row" style={{ gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
              {canResync && liveConn && (
                <form action={resyncAction}>
                  <input type="hidden" name="connectionId" value={liveConn.id} />
                  <ResyncButton />
                </form>
              )}

              {connected ? (
                <>
                  {provider.ready && (
                    <Link href={authorizeHref} className="btn btn--sm" prefetch={false}>
                      <Icon name="refresh" size={12} />
                      Reconnect
                    </Link>
                  )}
                  {liveConn && (
                    <DisconnectDialog
                      connectionId={liveConn.id}
                      providerLabel={provider.displayName}
                      accountLabel={liveConn.accountLabel}
                      action={disconnectAction}
                      triggerClassName="btn btn--sm btn--ghost btn--danger"
                    />
                  )}
                </>
              ) : provider.ready ? (
                <Link href={authorizeHref} className="btn btn--sm btn--pri" prefetch={false}>
                  Connect
                  <Icon name="arrowR" size={12} />
                </Link>
              ) : (
                <Link href={`/admin/providers/${provider.id}`} className="btn btn--sm">
                  <Icon name="settings" size={12} />
                  Set up in admin
                </Link>
              )}
            </div>
          </div>

          {/* A surfaced sync error for the live connection (Wave-0 column). */}
          {liveConn?.syncError && (
            <div
              className="row"
              style={{
                gap: 8,
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 9,
                border: "1px solid var(--bad-soft, #fecaca)",
                background: "var(--bad-soft, #fef2f2)",
                color: "var(--bad)",
                fontSize: 12.5,
                alignItems: "flex-start",
              }}
            >
              <Icon name="alert" size={14} />
              <span style={{ minWidth: 0, wordBreak: "break-word" }}>{liveConn.syncError}</span>
            </div>
          )}

          {/* Not-ready blocker note (App Review / paid tier). */}
          {!provider.ready && provider.blockerNote && (
            <div
              className="row"
              style={{
                gap: 8,
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 9,
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#92400e",
                fontSize: 12.5,
                alignItems: "flex-start",
              }}
            >
              <Icon name="info" size={14} />
              <span style={{ minWidth: 0 }}>{provider.blockerNote}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Provider settings ───────────────────────────────────────────── */}
      <div className="ds-card">
        <div className="ds-card__head">
          <div className="row" style={{ gap: 12 }}>
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--pri-50)",
                color: "var(--pri)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Icon name="sliders" size={14} />
            </span>
            <div>
              <h3 className="ds-card__title">Provider settings</h3>
              <div className="ds-card__sub">How this connection works.</div>
            </div>
          </div>
        </div>
        <div className="ds-card__body" style={{ padding: 18 }}>
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              margin: 0,
            }}
          >
            <SettingItem label="Connection type" value={connTypeName(provider.connType)} />
            <SettingItem label="Syncs" value={provider.syncsLabel ?? "Nothing automatic"} />
            <SettingItem
              label="Adapter"
              value={provider.hasRealAdapter ? "Active" : "Listener only"}
            />
            <SettingItem
              label="Status"
              value={connected ? "Active" : provider.ready ? "Ready to connect" : "Coming soon"}
            />
          </dl>
          {provider.docsUrl && (
            <div style={{ marginTop: 16 }}>
              <Link href={provider.docsUrl} className="row" style={{ gap: 6, fontSize: 12.5 }}>
                <Icon name="help" size={13} />
                Setup guide
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent sync results ─────────────────────────────────────────── */}
      <div className="ds-card" style={{ overflow: "hidden" }}>
        <div className="ds-card__head">
          <div className="row" style={{ gap: 12 }}>
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--pri-50)",
                color: "var(--pri)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Icon name="refresh" size={14} />
            </span>
            <div>
              <h3 className="ds-card__title">Recent sync results</h3>
              <div className="ds-card__sub">The last few times we pulled from this connection.</div>
            </div>
          </div>
        </div>

        {syncLogs.length === 0 ? (
          <div
            className="ds-card__body"
            style={{ padding: "28px 20px", textAlign: "center", color: "var(--rl-muted)", fontSize: 13 }}
          >
            {provider.syncs === "contacts"
              ? "No sync runs yet. Re-sync now to pull recent customers."
              : "This connection doesn't run a contact sync — engagement flows in live."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl tbl--compact">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Result</th>
                  <th>Added</th>
                  <th>Updated</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="tabular dim">{relativeTime(log.startedAt)}</td>
                    <td>
                      <span className={PILL_CLASS[syncLogTone(log.status)]}>
                        {syncLogTone(log.status) !== "neutral" && <span className="dot" />}
                        {labelForStatus(log.status)}
                      </span>
                      {log.error && (
                        <div
                          className="dim"
                          style={{ fontSize: 10.5, color: "var(--bad)", marginTop: 3 }}
                          title={log.error}
                        >
                          {log.error.length > 56 ? `${log.error.slice(0, 56)}…` : log.error}
                        </div>
                      )}
                    </td>
                    <td className="tabular">{log.contactsCreated}</td>
                    <td className="tabular">{log.contactsUpdated}</td>
                    <td className="tabular dim">
                      {log.durationMs != null ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function labelForStatus(status: string): string {
  if (status === "ok") return "Synced";
  if (status === "error") return "Error";
  if (status === "skipped") return "No changes";
  return status;
}

function connTypeName(connType: ProviderInfo["connType"]): string {
  switch (connType) {
    case "oauth":
      return "OAuth";
    case "api_key":
      return "API key";
    case "embed":
      return "Embed";
    case "csv":
      return "CSV import";
    default:
      return "—";
  }
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt
        className="dim"
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 13, fontWeight: 550, color: "var(--ink)" }}>{value}</dd>
    </div>
  );
}
