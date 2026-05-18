import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { generateSelfServiceQr } from "@/lib/hardware/actions";
import Link from "next/link";

/**
 * Self-service QR creation — free-tier core flow.
 *
 * Users can spin up a QR code without buying physical hardware. The form
 * picks an establishment, optionally accepts a manually-pasted Google
 * review URL, and the server action provisions a Device row with status
 * "active" + a fresh signed shortSlug. The redirect URL falls back to a
 * search URL if the establishment has no googlePlaceId.
 *
 * Branching:
 *   - User has zero establishments → friendly redirect prompt
 *   - User has at least one         → form with establishment picker
 */

export const dynamic = "force-dynamic";

export default async function NewQrPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;

  const establishments = await withTenant(orgId, (tx) =>
    tx.establishment.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, googlePlaceId: true },
    }),
  );

  if (establishments.length === 0) {
    return (
      <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "QR Stands", "Generate"]}>
        <PageHeader
          kicker="Generate a QR code"
          title="Add a listing first"
          description="A QR code points to a specific listing's Google review page. Add your first listing so we know where to send scanners."
          actions={
            <Link href="/establishments/new" className="btn btn--pri">
              <Icon name="plus" size={12} />
              Add listing
            </Link>
          }
        />
        <div
          className="ds-card"
          style={{ padding: 48, textAlign: "center", maxWidth: 520, marginInline: "auto" }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              margin: "0 auto 18px",
              background: "var(--pri-50)",
              color: "var(--pri)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon name="building" size={26} />
          </div>
          <h3 style={{ fontSize: 17, fontWeight: 600 }}>No listings yet</h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Add the listing this QR will point to. Once it exists, you can connect Google Business
            Profile to pull reviews automatically — or paste your Google review link directly.
          </p>
          <Link href="/establishments/new" className="btn btn--pri" style={{ marginTop: 16 }}>
            <Icon name="plus" size={12} />
            Add your first listing
          </Link>
        </div>
      </AppShellServer>
    );
  }

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "QR Stands", "Generate"]}>
      <PageHeader
        kicker="Free · self-service"
        title="Generate a QR code"
        description="Customers scan, land on your Google review page, leave a review. No hardware needed — print this QR on receipts, signage, business cards, or just embed it on your site."
        actions={
          <Link href="/hardware" className="btn">
            <Icon name="chevL" size={12} />
            Back to QR stands
          </Link>
        }
      />

      {sp.error && (
        <div
          className="ds-card"
          style={{
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 12.5,
            background: "var(--bad-soft)",
            borderColor: "var(--bad)",
            color: "#b91c1c",
          }}
        >
          We couldn't generate the QR. Double-check the inputs and try again.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        {/* Form */}
        <section className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Configure</h3>
            <span className="chip chip--pri">No hardware required</span>
          </div>
          <div className="ds-card__body">
            <form action={generateSelfServiceQr} className="col" style={{ gap: 16 }}>
              {/* Step 1: pick establishment */}
              <fieldset style={{ border: 0, padding: 0, margin: 0 }} aria-label="Step 1 — business">
                <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                  <StepBadge n={1} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Pick the business</span>
                </div>
                <label className="col" style={{ gap: 4 }}>
                  <span className="lbl">Business this QR points to</span>
                  <select
                    name="establishmentId"
                    required
                    defaultValue={establishments[0]?.id}
                    style={selectStyle}
                  >
                    {establishments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {!e.googlePlaceId ? " (no Google link yet)" : ""}
                      </option>
                    ))}
                  </select>
                  <span className="dim" style={{ fontSize: 11.5 }}>
                    Don't see it?{" "}
                    <Link
                      href="/establishments/new"
                      style={{ color: "var(--pri)", textDecoration: "none" }}
                    >
                      Add a business →
                    </Link>
                  </span>
                </label>
              </fieldset>

              {/* Step 2: review URL */}
              <fieldset
                style={{ border: 0, padding: 0, margin: 0 }}
                aria-label="Step 2 — review URL"
              >
                <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                  <StepBadge n={2} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    Google review link (optional)
                  </span>
                </div>
                <label className="col" style={{ gap: 4 }}>
                  <span className="lbl">Paste your Google review link</span>
                  <input
                    type="url"
                    name="reviewUrl"
                    placeholder="https://g.page/r/..."
                    autoComplete="off"
                    style={inputStyle}
                  />
                  <span className="dim" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                    Leave blank to use your connected Google Business Profile, or paste the link
                    Google gives you on your business profile (Share → Get review link).
                  </span>
                </label>
              </fieldset>

              {/* Step 3: name */}
              <fieldset style={{ border: 0, padding: 0, margin: 0 }} aria-label="Step 3 — name">
                <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                  <StepBadge n={3} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Internal label (optional)</span>
                </div>
                <label className="col" style={{ gap: 4 }}>
                  <span className="lbl">Where will you use it?</span>
                  <input
                    type="text"
                    name="displayName"
                    placeholder="e.g. Front desk · Receipt footer · Counter sign"
                    maxLength={64}
                    autoComplete="off"
                    style={inputStyle}
                  />
                  <span className="dim" style={{ fontSize: 11.5 }}>
                    Just for your dashboard — customers never see this.
                  </span>
                </label>
              </fieldset>

              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  gap: 8,
                  marginTop: 8,
                  paddingTop: 14,
                  borderTop: "1px solid var(--line)",
                }}
              >
                <Link href="/hardware" className="btn">
                  Cancel
                </Link>
                <button type="submit" className="btn btn--pri">
                  <Icon name="qr" size={12} />
                  Generate QR code
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Side card */}
        <aside className="col" style={{ gap: 14 }}>
          <div className="ds-card">
            <div className="ds-card__head">
              <h3 className="ds-card__title">How it works</h3>
            </div>
            <div className="ds-card__body col" style={{ gap: 14, fontSize: 13, lineHeight: 1.55 }}>
              <Step
                n={1}
                t="Pick or add your business"
                d="Each QR points to one business's Google review page. You can manage as many businesses as you have establishments."
              />
              <Step
                n={2}
                t="Paste a Google link (or skip)"
                d="If your business is on Google, we'll generate the review link automatically. Or paste your existing share-link — it works either way."
              />
              <Step
                n={3}
                t="Download or print"
                d="We'll show you the QR right after generating. Download PNG, SVG, or PDF. Print it. Embed it. Share it."
              />
            </div>
          </div>

          <div
            className="ds-card ds-card--pri"
            style={{ padding: 16, fontSize: 12.5, lineHeight: 1.55 }}
          >
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <Icon name="sparkle" size={14} style={{ color: "var(--pri)" }} />
              <strong>Pro tier unlocks more</strong>
            </div>
            <p className="dim" style={{ margin: 0 }}>
              On Pro, every review that comes in from these QR codes gets an AI-drafted reply ready
              for you to approve. Plus per-QR analytics, channel attribution, and unlimited codes.
            </p>
            <Link href="/subscription" className="btn btn--xs btn--pri" style={{ marginTop: 10 }}>
              See Pro features →
            </Link>
          </div>

          <div className="ds-card" style={{ padding: 16, fontSize: 12, lineHeight: 1.55 }}>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <Icon name="help" size={13} style={{ color: "var(--rl-muted)" }} />
              <strong>Where do I find my Google review link?</strong>
            </div>
            <ol className="dim" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Search your business name on Google</li>
              <li>On the business panel, click "Ask for reviews"</li>
              <li>Copy the link (usually starts with g.page/r/...)</li>
              <li>Paste it above</li>
            </ol>
          </div>
        </aside>
      </div>
    </AppShellServer>
  );
}

const inputStyle = {
  width: "100%",
  height: 42,
  padding: "0 14px",
  borderRadius: "var(--r)",
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink)",
  fontFamily: "var(--f-mono)",
  fontSize: 13,
  outline: "none",
} as const;

const selectStyle = {
  ...inputStyle,
  fontFamily: "var(--f-ui)",
  paddingRight: 32,
  appearance: "none" as const,
};

function StepBadge({ n }: { n: number }) {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        background: "var(--pri-50)",
        color: "var(--pri)",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--f-mono)",
        fontSize: 10.5,
        fontWeight: 600,
      }}
    >
      {n}
    </span>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
      <StepBadge n={n} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{t}</div>
        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
          {d}
        </div>
      </div>
    </div>
  );
}
