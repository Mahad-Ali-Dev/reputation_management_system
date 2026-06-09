"use client";

import { Icon } from "@/components/shell/icon";
import { syncShopifyContacts } from "@/lib/contacts/actions";
import Link from "next/link";
import { useState, useTransition } from "react";

/**
 * Shopify customer-sync card (client, connection-gated).
 *
 * Disabled with a "Connect Shopify" deep-link when the Shopify `Connection` is
 * absent (server passes `connected`). When connected, a "Sync customers" button
 * calls `syncShopifyContacts` — which is itself a no-op returning
 * `{ skipped: "shopify_not_configured" }` if creds are missing, so this never
 * makes a live paid call in default code paths.
 */

export function ShopifySyncCard({ connected }: { connected: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "bad"; text: string } | null>(null);

  function sync() {
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await syncShopifyContacts(new FormData());
        if (r.skipped) {
          setMessage({ kind: "warn", text: "Shopify isn’t fully configured yet — nothing to sync." });
        } else {
          setMessage({ kind: "ok", text: `Synced ${r.synced.toLocaleString()} customer${r.synced === 1 ? "" : "s"}.` });
        }
      } catch (e) {
        setMessage({ kind: "bad", text: e instanceof Error ? e.message : "Sync failed." });
      }
    });
  }

  return (
    <div className="ds-card">
      <div className="ds-card__head">
        <div>
          <h3 className="ds-card__title">Sync from Shopify</h3>
          <p className="ds-card__sub">Pull customers from your connected store into Contacts.</p>
        </div>
        <Icon name="plug" size={18} style={{ color: "var(--rl-muted-2)" }} />
      </div>
      <div className="ds-card__body">
        {!connected ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "flex-start",
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--r)",
              padding: 16,
            }}
          >
            <span className="dim" style={{ fontSize: 13 }}>
              Shopify isn’t connected. Link your store to sync customers automatically.
            </span>
            <Link href="/connections#connection-sources" className="btn btn--pri btn--sm">
              <Icon name="plug" size={13} />
              Connect Shopify
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="chip chip--ok" style={{ alignSelf: "flex-start" }}>
              <Icon name="check" size={12} />
              Shopify connected
            </span>
            <button type="button" className="btn btn--sm" disabled={pending} onClick={sync} style={{ alignSelf: "flex-start" }}>
              <Icon name="refresh" size={13} />
              {pending ? "Syncing…" : "Sync customers"}
            </button>
          </div>
        )}

        {message && (
          <p
            className={`chip ${message.kind === "ok" ? "chip--ok" : message.kind === "warn" ? "chip--warn" : "chip--bad"}`}
            style={{ display: "inline-flex", marginTop: 12 }}
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
