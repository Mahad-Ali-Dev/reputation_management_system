"use client";

import { Icon, type IconName } from "@/components/shell/icon";
import Link from "next/link";
import { useState } from "react";
import { AddContactDialog } from "./add-contact-dialog";

/**
 * Contacts tab — empty state (kit design). Shown under the (all-zero) KPI row
 * when the directory has no contacts. Two panels:
 *   - Left: big 3D contact-book illustration + "No contacts yet" + a primary
 *     "Add your first contact" (opens the real `<AddContactDialog/>`) and a
 *     secondary "Import contacts" (→ Import & Export tab).
 *   - Right: "Build stronger connections" education card with a benefits
 *     checklist and a "See how it works" link.
 * Client island because the primary CTA opens the add-contact modal directly
 * (at zero contacts the workspace + its dialog aren't mounted).
 */

const CHECKS: { icon: IconName; label: string }[] = [
  { icon: "upload", label: "Import from CSV or other tools" },
  { icon: "tag", label: "Segment & tag your contacts" },
  { icon: "trend", label: "Track interactions & activity" },
  { icon: "send", label: "Engage across multiple channels" },
];

const ART = "/assets/repulabs/contact-directory";

export function ContactsEmpty() {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="cd-ie-grid" style={{ alignItems: "stretch", marginBottom: 0 }}>
      {/* Main empty panel */}
      <div className="cd-card">
        <div className="cd-empty cd-empty--center">
          <div className="cd-empty__art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${ART}/contact-book.svg`}
              alt=""
              aria-hidden
              className="cd-illus cd-illus--book"
              style={{ width: 340 }}
            />
          </div>
          <div>
            <h2 className="cd-empty__title">No contacts yet</h2>
            <p className="cd-empty__body">
              Looks like your contact directory is empty. Get started by importing your contacts or
              adding your first one manually.
            </p>
            <div className="cd-empty__actions">
              <button type="button" className="btn btn--pri btn--sm" onClick={() => setAddOpen(true)}>
                <Icon name="plus" size={14} />
                Add your first contact
              </button>
              <Link href="/contacts?tab=import" className="cd-btn-out">
                <Icon name="upload" size={14} />
                Import contacts
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Education panel */}
      <div className="cd-card cd-card--pad">
        <div style={{ display: "grid", placeItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${ART}/connections-box.svg`}
            alt=""
            aria-hidden
            className="cd-illus cd-illus--edu"
          />
        </div>
        <h3 className="cd-edu__title">Build stronger connections</h3>
        <p className="cd-edu__body">
          Organize, engage, and grow your relationships across every channel.
        </p>
        <ul className="cd-check">
          {CHECKS.map((c) => (
            <li key={c.label}>
              <span className="cd-check__ico">
                <Icon name={c.icon} size={13} />
              </span>
              {c.label}
            </li>
          ))}
        </ul>
        <Link href="/contacts?tab=import" className="cd-btn-ghost-vio">
          <Icon name="play" size={14} />
          See how it works
        </Link>
      </div>

      <AddContactDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
