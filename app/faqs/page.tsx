import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteFaq, upsertFaq } from "@/lib/faqs/actions";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function FaqsPage() {
  const { orgId } = await getOrgContext();

  const [faqs, establishments] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.faq.findMany({ orderBy: [{ position: "asc" }, { createdAt: "desc" }] }),
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
      }),
    ]),
  );

  return (
    <AppShellServer topBar={<TopBar title="FAQs" />}>
      <PageHeader
        title="FAQs"
        description="Used by the chatbot when no document matches."
        breadcrumb={[{"label":"AI"},{"label":"FAQs"}]}
      />

        
      <div className="space-y-6">
<Card>
          <CardHeader>
            <CardTitle className="text-lg">Add FAQ</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={upsertFaq} className="space-y-3">
              <label className="block text-sm">
                <span className="font-medium">Question / Title</span>
                <input
                  name="title"
                  required
                  maxLength={200}
                  placeholder="What are your business hours?"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Answer</span>
                <textarea
                  name="description"
                  required
                  rows={4}
                  maxLength={2000}
                  placeholder="We're open Mon-Fri 9am-9pm, Sat 10am-10pm. Closed Sundays and major holidays."
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Establishment</span>
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
                <label className="block text-sm">
                  <span className="font-medium">Display order</span>
                  <input
                    type="number"
                    name="position"
                    min={0}
                    defaultValue={0}
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <Button type="submit">Add FAQ</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{faqs.length} FAQ{faqs.length === 1 ? "" : "s"}</CardTitle>
            <CardDescription>Active FAQs are surfaced to the chatbot when relevant.</CardDescription>
          </CardHeader>
          <CardContent>
            {faqs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No FAQs yet. Add your most common questions above.</p>
            ) : (
              <div className="space-y-3">
                {faqs.map((f) => (
                  <div key={f.id} className="rounded-md border bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-sm">{f.title}</h3>
                      <div className="flex items-center gap-2">
                        {!f.isActive && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            INACTIVE
                          </span>
                        )}
                        <form action={deleteFaq}>
                          <input type="hidden" name="id" value={f.id} />
                          <Button type="submit" variant="ghost" size="sm">Delete</Button>
                        </form>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{f.description}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
