import Link from "next/link";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import {
  createWidgetKey,
  deleteAiDocument,
  ingestAiDocumentFromUrl,
  revokeWidgetKey,
  uploadAiDocument,
} from "@/lib/ai/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const { orgId } = await getOrgContext();

  const [establishments, documents, widgets] = await withTenant(orgId, async (tx) =>
    Promise.all([
      tx.establishment.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
      tx.aiDocument.findMany({
        orderBy: { createdAt: "desc" },
      }),
      tx.widgetKey.findMany({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
      }),
    ]),
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <AppShellServer topBar={<TopBar title="AI Chatbot" />}>
      <PageHeader
        title="AI Chatbot"
        description="Upload FAQ, get a JS snippet, embed it on your website."
        breadcrumb={[{"label":"AI"},{"label":"Chatbot"}]}
      />

        
      <div className="space-y-6">
{/* Knowledge base */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Knowledge base</CardTitle>
            <CardDescription>
              Paste your FAQ or service info. The AI answers using only what's here — never makes things up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={uploadAiDocument} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Title</span>
                  <input
                    name="title"
                    placeholder="Business FAQ"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
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
              </div>
              <label className="block text-sm">
                <span className="font-medium">Content (markdown supported)</span>
                <textarea
                  name="content"
                  rows={10}
                  placeholder={`## Hours\nMon-Fri 9am-9pm, Sat 10am-10pm, closed Sundays.\n\n## Location\n123 Main St, Springfield...\n\n## Pricing\nHaircuts from $35...`}
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 font-mono text-xs"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  Use ## headings to organize sections — the AI uses them as context. Re-uploading the same title replaces the previous version.
                </span>
              </label>
              <div className="rounded-md border border-dashed border-input p-3">
                <label className="block text-sm">
                  <span className="font-medium">Or upload a document (.pdf, .txt, .md)</span>
                  <input
                    type="file"
                    name="file"
                    accept=".pdf,text/plain,.md,application/pdf"
                    className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    PDFs are text-extracted server-side (max 8 MB). Scanned/image-only PDFs won&apos;t
                    extract — paste the text instead. A file takes priority over pasted content.
                  </span>
                </label>
              </div>
              <Button type="submit">Upload Document</Button>
            </form>

            <hr className="my-4" />
            <h3 className="text-sm font-semibold">Or import from URL</h3>
            <form action={ingestAiDocumentFromUrl} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Title</span>
                  <input
                    name="title"
                    required
                    placeholder="Pricing page"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
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
              </div>
              <label className="block text-sm">
                <span className="font-medium">URL</span>
                <input
                  type="url"
                  name="url"
                  required
                  placeholder="https://yourwebsite.com/faq"
                  className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  HTTPS only. Max 2 MB. We honor robots.txt and block private/internal IPs.
                </span>
              </label>
              <Button type="submit" variant="outline">Crawl & index</Button>
            </form>

            <hr className="my-4" />
            <h3 className="text-sm font-semibold">Indexed documents ({documents.length})</h3>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            ) : (
              <div className="space-y-2">
                {documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-md border bg-white p-3 text-sm">
                    <div>
                      <div className="font-medium">
                        {d.title}
                        <span className="ml-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                          {d.sourceType}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {d.content.length.toLocaleString()} chars · {d.status} ·{" "}
                        {d.lastIndexedAt ? new Date(d.lastIndexedAt).toLocaleString() : "—"}
                        {d.sourceUri && (
                          <>
                            {" · "}
                            <a href={d.sourceUri} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                              source ↗
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    <form
                      action={async () => {
                        "use server";
                        await deleteAiDocument(d.id);
                      }}
                    >
                      <Button type="submit" variant="ghost" size="sm">
                        Delete
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Widget keys */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Embed snippet</CardTitle>
            <CardDescription>
              Generate a widget key, then paste the snippet on any page where you want the chatbot.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={createWidgetKey} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
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
                <label className="block text-sm">
                  <span className="font-medium">Origin allowlist (optional)</span>
                  <input
                    name="originAllowlist"
                    placeholder="https://example.com, https://shop.example.com"
                    className="mt-1 w-full rounded-md border border-input px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Comma-separated. Leave empty to allow any origin (testing only).
                  </span>
                </label>
              </div>
              <Button type="submit">Generate key</Button>
            </form>

            <hr className="my-4" />
            <h3 className="text-sm font-semibold">Active keys ({widgets.length})</h3>
            {widgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active keys.</p>
            ) : (
              <div className="space-y-3">
                {widgets.map((w) => (
                  <div key={w.id} className="rounded-md border bg-white p-3 text-sm space-y-2">
                    <div className="flex items-center justify-between">
                      <code className="text-xs">{w.publicKey}</code>
                      <form
                        action={async () => {
                          "use server";
                          await revokeWidgetKey(w.id);
                        }}
                      >
                        <Button type="submit" variant="ghost" size="sm">
                          Revoke
                        </Button>
                      </form>
                    </div>
                    {w.originAllowlist.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Origins: {w.originAllowlist.join(", ")}
                      </div>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-primary">Show embed snippet</summary>
                      <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-3 text-slate-100">{`<script src="${appUrl}/widget?key=${w.publicKey}" async></script>`}</pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Test it */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Test the chatbot</CardTitle>
            <CardDescription>
              Test page renders the widget on a blank page so you can interact with it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {widgets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Generate a key above first.</p>
            ) : (
              <Button asChild variant="outline">
                <Link href={`/ai/test?key=${widgets[0]?.publicKey ?? ""}`} target="_blank" rel="noopener">
                  Open test page →
                </Link>
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Prefer an in-app tester?{" "}
              <Link href="/ai/training#test" className="text-primary hover:underline">
                Open the Test AI tab →
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShellServer>
  );
}
