import { Icon } from "@/components/shell/icon";
import { deleteAccount } from "@/lib/account/actions";
import { loadSettingsData } from "../_lib/data";

/**
 * Data & export — workspace data portability plus the danger zone
 * (delete workspace, bound to the existing deleteAccount server action).
 */
export const dynamic = "force-dynamic";

export default async function DataSettingsPage() {
  const { org, members } = await loadSettingsData();

  return (
    <>
      {/* Export */}
      <section className="ds-card">
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Data export</h3>
            <div className="ds-card__sub">Download a copy of your workspace data</div>
          </div>
        </div>
        <div className="ds-card__body">
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              padding: 14,
              borderRadius: 10,
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
            }}
          >
            <div className="row" style={{ gap: 12 }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "var(--pri-50)",
                  color: "var(--pri)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="download" size={18} />
              </span>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Export reviews & contacts</div>
                <div className="dim" style={{ fontSize: 12 }}>
                  CSV export of reviews, requests and contacts. Self-serve export ships next release.
                </div>
              </div>
            </div>
            <button type="button" className="btn btn--sm" disabled aria-disabled="true">
              <Icon name="download" size={12} />
              Request export
            </button>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section className="ds-card" style={{ borderColor: "var(--bad)" }}>
        <div className="ds-card__head">
          <h3 className="ds-card__title" style={{ color: "var(--bad)" }}>
            Delete workspace
          </h3>
        </div>
        <div className="ds-card__body">
          <p className="dim" style={{ fontSize: 12.5, marginTop: 0 }}>
            Deleting <strong>{org.name}</strong> schedules the workspace for removal and immediately
            revokes access for all {members.length}{" "}
            {members.length === 1 ? "member" : "members"}. This cannot be undone from here — contact
            support within 30 days to recover.
          </p>
          <form action={deleteAccount} style={{ marginTop: 8 }}>
            <label htmlFor="confirm" className="lbl">
              Type <strong>{org.name}</strong> to confirm
            </label>
            <input
              id="confirm"
              name="confirm"
              required
              placeholder={org.name}
              autoComplete="off"
              style={{
                width: "100%",
                height: 38,
                padding: "0 14px",
                borderRadius: "var(--r)",
                border: "1px solid var(--bad)",
                background: "var(--surface)",
                color: "var(--ink)",
                fontSize: 13,
                outline: "none",
                marginTop: 4,
              }}
            />
            <div className="row" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button type="submit" className="btn btn--danger">
                <Icon name="trash" size={12} />
                Delete this workspace
              </button>
            </div>
          </form>
        </div>
      </section>
    </>
  );
}
