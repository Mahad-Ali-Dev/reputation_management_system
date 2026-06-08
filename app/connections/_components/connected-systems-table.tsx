"use client";

/**
 * Connected Systems table (client island) — module 14_connections, Wave 3a.
 *
 * Acceptance: an always-visible table reflecting REAL connection status +
 * last-sync. Columns: Platform · Connection Type · Status · Last Synced ·
 * Actions. The Disconnect button opens the confirm dialog (with the mandatory
 * warning) which then submits the `disconnectConnection` server action; a
 * manual Re-sync button (for contact-syncing connections) submits
 * `resyncConnection`. All onClick/state is here; DB work stays server-side.
 *
 * Rows are pre-flattened server-side into JSON-safe `ConnectedRow`s — one per
 * live connection (a provider with two connections gets two rows).
 */

import { BrandLogo } from "@/components/shell/brand-logo";
import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import {
  type ConnPillTone,
  type SerializedProviderRow,
  connTypeLabel,
  relativeTime,
} from "../_lib/format";
import { DisconnectDialog } from "./disconnect-dialog";

/** One flattened connection row for the table. JSON-safe. */
export type ConnectedRow = {
  connectionId: string;
  provider: string;
  providerLabel: string;
  accountLabel: string | null;
  connType: SerializedProviderRow["connType"];
  syncs: SerializedProviderRow["syncs"];
  status: string;
  lastSyncedAt: string | null;
  syncError: string | null;
};

const PILL_CLASS: Record<ConnPillTone, string> = {
  ok: "chip chip--ok",
  warn: "chip chip--warn",
  bad: "chip chip--bad",
  neutral: "chip chip--out",
};

function statusPill(row: ConnectedRow): { label: string; tone: ConnPillTone } {
  if (row.status === "error") return { label: "Error", tone: "bad" };
  if (row.status === "active") return { label: "Connected", tone: "ok" };
  if (row.status === "expired") return { label: "Expired", tone: "warn" };
  if (row.status === "revoked") return { label: "Disconnected", tone: "neutral" };
  return { label: row.status, tone: "neutral" };
}

function ResyncButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn--xs"
      disabled={pending}
      title="Pull recent customers now"
    >
      <Icon name="refresh" size={11} />
      {pending ? "Syncing…" : "Re-sync"}
    </button>
  );
}

export function ConnectedSystemsTable({
  rows,
  disconnectAction,
  resyncAction,
}: {
  rows: ConnectedRow[];
  disconnectAction: (formData: FormData) => void | Promise<void>;
  resyncAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
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
            <Icon name="plug" size={14} />
          </span>
          <div>
            <h3 className="ds-card__title">Connected systems</h3>
            <div className="ds-card__sub">
              Everything currently feeding your data spine — status and last sync.
            </div>
          </div>
        </div>
        <span className="mono dim" style={{ fontSize: 10.5 }}>
          {rows.length} ACTIVE
        </span>
      </div>

      {rows.length === 0 ? (
        <div
          className="ds-card__body"
          style={{
            padding: "32px 20px",
            textAlign: "center",
            color: "var(--rl-muted)",
            fontSize: 13,
          }}
        >
          No systems connected yet. Connect one above and it will appear here with live status.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl tbl--compact">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Type</th>
                <th>Status</th>
                <th>Last synced</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const pill = statusPill(row);
                const canResync = row.syncs === "contacts" && row.status === "active";
                return (
                  <tr key={row.connectionId}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 7,
                            background: "var(--surface)",
                            border: "1px solid var(--line)",
                            display: "grid",
                            placeItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <BrandLogo provider={row.provider} size={15} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 550, color: "var(--ink)" }}>
                            {row.providerLabel}
                          </div>
                          {row.accountLabel && (
                            <div className="dim" style={{ fontSize: 11 }}>
                              {row.accountLabel}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="chip chip--out" style={{ fontSize: 11 }}>
                        {connTypeLabel(row.connType)}
                      </span>
                    </td>
                    <td>
                      <span className={PILL_CLASS[pill.tone]}>
                        {pill.tone !== "neutral" && <span className="dot" />}
                        {pill.label}
                      </span>
                      {row.syncError && (
                        <div
                          className="dim"
                          style={{ fontSize: 10.5, color: "var(--bad)", marginTop: 3 }}
                          title={row.syncError}
                        >
                          {row.syncError.length > 48
                            ? `${row.syncError.slice(0, 48)}…`
                            : row.syncError}
                        </div>
                      )}
                    </td>
                    <td className="tabular dim">{relativeTime(row.lastSyncedAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        {canResync && (
                          <form action={resyncAction}>
                            <input type="hidden" name="connectionId" value={row.connectionId} />
                            <ResyncButton />
                          </form>
                        )}
                        <Link href={`/connections/${row.provider}`} className="btn btn--xs">
                          <Icon name="sliders" size={11} />
                          Manage
                        </Link>
                        <DisconnectDialog
                          connectionId={row.connectionId}
                          providerLabel={row.providerLabel}
                          accountLabel={row.accountLabel}
                          action={disconnectAction}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
