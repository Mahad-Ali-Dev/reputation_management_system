import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { createEstablishment } from "@/lib/establishments/actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Add New Business · Repulabs",
};

export default async function NewEstablishmentPage() {
  await getOrgContext();

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Workspace", "Establishments"]}>
      <PageHeader
        kicker="New business"
        title="Add New Business"
        description="A business you want to manage reviews for. You'll connect Google Business Profile in the next step."
        actions={
          <Link href="/establishments" className="btn">
            <Icon name="chevL" size={12} />
            Back to establishments
          </Link>
        }
      />

      <section className="ds-card" style={{ maxWidth: 640 }}>
        <div className="ds-card__head">
          <div>
            <h3 className="ds-card__title">Business details</h3>
            <p className="ds-card__sub">Tell us about the place you manage.</p>
          </div>
        </div>
        <div className="ds-card__body">
          <form action={createEstablishment} className="col" style={{ gap: 16 }}>
            <Field label="Name" name="name" required placeholder="Acme Coffee Downtown" />
            <Field label="Category" name="category" placeholder="cafe / dental / salon / …" />
            <Field
              label="Timezone"
              name="timezone"
              defaultValue="UTC"
              placeholder="America/New_York"
            />

            <fieldset className="col" style={{ gap: 12, border: 0, padding: 0, margin: 0 }}>
              <legend className="lbl-mono" style={{ marginBottom: 2 }}>
                Address
              </legend>
              <Field label="Street" name="address_line1" placeholder="123 Main St" />
              <div className="grid-2">
                <Field label="City" name="address_city" />
                <Field label="Region / State" name="address_region" />
              </div>
              <div className="grid-2">
                <Field label="Postal code" name="address_postal" />
                <Field
                  label="Country"
                  name="address_country"
                  placeholder="US or United States"
                />
              </div>
            </fieldset>

            <div className="row" style={{ gap: 10, paddingTop: 4 }}>
              <button type="submit" className="btn btn--pri">
                <Icon name="plus" size={12} />
                Create
              </button>
              <Link href="/establishments" className="btn">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </section>
    </AppShellServer>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="lbl">
        {label}
        {required && <span style={{ color: "var(--bad)" }}> *</span>}
      </span>
      <input
        type="text"
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="ds-input"
      />
    </label>
  );
}
