import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { activateDevice } from "@/lib/hardware/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Hardware activation page — paired with a QR review stand.
 *
 * The customer scans the printed code, the stand redirects to /r/{slug}; the
 * operator activates a new stand HERE by entering the 8-char code from the
 * card in the box and picking which establishment it points to.
 */
export default async function ActivatePage() {
  const { orgId } = await getOrgContext();

  const establishments = await withTenant(orgId, (tx) =>
    tx.establishment.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  );

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Hardware", "Activate"]}>
      <PageHeader
        kicker="Hardware"
        title="Activate a Review Stand"
        description="Enter the 8-character activation code from the card inside your stand's package, then pick which location it lives at."
        actions={
          <Link href="/hardware" className="btn">
            <Icon name="chevL" size={12} />
            Back to hardware
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
          gap: 18,
          alignItems: "flex-start",
        }}
      >
        <section className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">Activation code</h3>
            <span className="chip">8 characters · Crockford base32</span>
          </div>
          <div className="ds-card__body">
            {establishments.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 10,
                  background: "var(--warn-soft, #fef3c7)",
                  color: "var(--warn, #92400e)",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                <strong>Add a location first.</strong> A stand has to point at one of your
                establishments.{" "}
                <Link
                  href="/establishments/new"
                  style={{ color: "inherit", textDecoration: "underline" }}
                >
                  Create one
                </Link>{" "}
                and come back.
              </div>
            ) : (
              <form action={activateDevice} className="col" style={{ gap: 14 }}>
                <label className="col" style={{ gap: 4 }}>
                  <span className="lbl">Activation code</span>
                  <input
                    name="activationCode"
                    required
                    placeholder="XXXX - XXXX"
                    autoComplete="off"
                    inputMode="text"
                    maxLength={10}
                    style={{
                      width: "100%",
                      height: 48,
                      padding: "0 16px",
                      borderRadius: "var(--r)",
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      fontFamily: "var(--f-mono)",
                      fontSize: 18,
                      letterSpacing: ".18em",
                      textTransform: "uppercase",
                      outline: "none",
                    }}
                  />
                  <span className="dim" style={{ fontSize: 11.5 }}>
                    Letters and digits only. The dash is optional — we&apos;ll find it either way.
                  </span>
                </label>
                <label className="col" style={{ gap: 4 }}>
                  <span className="lbl">Establishment this stand belongs to</span>
                  <select
                    name="establishmentId"
                    required
                    defaultValue={establishments[0]?.id}
                    style={{
                      width: "100%",
                      height: 42,
                      padding: "0 14px",
                      borderRadius: "var(--r)",
                      border: "1px solid var(--line)",
                      background: "var(--surface)",
                      color: "var(--ink)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  >
                    {establishments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                  <Link href="/hardware" className="btn">
                    Cancel
                  </Link>
                  <button type="submit" className="btn btn--pri">
                    <Icon name="check" size={12} />
                    Activate stand
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        <aside className="ds-card">
          <div className="ds-card__head">
            <h3 className="ds-card__title">How activation works</h3>
          </div>
          <div className="ds-card__body col" style={{ gap: 14, fontSize: 13, lineHeight: 1.55 }}>
            <Step
              n={1}
              t="Find the code"
              d="Each stand ships with a small card. The 8-character code is printed below the QR."
            />
            <Step
              n={2}
              t="Pair the stand"
              d="Pick which location this stand belongs to. The QR will redirect to that location's Google review page."
            />
            <Step
              n={3}
              t="Test the redirect"
              d="After activation, scan the stand with your phone — it should bounce you to Google's review form."
            />
            <div
              style={{
                marginTop: 4,
                padding: 12,
                borderRadius: 10,
                background: "var(--pri-50, #ECFDF7)",
                color: "var(--pri, #2563EB)",
                fontSize: 12,
              }}
            >
              Codes are single-use. If you mistype one, the stand stays unactivated and you can try
              again — no need to re-order.
            </div>
          </div>
        </aside>
      </div>
    </AppShellServer>
  );
}

function Step({ n, t, d }: { n: number; t: string; d: string }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          background: "var(--pri-50, #ECFDF7)",
          color: "var(--pri, #2563EB)",
          display: "grid",
          placeItems: "center",
          fontWeight: 600,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {n}
      </span>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
        <div className="dim" style={{ fontSize: 12 }}>
          {d}
        </div>
      </div>
    </div>
  );
}
