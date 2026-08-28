"use client";

import { Icon } from "@/components/shell/icon";
import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Dismissible zero-state checklist for the Contacts directory.
 *
 * Shown ABOVE the tabs only when `totalContacts === 0` (the server parent gates
 * rendering). Three ways to populate the directory:
 *   1. Import a CSV        → `/contacts?tab=import`
 *   2. Connect a source    → `/connections`
 *   3. Add manually        → opens the Add Contact dialog via a window event
 *      (`contacts:add`) the dialog island listens for.
 *
 * Local cosmetic dismissal persists in `localStorage` (per the
 * `components/getting-started.tsx` convention) — no schema, client-only.
 */

const DISMISS_KEY = "gs:dismissed:contacts-zero";

export function ContactsGettingStarted() {
  const [hydrated, setHydrated] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      // private mode / sandboxed iframe — treat as not dismissed.
    }
    setHydrated(true);
  }, []);

  if (!hydrated || dismissed) return null;

  function hide() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // best-effort
    }
  }

  function openAdd() {
    window.dispatchEvent(new CustomEvent("contacts:add"));
  }

  return (
    <div
      className="ds-card"
      style={{
        marginBottom: 16,
        background: "linear-gradient(160deg, var(--pri-50), var(--surface-2))",
        borderColor: "var(--pri-100)",
      }}
    >
      <div className="ds-card__body">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="lbl-mono" style={{ color: "var(--pri)", marginBottom: 4 }}>
              Getting started
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)" }}>
              Build your contact directory
            </h3>
            <p style={{ fontSize: 13, color: "var(--rl-muted)", marginTop: 4, maxWidth: 560 }}>
              Every customer who touches your business lands here automatically from reviews,
              surveys, live chat and more. Kick it off in one of three ways:
            </p>
          </div>
          <button
            type="button"
            onClick={hide}
            aria-label="Dismiss getting started"
            className="btn btn--ghost btn--xs"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div
          className="grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
            marginTop: 16,
          }}
        >
          <Step
            icon="upload"
            title="Import a CSV"
            body="Bulk-add up to 10,000 contacts with column mapping + dedupe."
          >
            <Link href="/contacts?tab=import" className="btn btn--pri btn--sm">
              <Icon name="upload" size={13} />
              Import contacts
            </Link>
          </Step>
          <Step
            icon="plug"
            title="Connect a source"
            body="Sync customers from Shopify, your POS, or CRM automatically."
          >
            <Link href="/connections" className="btn btn--sm">
              <Icon name="plug" size={13} />
              Connect a source
            </Link>
          </Step>
          <Step
            icon="plus"
            title="Add manually"
            body="Enter a single contact with custom fields and tags."
          >
            <button type="button" onClick={openAdd} className="btn btn--sm">
              <Icon name="plus" size={13} />
              Add a contact
            </button>
          </Step>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  body,
  children,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
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
        <Icon name={icon} size={16} />
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{title}</div>
      <p style={{ fontSize: 12, color: "var(--rl-muted)", lineHeight: 1.5, flex: 1, margin: 0 }}>
        {body}
      </p>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  );
}
