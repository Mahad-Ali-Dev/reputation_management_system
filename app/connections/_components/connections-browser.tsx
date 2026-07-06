"use client";

/**
 * Connections browser (client island) — Connections redesign.
 *
 * Renders the "All integrations" browse experience from the design kit:
 *   - 5 category filter cards (All integrations · Reviews & Google ·
 *     Social – Meta · Point of sale · Email & CRM) with live counts,
 *   - a searchable, filterable integration LIST with per-row 3-state status
 *     (Connected / Connecting… / Not connected + Error) and the contextual
 *     action (View details / Reconnect / Connect / Manage · Disconnect).
 *
 * RSC SAFETY: this is the ONLY place onClick/state live. It receives fully
 * serialized, JSON-safe `SerializedSection[]` from the server page — never
 * Prisma rows or Date objects. Connect actions are plain anchors to the
 * authorize/manage routes; Disconnect delegates to a server action via
 * <DisconnectDialog>. All connect/disconnect/reauth flows are preserved.
 */

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type SerializedProviderRow,
  type SerializedSection,
  isConnected,
  newestSync,
  relativeTime,
  syncsLabel,
} from "../_lib/format";
import { DisconnectDialog } from "./disconnect-dialog";
import { KitLogo } from "./kit-logo";

/** A flattened, category-tagged provider row for the list. */
type FlatRow = SerializedProviderRow & { categoryKey: string };

/** Category cards, in mockup order. `all` = every provider. */
type CatDef = {
  key: string;
  title: string;
  desc: string;
  /** kit image asset under /assets/repulabs/connections, or null → glyph. */
  asset: string | null;
  /** Icon glyph fallback / for the All tile. */
  glyph: "grid" | null;
};

const CATS: CatDef[] = [
  {
    key: "all",
    title: "All integrations",
    desc: "Browse all available tools and connect the ones you use.",
    asset: "all-integrations.svg",
    glyph: null,
  },
  {
    key: "reviews",
    title: "Reviews & Google",
    desc: "Sync reviews and ratings from Google and partners.",
    asset: "google.svg",
    glyph: null,
  },
  {
    key: "social",
    title: "Social – Meta",
    desc: "Connect Facebook, Instagram and Messenger.",
    asset: "meta.svg",
    glyph: null,
  },
  {
    key: "pos",
    title: "Point of sale",
    desc: "Track sales and receipts from your POS.",
    asset: "point-of-sale.svg",
    glyph: null,
  },
  {
    key: "crm",
    title: "Email & CRM",
    desc: "Sync contacts and activity from your CRM & email.",
    asset: "email-crm.svg",
    glyph: null,
  },
];

const ASSET_BASE = "/assets/repulabs/connections/";

/** Resolve the 3-state status pill for a provider row from its connections. */
function statusFor(p: SerializedProviderRow): {
  tone: "ok" | "warn" | "neutral" | "bad";
  label: string;
} {
  const conns = p.connections;
  if (conns.some((c) => c.status === "error")) return { tone: "bad", label: "Error" };
  if (conns.some((c) => c.status === "active")) return { tone: "ok", label: "Connected" };
  if (conns.some((c) => c.status === "expired" || c.status === "revoked")) {
    return { tone: "warn", label: "Reconnect needed" };
  }
  return { tone: "neutral", label: "Not connected" };
}

/** The contextual right-side action, mirroring the accordion's precedence so a
 *  click lands in the same connect/disconnect flow. */
function RowAction({
  provider,
  disconnectAction,
}: {
  provider: SerializedProviderRow;
  disconnectAction: (formData: FormData) => void | Promise<void>;
}) {
  const connected = isConnected(provider.connections);
  const liveConn =
    provider.connections.find((c) => c.status === "active") ?? provider.connections[0];
  const needsReconnect =
    !connected && provider.connections.some((c) => c.status === "expired" || c.status === "error");

  // CSV import → the contacts importer.
  if (provider.connType === "csv") {
    return (
      <Link href="/contacts?import=1" className="conn-act conn-act--pri">
        <Icon name="upload" size={12} />
        Import CSV
      </Link>
    );
  }

  // Embed (Live Chat widget) → manage detail where the snippet lives.
  if (provider.connType === "embed") {
    return (
      <Link href={`/connections/${provider.id}`} className="conn-act conn-act--pri">
        <Icon name="chat" size={12} />
        Get embed code
      </Link>
    );
  }

  // Connected → View details + Disconnect.
  if (connected && liveConn) {
    return (
      <>
        <Link href={`/connections/${provider.id}`} className="conn-act">
          View details
        </Link>
        <DisconnectDialog
          connectionId={liveConn.id}
          providerLabel={provider.displayName}
          accountLabel={liveConn.accountLabel}
          action={disconnectAction}
          triggerClassName="conn-kebab"
          triggerLabel="⋮"
        />
      </>
    );
  }

  // Expired/errored (but not active) → Reconnect (retry OAuth / re-auth).
  if (needsReconnect) {
    const href =
      provider.connType === "oauth" && provider.ready && provider.configured
        ? `/api/connections/${provider.id}/authorize`
        : `/connections/${provider.id}`;
    return (
      <Link
        href={href}
        className="conn-act conn-act--reconnect"
        prefetch={href.startsWith("/api/") ? false : undefined}
      >
        Reconnect
      </Link>
    );
  }

  // API-key (paste-credentials) providers connect on their manage detail page.
  if (provider.connType === "api_key" && provider.ready) {
    return (
      <Link href={`/connections/${provider.id}`} className="conn-act conn-act--connect">
        Connect
      </Link>
    );
  }

  // Ready + admin pasted creds → one-click OAuth connect.
  if (provider.ready && provider.configured) {
    return (
      <Link
        href={`/api/connections/${provider.id}/authorize`}
        className="conn-act conn-act--connect"
        prefetch={false}
      >
        Connect
      </Link>
    );
  }

  // Ready but no creds yet → the provider detail page shows the admin setup
  // hint. Present as "Connect" to match the kit (the detail page explains what
  // this server still needs before the OAuth handshake can run).
  if (provider.ready) {
    return (
      <Link href={`/connections/${provider.id}`} className="conn-act conn-act--connect">
        Connect
      </Link>
    );
  }

  // Not ready (App Review / paid tier) → the detail page carries the blocker
  // note. Keep a "Connect" affordance (kit) that lands on that explainer.
  return (
    <Link
      href={`/connections/${provider.id}`}
      className="conn-act conn-act--connect"
      title={provider.blockerNote ?? undefined}
    >
      Connect
    </Link>
  );
}

