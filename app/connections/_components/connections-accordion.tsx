"use client";

/**
 * Connections accordion (client island) — module 14_connections, Wave 3a.
 *
 * Acceptance: grouped accordion, ONE section open at a time, each header shows
 * "n of m connected". Each provider row shows icon · name · a status pill
 * (Connected / Not connected / Error, from the serialized connection state) ·
 * last-sync time · and a contextual Connect / Manage / Disconnect action.
 *
 * RSC SAFETY: this is the ONLY place onClick/state live. It receives fully
 * serialized, JSON-safe props from the server page (`SerializedSection[]`) —
 * never Prisma rows or Date objects. The Connect action is a plain anchor to
 * `/api/connections/<provider>/authorize`; Disconnect delegates to a server
 * action via <DisconnectDialog>.
 */

import { BrandLogo } from "@/components/shell/brand-logo";
import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";
import { useState } from "react";
import {
  type ConnPillTone,
  type SerializedProviderRow,
  type SerializedSection,
  connectionPill,
  isConnected,
  newestSync,
  relativeTime,
  syncsLabel,
} from "../_lib/format";
import { DisconnectDialog } from "./disconnect-dialog";

const PILL_CLASS: Record<ConnPillTone, string> = {
  ok: "chip chip--ok",
  warn: "chip chip--warn",
  bad: "chip chip--bad",
  neutral: "chip chip--out",
};

function StatusPill({
  conns,
}: {
  conns: SerializedProviderRow["connections"];
}) {
  const pill = connectionPill(conns);
  return (
    <span className={PILL_CLASS[pill.tone]}>
      {pill.tone !== "neutral" && <span className="dot" />}
      {pill.label}
    </span>
  );
}

/** The contextual right-side action for a provider row. */
function RowAction({
  provider,
  disconnectAction,
}: {
  provider: SerializedProviderRow;
  disconnectAction: (formData: FormData) => void | Promise<void>;
}) {
  const connected = isConnected(provider.connections);
  const liveConn =
    provider.connections.find((c) => c.status === "active") ??
    provider.connections[0];

  // CSV import → route to the contacts importer.
  if (provider.connType === "csv") {
    return (
      <Link href="/contacts?import=1" className="btn btn--xs btn--pri">
        <Icon name="upload" size={11} />
        Import CSV
      </Link>
    );
  }

  // Embed (Live Chat widget) → manage detail where the snippet lives.
  if (provider.connType === "embed") {
    return (
      <Link
        href={`/connections/${provider.id}`}
        className="btn btn--xs btn--pri"
      >
        <Icon name="chat" size={11} />
        Get embed code
      </Link>
    );
  }

  if (connected && liveConn) {
    return (
      <div className="row" style={{ gap: 6 }}>
        <Link href={`/connections/${provider.id}`} className="btn btn--xs">
          <Icon name="sliders" size={11} />
          Manage
        </Link>
        <DisconnectDialog
          connectionId={liveConn.id}
          providerLabel={provider.displayName}
          accountLabel={liveConn.accountLabel}
          action={disconnectAction}
        />
      </div>
    );
  }

  // API-key (paste-credentials) providers connect on their Manage detail page
  // where the secure form lives — not via an OAuth redirect.
  if (provider.connType === "api_key" && provider.ready) {
    return (
      <Link
        href={`/connections/${provider.id}`}
        className="btn btn--xs btn--pri"
      >
        Connect
        <Icon name="arrowR" size={11} />
      </Link>
    );
  }

  // Ready + admin pasted creds → one-click connect.
  if (provider.ready && provider.configured) {
    return (
      <Link
        href={`/api/connections/${provider.id}/authorize`}
        className="btn btn--xs btn--pri"
        prefetch={false}
      >
        Connect
        <Icon name="arrowR" size={11} />
      </Link>
    );
  }

  // Ready but no creds yet → point to admin (env-gated providers land here too).
  if (provider.ready) {
    return (
      <Link href={`/admin/providers/${provider.id}`} className="btn btn--xs">
        <Icon name="settings" size={11} />
        Set up in admin
      </Link>
    );
  }

  // Not ready (App Review / paid tier) → disabled waitlist affordance.
  return (
    <span className="chip chip--warn" title={provider.blockerNote ?? undefined}>
      Coming soon
    </span>
  );
}

