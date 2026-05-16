import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteOutreachTemplate, upsertOutreachTemplate } from "@/lib/outreach/template-actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function OutreachTemplatesPage() {
  const { orgId } = await getOrgContext();

  const [templates, establishments] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.outreachTemplate.findMany({
        orderBy: [{ channel: "asc" }, { isDefault: "desc" }, { createdAt: "desc" }],
      }),
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      }),
    ]),
  );

  const emailTemplates = templates.filter((t) => t.channel === "email");
  const smsTemplates = templates.filter((t) => t.channel === "sms");

  return (
    <AppShellServer topBar={<TopBar title="Outreach Templates" />}>
      <PageHeader
        title="Outreach Templates"
        description="Save reusable email + SMS bodies."
        breadcrumb={[{"label":"Outreach","href":"/outreach"},{"label":"Templates"}]}
      />

        
      <div className="space-y-6">
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TemplateColumn
            channel="email"
            title="Email templates"
            templates={emailTemplates}
            establishments={establishments}
          />
          <TemplateColumn
            channel="sms"
            title="SMS templates"
            templates={smsTemplates}
            establishments={establishments}
          />
        </div>
      </div>
    </AppShellServer>
  );
}

type Template = {
  id: string;
  channel: string;
  name: string;
  subject: string | null;
  body: string;
  isDefault: boolean;
  establishmentId: string | null;
};

function TemplateColumn({
  channel,
  title,
  templates,
  establishments,
}: {
  channel: "email" | "sms";
  title: string;
  templates: Template[];
  establishments: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{templates.length} saved</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="rounded-md border bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">
                    {t.name}
                    {t.isDefault && (
                      <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <form action={deleteOutreachTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <Button type="submit" variant="ghost" size="sm">Delete</Button>
                  </form>
                </div>
                {t.subject && <div className="text-xs text-muted-foreground mt-1">Subject: {t.subject}</div>}
                <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{t.body}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New {channel} template</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={upsertOutreachTemplate} className="space-y-3">
            <input type="hidden" name="channel" value={channel} />
            <label className="block text-sm">
              <span className="font-medium">Name</span>
              <input
                name="name"
                required
                placeholder="Friendly first-time customer"
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              />
            </label>
            {channel === "email" && (
              <label className="block text-sm">
                <span className="font-medium">Subject</span>
                <input
                  name="subject"
                  placeholder="How was your experience at {{businessName}}?"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium">Body</span>
              <textarea
                name="body"
                required
                rows={6}
                placeholder={
                  channel === "email"
                    ? "Hi {{customerName}},\n\nThanks for choosing {{businessName}}! If you have a moment, we'd love your feedback on Google:\n\n{{reviewLink}}"
                    : "Hi {{customerName}}, thanks for visiting {{businessName}}! Share a quick review: {{reviewLink}}"
                }
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Establishment (optional)</span>
              <select
                name="establishmentId"
                className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
              >
                <option value="">All locations</option>
                {establishments.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isDefault" />
              <span>Make this the default {channel} template</span>
            </label>
            <Button type="submit">Save template</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
