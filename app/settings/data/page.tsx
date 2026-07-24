import { Icon } from "@/components/shell/icon";
import { SettingsFrame } from "../_components/settings-frame";
import { loadSettingsData } from "../_lib/data";
import { DeleteWorkspaceForm } from "./_components/delete-workspace-form";

/**
 * Data & export (designs/settings/date n export/date n export.png).
 *
 * A green-tinted data-export card (self-serve CSV export ships next release)
 * plus a red danger-zone "Delete workspace" with type-to-confirm, bound to the
 * existing deleteAccount server action.
 */
export const dynamic = "force-dynamic";

const ASSET = "/assets/repulabs/settings";

export default async function DataSettingsPage() {
  const { org, members } = await loadSettingsData();
  const memberLabel = `${members.length} ${members.length === 1 ? "member" : "members"}`;

  return (
    <SettingsFrame>
      {/* ── Data export (safe) ──────────────────────────────────────── */}
      <section className="set-card set-card--green">
        <div className="set-sec-head">
          <span className="set-tile set-tile--emerald">
            {/* biome-ignore lint/a11y/useAltText: decorative export art */}
            <img src={`${ASSET}/data-export.svg`} alt="" aria-hidden="true" />
          </span>
          <div>
            <h2 className="set-card__title">Data export</h2>
            <p className="set-card__sub">Download a copy of your workspace data</p>
          </div>
        </div>

        <div className="set-export-row">
          <div className="set-export-row__info">
            <span className="set-tile set-tile--emerald">
              {/* biome-ignore lint/a11y/useAltText: decorative CSV art */}
              <img src={`${ASSET}/data-csv.svg`} alt="" aria-hidden="true" />
            </span>
            <div>
              <div className="set-export-row__title">Export reviews &amp; contacts</div>
              <div className="set-export-row__desc">
                CSV export of reviews, requests and contacts.
              </div>
              <div className="set-export-row__note">Self-serve export ships next release.</div>
            </div>
          </div>
          <button type="button" className="set-btn set-btn--success" disabled aria-disabled="true">
            <Icon name="download" size={16} className="set-btn__ic" />
            Request export
          </button>
        </div>
      </section>

      {/* ── Danger zone ─────────────────────────────────────────────── */}
      <section className="set-card set-card--danger" aria-label="Delete workspace">
        <div className="set-sec-head">
          <span className="set-tile set-tile--red">
            {/* biome-ignore lint/a11y/useAltText: decorative trash art */}
            <img src={`${ASSET}/data-trash.svg`} alt="" aria-hidden="true" />
          </span>
          <div>
            <h2 className="set-card__title" style={{ color: "var(--set-red-2)" }}>
              Delete workspace
            </h2>
            <p className="set-card__sub" style={{ color: "var(--set-ink-2)", maxWidth: 640 }}>
              Deleting <strong>{org.name}</strong> schedules the workspace for removal and
              immediately revokes access for all {memberLabel}. This cannot be undone from here —
              contact support within 30 days to recover.
            </p>
          </div>
        </div>

        <DeleteWorkspaceForm orgName={org.name} />
      </section>
    </SettingsFrame>
  );
}