function Row({
  provider,
  categoryKey,
  disconnectAction,
}: {
  provider: FlatRow;
  categoryKey: string;
  disconnectAction: (formData: FormData) => void | Promise<void>;
}) {
  const st = statusFor(provider);
  const connected = isConnected(provider.connections);
  const liveConn =
    provider.connections.find((c) => c.status === "active") ?? provider.connections[0];
  const sync = newestSync(provider.connections);
  const tag = syncsLabel(provider.syncs);

  // Description precedence: connected → account + last sync; else catalog copy.
  let desc = provider.description;
  if (connected && liveConn) {
    const acct = liveConn.accountLabel ?? provider.displayName;
    desc = sync ? `${acct} · synced ${relativeTime(sync)}` : acct;
  } else if (!provider.ready && provider.blockerNote) {
    desc = provider.blockerNote;
  }

  return (
    <div className="conn-row" data-cat={categoryKey}>
      <span className="conn-row__logo" aria-hidden="true">
        <KitLogo provider={provider.id} size={22} />
      </span>
      <div className="conn-row__namewrap">
        <span className="conn-row__name">{provider.displayName}</span>
        {tag && <span className="conn-row__tag">{tag}</span>}
      </div>
      <div className="conn-row__desc" title={desc}>
        {desc}
      </div>
      <div className="conn-row__right">
        <span className={`conn-status conn-status--${st.tone}`}>
          <span className="conn-status__dot" />
          {st.label}
        </span>
        <RowAction provider={provider} disconnectAction={disconnectAction} />
      </div>
    </div>
  );
}

export function ConnectionsBrowser({
  sections,
  disconnectAction,
}: {
  sections: SerializedSection[];
  disconnectAction: (formData: FormData) => void | Promise<void>;
}) {
  const [activeCat, setActiveCat] = useState("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Flatten every provider once, tagging its category.
  const allRows: FlatRow[] = useMemo(
    () =>
      sections.flatMap((s) =>
        s.providers.map((p) => ({ ...p, categoryKey: s.key })),
      ),
    [sections],
  );

  // Category counts (# providers in each category); "all" = total.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allRows.length };
    for (const s of sections) c[s.key] = s.providers.length;
    return c;
  }, [sections, allRows.length]);

  const visible = useMemo(() => {
    let rows = activeCat === "all" ? allRows : allRows.filter((r) => r.categoryKey === activeCat);
    if (q) {
      rows = rows.filter((r) =>
        `${r.displayName} ${r.description}`.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [allRows, activeCat, q]);

  const connectedCount = useMemo(
    () => allRows.filter((r) => isConnected(r.connections)).length,
    [allRows],
  );

  return (
    <div className="col" style={{ gap: 20 }}>
      {/* Category filter cards */}
      <div className="conn-cats" role="tablist" aria-label="Integration categories">
        {CATS.map((cat) => {
          const active = activeCat === cat.key;
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`conn-cat${active ? " conn-cat--active" : ""}`}
              onClick={() => setActiveCat(cat.key)}
            >
              <span className={`conn-cat__tile${cat.asset ? " conn-cat__tile--plain" : ""}`}>
                {cat.asset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${ASSET_BASE}${cat.asset}`} alt="" aria-hidden="true" />
                ) : (
                  <Icon name="grid" size={20} />
                )}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="conn-cat__title">{cat.title}</div>
                <div className="conn-cat__desc">{cat.desc}</div>
              </div>
              <span className="conn-cat__count">{counts[cat.key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Integration list card */}
      <div className="conn-card" style={{ overflow: "hidden" }}>
        <div className="conn-sec">
          <span className="conn-sec__ico" aria-hidden="true">
            <Icon name="grid" size={16} />
          </span>
          <div>
            <h3 className="conn-sec__title">Connected integrations</h3>
            <div className="conn-sec__sub">
              Every platform, by category — connect the ones you use.
            </div>
          </div>
          <span className="conn-sec__count" style={{ marginLeft: 10 }}>
            {connectedCount}
          </span>
          <label className="conn-search conn-sec__spacer">
            <Icon name="search" size={14} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search integrations…"
              aria-label="Search integrations"
            />
          </label>
        </div>

        {visible.length === 0 ? (
          <div
            style={{
              padding: "36px 20px",
              textAlign: "center",
              color: "var(--conn-muted)",
              fontSize: 13,
              borderTop: "1px solid var(--conn-line-soft)",
            }}
          >
            No integrations match “{query.trim()}”. Try a different name, or{" "}
            <a
              href="mailto:hello@repulabs.com?subject=Integration%20request"
              style={{ color: "var(--conn-indigo)" }}
            >
              request it
            </a>
            .
          </div>
        ) : (
          <div className="conn-list">
            {visible.map((p) => (
              <Row
                key={`${p.categoryKey}-${p.id}`}
                provider={p}
                categoryKey={p.categoryKey}
                disconnectAction={disconnectAction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
