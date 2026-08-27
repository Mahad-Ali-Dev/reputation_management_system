import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { roleAtLeast } from "@/lib/auth/rbac";
import { deleteEstablishment, updateEstablishment } from "@/lib/establishments/actions";
import { getEstablishment } from "@/lib/establishments/queries";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

/**
 * Establishment settings — the tab content the detail page's "Settings" tab
 * pointed at without a destination (bug 005 in the June 2026 assessment: the
 * tab was a dead button). Edit the location's details (name / category /
 * timezone / address via `updateEstablishment`) and house the danger zone.
 */

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Address = {
  line1?: string;
  street?: string;
  city?: string;
  region?: string;
  postal?: string;
  postcode?: string;
  country?: string;
};

export default async function EstablishmentSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { orgId, role } = await getOrgContext();
  const establishment = await getEstablishment(orgId, id);
  if (!establishment) notFound();

  // deleteEstablishment requires "admin" — don't render a button that can
  // only throw for manager/member/viewer roles.
  const canDelete = roleAtLeast(role, "admin");

  const sp = await searchParams;
  const addr = (establishment.address ?? {}) as Address;

  async function saveAction(form: FormData) {
    "use server";
    try {
      await updateEstablishment(id, form);
    } catch (err) {
      // redirect()/notFound() control-flow must propagate (e.g. an expired
      // session redirecting to /login from inside the action).
      const digest = (err as { digest?: unknown } | null)?.digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
      // Validation/transient failure — land back on the form with a flag
      // instead of crashing the route (server-action errors are masked in
      // production builds anyway).
      redirect(`/establishments/${id}/settings?saved=error`);
    }
    redirect(`/establishments/${id}/settings?saved=1`);
  }

  return (
    <AppShellServer
      topBar={<TopBar />}
      crumbs={["Business Setup", "My Businesses", establishment.name, "Settings"]}
    >
      <PageHeader
        kicker="Location settings"
        title={establishment.name}
        description="Details, address, and the danger zone for this location."
      />

      {/* Tabs — mirrors the detail page's tab row with Settings active. */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <Link href={`/establishments/${establishment.id}`} className="tabs__t" style={{ textDecoration: "none" }}>
          Overview
        </Link>
        <Link
          href={`/reviews?establishment=${establishment.id}`}
          className="tabs__t"
          style={{ textDecoration: "none" }}
        >
          Reviews
        </Link>
        <Link href="/connections" className="tabs__t" style={{ textDecoration: "none" }}>
          Connections
        </Link>
        <button type="button" className="tabs__t is-active">
          Settings
        </button>
      </div>

      {sp.saved === "1" && (
        <div
          className="ds-card row"
          role="status"
          style={{
            padding: "10px 14px",
            marginBottom: 14,
            gap: 8,
            background: "var(--ok-soft, #dcfce7)",
            borderColor: "var(--ok)",
            fontSize: 13,
          }}
        >
          <Icon name="checkCircle" size={13} style={{ color: "var(--ok)" }} />
          Location details saved.
        </div>
      )}
      {sp.saved === "error" && (
        <div
          className="ds-card row"
          role="alert"
          style={{
            padding: "10px 14px",
            marginBottom: 14,
            gap: 8,
            background: "var(--bad-soft, #fee2e2)",
            borderColor: "var(--bad)",
            fontSize: 13,
          }}
        >
          <Icon name="alert" size={13} style={{ color: "var(--bad)" }} />
          Couldn&apos;t save — check the fields and try again.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 14,
          alignItems: "start",
        }}
      >
        {/* Edit details */}
        <div className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Business details</h3>
          </div>
          <div className="ds-card__body">
            <form action={saveAction} className="col" style={{ gap: 12 }}>
              <label className="lbl">
                Business name
                <input
                  name="name"
                  className="ds-input"
                  defaultValue={establishment.name}
                  required
                  maxLength={120}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="lbl">
                  Category
                  <input
                    name="category"
                    className="ds-input"
                    defaultValue={establishment.category ?? ""}
                    placeholder="e.g. Coffee shop"
                    maxLength={60}
                  />
                </label>
                <label className="lbl">
                  Timezone
                  <input
                    name="timezone"
                    className="ds-input"
                    defaultValue={establishment.timezone ?? "UTC"}
                    placeholder="e.g. America/New_York"
                    maxLength={60}
                  />
                </label>
              </div>
              <label className="lbl">
                Street address
                <input
                  name="address_line1"
                  className="ds-input"
                  defaultValue={addr.line1 ?? addr.street ?? ""}
                  maxLength={200}
                />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="lbl">
                  City
                  <input name="address_city" className="ds-input" defaultValue={addr.city ?? ""} maxLength={100} />
                </label>
                <label className="lbl">
                  State / Region
                  <input name="address_region" className="ds-input" defaultValue={addr.region ?? ""} maxLength={100} />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label className="lbl">
                  Postal code
                  <input
                    name="address_postal"
                    className="ds-input"
                    defaultValue={addr.postal ?? addr.postcode ?? ""}
                    maxLength={20}
                  />
                </label>
                <label className="lbl">
                  Country
                  <input
                    name="address_country"
                    className="ds-input"
                    defaultValue={addr.country ?? ""}
                    placeholder="e.g. US"
                    maxLength={60}
                  />
                </label>
              </div>
              <label className="lbl">
                Review link
                <input
                  name="reviewLinkOverride"
                  type="url"
                  className="ds-input"
                  defaultValue={establishment.reviewLinkOverride ?? ""}
                  placeholder="https://g.page/r/.../review"
                  maxLength={500}
                />
              </label>
              <p className="dim" style={{ fontSize: 11.5, margin: "-6px 0 4px", lineHeight: 1.5 }}>
                {establishment.reviewLinkOverride
                  ? "Review requests send customers here."
                  : establishment.googlePlaceId
                    ? "Empty — review requests use your connected Google Business Profile. Set a link here to send customers somewhere specific instead."
                    : "Empty and no Google Business Profile connected — review requests will fall back to a generic Google search. Paste your review link to fix this."}
              </p>

              <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
                <button type="submit" className="btn btn--pri">
                  <Icon name="check" size={12} />
                  Save changes
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right: connection summary + danger zone */}
        <div className="col" style={{ gap: 14 }}>
          <div className="ds-card">
            <div className="ds-card__head">
              <h3 className="ds-card__title">Google Business Profile</h3>
              {/* getEstablishment pre-filters connections to status:"active" */}
              {establishment.connections.some((c) => c.provider === "google_business") ? (
                <span className="chip chip--ok">
                  <Icon name="checkCircle" size={9} stroke={2.4} />
                  Connected
                </span>
              ) : (
                <span className="chip chip--warn">Not connected</span>
              )}
            </div>
            <div className="ds-card__body" style={{ fontSize: 12.5 }}>
              <p className="dim" style={{ lineHeight: 1.6, margin: 0 }}>
                Connection management lives on the{" "}
                <Link href={`/establishments/${establishment.id}#connect`} style={{ color: "var(--pri)" }}>
                  Overview tab
                </Link>
                .
              </p>
            </div>
          </div>

          {canDelete && (
          <div className="ds-card" style={{ borderColor: "var(--bad-soft)" }}>
            <div className="ds-card__head">
              <h3 className="ds-card__title" style={{ color: "var(--bad)" }}>
                Danger zone
              </h3>
            </div>
            <div className="ds-card__body">
              <form
                action={async () => {
                  "use server";
                  try {
                    await deleteEstablishment(id);
                  } catch (err) {
                    const digest = (err as { digest?: unknown } | null)?.digest;
                    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw err;
                    redirect(`/establishments/${id}/settings?saved=error`);
                  }
                }}
              >
                <button type="submit" className="btn btn--danger btn--sm">
                  <Icon name="trash" size={11} />
                  Delete establishment
                </button>
              </form>
              <p className="dim" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
                Soft-deletes the record. Reviews remain attached. You have 30 days to undo via
                support.
              </p>
            </div>
          </div>
          )}
        </div>
      </div>
    </AppShellServer>
  );
}
