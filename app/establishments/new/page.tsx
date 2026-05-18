import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { createEstablishment } from "@/lib/establishments/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export default async function NewEstablishmentPage() {
  await getOrgContext();

  return (
    <AppShellServer topBar={<TopBar title="Add Listing" />}>
      <PageHeader
        title="Add listing"
        breadcrumb={[
          { label: "Listings", href: "/establishments" },
          { label: "New" },
        ]}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Add listing</CardTitle>
            <CardDescription>
              A listing you want to manage reviews for. You'll connect Google Business Profile in
              the next step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createEstablishment} className="space-y-5">
              <Field label="Name" name="name" required placeholder="Acme Coffee Downtown" />
              <Field label="Category" name="category" placeholder="cafe / dental / salon / ..." />
              <Field label="Timezone" name="timezone" defaultValue="UTC" placeholder="America/New_York" />

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-muted-foreground">Address</legend>
                <Field label="Street" name="address_line1" placeholder="123 Main St" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="City" name="address_city" />
                  <Field label="Region / State" name="address_region" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Postal code" name="address_postal" />
                  <Field label="Country" name="address_country" placeholder="US or United States" />
                </div>
              </fieldset>

              <div className="flex gap-2 pt-2">
                <Button type="submit">Create</Button>
                <Button type="button" asChild variant="outline">
                  <Link href="/establishments">Cancel</Link>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
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
    <label className="block space-y-1">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      <input
        type="text"
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