function ProviderRow({
  provider,
  disconnectAction,
}: {
  provider: SerializedProviderRow;
  disconnectAction: (formData: FormData) => void | Promise<void>;
}) {
  const connected = isConnected(provider.connections);
  const liveConn =
    provider.connections.find((c) => c.status === "active") ??
    provider.connections[0];
  const sync = newestSync(provider.connections);
  const syncHint = syncsLabel(provider.syncs);

  // Sub-line precedence: connected → account label + last sync; otherwise the
  // description, or the blocker note when the provider isn't ready.
  let subline: string;
  if (connected && liveConn) {
    const acct = liveConn.accountLabel ?? provider.displayName;
    subline = sync ? `${acct} · synced ${relativeTime(sync)}` : acct;
  } else if (!provider.ready && provider.blockerNote) {
    subline = provider.blockerNote;
  } else {
    subline = provider.description;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid ${connected ? "var(--pri-100)" : "var(--line)"}`,
        background: connected ? "var(--pri-50)" : "var(--surface)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          flexShrink: 0,
          borderRadius: 9,
          background: "var(--surface)",
          border: "1px solid var(--line)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <BrandLogo provider={provider.id} size={20} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 550, color: "var(--ink)" }}>
            {provider.displayName}
          </span>
          {syncHint && (
            <span className="dim-2" style={{ fontSize: 10.5 }}>
              {syncHint}
            </span>
          )}
        </div>
        <div
          className="dim"
          style={{
            fontSize: 11.5,
            lineHeight: 1.45,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={subline}
        >
          {subline}
        </div>
      </div>

      <div className="row" style={{ gap: 10, flexShrink: 0 }}>
        <StatusPill conns={provider.connections} />
        <RowAction provider={provider} disconnectAction={disconnectAction} />
      </div>
    </div>
  );
}

function Section({
  section,
  isOpen,
  onToggle,
  disconnectAction,
}: {
  section: SerializedSection;
  isOpen: boolean;
  onToggle: () => void;
  disconnectAction: (formData: FormData) => void | Promise<void>;
}) {
  const headerId = `acc-h-${section.key}`;
  const panelId = `acc-p-${section.key}`;
  return (
    <div className="ds-card" style={{ overflow: "hidden" }}>
      <button
        type="button"
        id={headerId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className="ds-card__head"
        style={{
          width: "100%",
          background: "none",
          border: "none",
          borderBottom: isOpen ? "1px solid var(--line)" : "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
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
              flexShrink: 0,
            }}
          >
            <Icon name={section.icon as IconName} size={14} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 className="ds-card__title">{section.label}</h3>
            <div className="ds-card__sub">{section.subline}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexShrink: 0 }}>
          <span
            className={
              section.connectedCount > 0 ? "chip chip--ok" : "chip chip--out"
            }
            style={{ fontSize: 11 }}
          >
            {section.connectedCount} of {section.total} connected
          </span>
          <Icon name={isOpen ? "chevU" : "chevD"} size={16} />
        </div>
      </button>

      {isOpen && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={headerId}
          className="ds-card__body"
          style={{ padding: 12 }}
        >
          <div className="col" style={{ gap: 8 }}>
            {section.providers.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                disconnectAction={disconnectAction}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Case-insensitive substring match over a provider's name + description. */
function providerMatches(p: SerializedProviderRow, q: string): boolean {
  const hay = `${p.displayName} ${p.description}`.toLowerCase();
  return hay.includes(q);
}

export function ConnectionsAccordion({
  sections,
  disconnectAction,
}: {
  sections: SerializedSection[];
  disconnectAction: (formData: FormData) => void | Promise<void>;
}) {
  // One open at a time. Default-open the first section that has a connection,
  // else the first section.
  const firstConnected = sections.find((s) => s.connectedCount > 0);
  const [openKey, setOpenKey] = useState<string | null>(
    firstConnected?.key ?? sections[0]?.key ?? null,
  );
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // When searching, filter providers within each section and drop empty
  // sections. Searching also force-expands every matching section so the user
  // sees all hits at once (no hunting through collapsed groups).
  const filtered = q
    ? sections
        .map((s) => ({
          ...s,
          providers: s.providers.filter((p) => providerMatches(p, q)),
        }))
        .filter((s) => s.providers.length > 0)
    : sections;

  const searching = q.length > 0;
  const noResults = searching && filtered.length === 0;

  return (
    <section aria-labelledby="band-all" className="col" style={{ gap: 12 }}>
      <div
        className="ds-card__head"
        style={{ paddingBottom: 4, borderBottom: "none" }}
      >
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
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
              flexShrink: 0,
            }}
          >
            <Icon name="grid" size={15} />
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 id="band-all" className="ds-card__title">
              All integrations
            </h3>
            <div className="ds-card__sub">
              Browse every platform by category and connect the ones you use.
            </div>
          </div>
        </div>
        <label
          className="row"
          style={{
            gap: 6,
            flexShrink: 0,
            border: "1px solid var(--line)",
            borderRadius: 8,
            background: "var(--surface)",
            padding: "5px 10px",
          }}
        >
          <Icon name="search" size={13} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations…"
            aria-label="Search integrations"
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 12.5,
              color: "var(--ink)",
              width: 160,
            }}
          />
        </label>
      </div>

      {noResults ? (
        <div
          className="ds-card"
          style={{
            padding: "28px 20px",
            textAlign: "center",
            color: "var(--rl-muted)",
            fontSize: 13,
          }}
        >
          No integrations match “{query.trim()}”. Try a different name, or{" "}
          <a href="mailto:info@repulabs.com?subject=Integration%20request">
            request it
          </a>
          .
        </div>
      ) : (
        filtered.map((section) => (
          <Section
            key={section.key}
            section={section}
            isOpen={searching || openKey === section.key}
            onToggle={() =>
              setOpenKey((cur) => (cur === section.key ? null : section.key))
            }
            disconnectAction={disconnectAction}
          />
        ))
      )}
    </section>
  );
}
