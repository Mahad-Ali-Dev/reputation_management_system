import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { TopBar } from "@/components/topbar";
import { Icon } from "@/components/shell/icon";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { isOrgEntitled } from "@/lib/billing/entitlements";
import { softQuery } from "@/lib/contacts/fail-soft";
import { getContactWithFields } from "@/lib/contacts/queries";
import { getContactTimeline, type TimelineEvent } from "@/lib/contacts/timeline";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileHeader } from "./_components/profile-header";
import { ActivityTimeline } from "./_components/activity-timeline";
import { ContactDetailsForm } from "./_components/contact-details-form";
import { TagsEditor } from "./_components/tags-editor";
import { NotesEditor } from "./_components/notes-editor";
import { CustomFieldsEditor } from "./_components/custom-fields-editor";
import { ProfileQuickActions } from "./_components/quick-actions";

/**
 * Contact Profile (server, two-column). Loads the contact (404 when missing /
 * not in org), its custom fields, and the first page of the aggregated activity
 * timeline. Left column = header + timeline; right column = editable details /
 * tags / notes / custom fields. All editors + the timeline pager are client
 * islands; this file does DB reads only (RSC-safe).
 */

export const dynamic = "force-dynamic";

export default async function ContactProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await getOrgContext();
  const { id } = await params;

  const contact = await getContactWithFields({ orgId, id });
  if (!contact) notFound();

  const [firstPage, establishments, entitled] = await Promise.all([
    loadInitialTimeline(orgId, contact),
    loadEstablishments(orgId),
    isOrgEntitled(orgId),
  ]);

  const displayName =
    contact.name?.trim() ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.email ||
    contact.phone ||
    "Unnamed contact";

  return (
    <AppShellServer topBar={<TopBar title={displayName} />} crumbs={["CRM", "Contacts", displayName]}>
      <PageHeader
        title={displayName}
        breadcrumb={[{ label: "Contacts", href: "/contacts" }, { label: displayName }]}
        actions={
          <Link href="/contacts" className="btn btn--sm">
            <Icon name="chevL" size={13} />
            All contacts
          </Link>
        }
      />

      <ProfileQuickActions
        contactId={contact.id}
        hasEmail={!!contact.email}
        establishments={establishments}
        entitled={entitled}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)",
          gap: 18,
          alignItems: "start",
        }}
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <ProfileHeader contact={contact} />
          <ActivityTimeline
            contactId={contact.id}
            initialEvents={serializeEvents(firstPage.events)}
            initialCursor={firstPage.nextCursor}
          />
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ContactDetailsForm
            contactId={contact.id}
            initial={{
              name: contact.name,
              firstName: contact.firstName,
              lastName: contact.lastName,
              companyName: contact.companyName,
              email: contact.email,
              phone: contact.phone,
              consentStatus: contact.consentStatus,
              vip: contact.vip,
              source: contact.source,
            }}
          />
          <TagsEditor contactId={contact.id} initialTags={contact.tags} />
          <NotesEditor contactId={contact.id} initialNotes={contact.notes} />
          <CustomFieldsEditor contactId={contact.id} initialFields={contact.customFields} />
        </div>
      </div>
    </AppShellServer>
  );
}

/** TimelineEvent.occurredAt is a Date; serialize to ISO for the client island. */
type SerializedEvent = Omit<TimelineEvent, "occurredAt"> & { occurredAt: string };
function serializeEvents(events: TimelineEvent[]): SerializedEvent[] {
  return events.map((e) => ({ ...e, occurredAt: new Date(e.occurredAt).toISOString() }));
}

async function loadInitialTimeline(
  orgId: string,
  contact: { id: string; name: string | null; email: string | null; phone: string | null },
) {
  try {
    return await getContactTimeline({
      orgId,
      contact: { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone },
    });
  } catch {
    return { events: [] as TimelineEvent[], nextCursor: null as string | null };
  }
}

async function loadEstablishments(orgId: string): Promise<{ id: string; name: string }[]> {
  return softQuery(
    () =>
      withTenant(orgId, async (tx) =>
        tx.establishment.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { createdAt: "asc" },
          take: 100,
        }),
      ),
    [] as { id: string; name: string }[],
    { event: "contacts.profile.establishments.failed", swallowAll: true, context: { orgId } },
  );
}
