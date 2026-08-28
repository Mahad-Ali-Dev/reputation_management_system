"use client";

import { Icon } from "@/components/shell/icon";
import { syncShopifyContacts } from "@/lib/contacts/actions";
import Link from "next/link";
import { useState, useTransition } from "react";

/**
 * Shopify customer-sync card (client, connection-gated) — re-skinned to the kit.
 *
 * Not connected: kit sync illustration + a green/neutral "Shopify isn't
 * connected" panel with a dark "Connect Shopify" deep-link. Connected: the same
 * illustration + a green connected panel and a "Sync now" button that calls
 * `syncShopifyContacts` — which returns `{ skipped: "shopify_not_configured" }`
 * if creds are missing, so this never makes a live paid call in default paths.
 */

const ART = "/assets/repulabs/contact-directory";

export function ShopifySyncCard({ connected }: { connected: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "bad"; text: string } | null>(null);
  const [synced, setSynced] = useState<number | null>(null);

  function sync() {
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await syncShopifyContacts(new FormData());
        if (r.skipped) {
          setMessage({ kind: "warn", text: "Shopify isn’t fully configured yet nothing to sync." });
        } else {
          setSynced(r.synced);
          setMessage({ kind: "ok", text: `Synced ${r.synced.toLocaleString()} customer${r.synced === 1 ? "" : "s"}.` });
        }
      } catch (e) {
        setMessage({ kind: "bad", text: e instanceof Error ? e.message : "Sync failed." });
      }
    });
  }

  return (
    <div className="cd-card">
      <div className="cd-ie-head">
        <span className="cd-ie-head__tile cd-ie-head__tile--green">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/shopify-bag.svg`} alt="" aria-hidden width={22} height={22} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="cd-ie-head__title">Sync from Shopify</h3>
          <p className="cd-ie-head__sub">Pull customers from your connected store into Contacts.</p>
        </div>
      </div>

      <div style={{ padding: 20 }}>
        {/* Sync flow illustration */}
        <div style={{ display: "grid", placeItems: "center", marginBottom: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/shopify-sync.svg`} alt="" aria-hidden className="cd-illus cd-illus--sync" />
        </div>

        {!connected ? (
          <div className="cd-shop cd-shop--off">
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--cd-ink)" }}>
              Shopify isn’t connected.
            </div>
            <p style={{ fontSize: 12.5, color: "var(--cd-ink-2)", margin: "4px 0 12px" }}>
              Link your store to sync customers automatically.
            </p>
            <Link
              href="/connections#connection-sources"
              className="btn btn--sm"
              style={{ background: "#060b23", color: "#fff", borderColor: "#060b23" }}
            >
              <Icon name="plug" size={13} />
              Connect Shopify
            </Link>
          </div>
        ) : (
          <div className="cd-shop cd-shop--ok">
            <div className="cd-shop__row" style={{ justifyContent: "space-between" }}>
              <div className="cd-shop__row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${ART}/shopify-bag.svg`} alt="" aria-hidden width={18} height={18} />
                <span style={{ fontWeight: 700, color: "var(--cd-ink)" }}>Connected store</span>
              </div>
              <span className="cd-badge cd-badge--ok">Connected</span>
            </div>
            <div className="cd-shop__metrics">
              <div>
                <div className="cd-shop__metric-v">{(synced ?? 0).toLocaleString()}</div>
                <div className="cd-shop__metric-l">Customers synced</div>
              </div>
              <div>
                <div className="cd-shop__metric-v" style={{ color: "var(--cd-ink)" }}>Live</div>
                <div className="cd-shop__metric-l">Connection</div>
              </div>
              <div>
                <div className="cd-shop__metric-v" style={{ color: "var(--cd-ink)" }}>On</div>
                <div className="cd-shop__metric-l">Auto sync</div>
              </div>
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn--pri btn--sm" disabled={pending} onClick={sync}>
                <Icon name="refresh" size={13} />
                {pending ? "Syncing…" : "Sync now"}
              </button>
              <Link href="/connections#connection-sources" className="cd-btn-out">
                Manage integration
              </Link>
            </div>
          </div>
        )}

        {message && (
          <p
            className={`cd-badge ${message.kind === "ok" ? "cd-badge--ok" : message.kind === "warn" ? "cd-badge--warn" : "cd-badge--warn"}`}
            style={{ marginTop: 12 }}
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
