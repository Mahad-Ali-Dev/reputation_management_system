import { AppShellServer } from "@/components/app-shell-server";
import { Icon, type IconName } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { Button } from "@/components/ui/button";
import { createWidgetKey, deleteAiDocument, revokeWidgetKey } from "@/lib/ai/actions";
import { learningStats, listKnowledgeGaps } from "@/lib/ai/knowledge-gaps";
import { getOrgContext } from "@/lib/auth/org-context";
import { isMissingRelation } from "@/lib/contacts/fail-soft";
import { withTenant } from "@/lib/db/with-tenant";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type BehaviourFields, BehaviourSettings } from "./_components/behaviour-settings";
import { KbSourceActions } from "./_components/kb-source-actions";
import {
  type BusinessDetailRow,
  KnowledgeBody,
  KnowledgeSummary,
  type LocationData,
  type RecentLearningRow,
} from "./_components/knowledge-dashboard";
import { TestConsole } from "./_components/test-console";
import { readiness, relativeTime } from "./training/_components/shared-utils";
import "./aikb.css";
import "./ai-kb.css";

export const dynamic = "force-dynamic";

/**
 * AI Knowledge Base (/ai) — rebuilt to the delivered "AI Knowledge Base" kit.
 *
 * Three kit tabs switched via the ?tab= searchParam (server-rendered <Link>s, no
 * client JS for tab switching — keeps the route an RSC):
 *   - Knowledge → the kit dashboard (readiness ribbon + stats + sources + quick
 *     actions + business overview/location + recent learning). The source CARDS
 *     are now real controls via <KbSourceActions>: "Upload documents" opens the
 *     OS file picker, "Connect website" opens a 2-field modal and runs the crawl
 *     as a background `kb_crawl` job with live per-stage progress. The old stack
 *     of inline forms in a disclosure is gone.
 *   - Sources → the indexed-document list + delete.
 *   - Chat widget → widget key create/revoke, embed snippet, test-page link.
 *   - Behaviour → the kit "AI Behaviour Settings" surface, bound to the real
 *     AiTrainingProfile voice/behaviour columns via saveAiTraining.
 *   - Test → the kit "Train your AI agent" console, reusing the existing
 *     /api/ai/kb-test endpoint + the real knowledge-gap queue.
 *
 * Bare-form crash guards (bug 009 / assessment): the doc-delete + widget
 * create/revoke <form action>s still catch thrown errors and redirect to
 * ?saved=error instead of 500-ing the page.
 */

/** redirect()/notFound() throw — those must propagate out of our catch. */
function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

type TabKey = "knowledge" | "sources" | "widget" | "behaviour" | "test";

/** Weighted readiness: 60% training profile + indexed docs (≤25) + live widget (15). */
function computeReadiness(profileScore: number, indexedDocs: number, hasWidget: boolean): number {
  const docs = Math.min(25, indexedDocs * 13);
  return Math.min(100, Math.round(profileScore * 0.6) + docs + (hasWidget ? 15 : 0));
}

function statusChip(status: string): { cls: string; label: string } {
  if (status === "indexed") return { cls: "chip chip--ok", label: "Indexed" };
  if (status === "indexing") return { cls: "chip chip--info", label: "Indexing" };
  if (status === "failed") return { cls: "chip chip--bad", label: "Failed" };
  return { cls: "chip chip--out", label: status };
}

function EstablishmentSelect({
  establishments,
}: { establishments: { id: string; name: string }[] }) {
  return (
    <select name="establishmentId" className="aikb-select">
      <option value="">All locations</option>
      {establishments.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name}
        </option>
      ))}
    </select>
  );
}

/** Build a one-line address string from the establishment's JSON address. */
function formatAddress(addr: unknown, fallbackName: string): string | null {
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, unknown>;
  const parts = [
    a.line1,
    a.line2,
    a.street,
    a.city,
    a.state,
    a.region,
    a.country,
    a.postalCode,
    a.zip,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    const single = typeof a.formatted === "string" ? a.formatted : null;
    return single ?? fallbackName ?? null;
  }
  // de-dup consecutive equal parts
  return parts.filter((p, i) => i === 0 || p !== parts[i - 1]).join(", ");
}

export default async function AiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const tab: TabKey =
    sp.tab === "behaviour" || sp.tab === "test" || sp.tab === "sources" || sp.tab === "widget"
      ? sp.tab
      : "knowledge";
  const actionFailed = sp.saved === "error";

  const loadAi = () =>
    withTenant(orgId, async (tx) =>
      Promise.all([
        tx.establishment.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, address: true, businessHours: true },
          orderBy: { createdAt: "asc" },
        }),
        tx.aiDocument.findMany({ orderBy: { createdAt: "desc" } }),
        tx.widgetKey.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" } }),
      ]),
    );
  type AiData = Awaited<ReturnType<typeof loadAi>>;
  // Fail-soft: render empty rather than 500 on a transient DB error.
  let establishments: AiData[0] = [];
  let documents: AiData[1] = [];
  let widgets: AiData[2] = [];
  try {
    [establishments, documents, widgets] = await loadAi();
  } catch {
    /* render empty */
  }

  // Training profile feeds readiness + business overview + behaviour. Fail-soft
  // on the un-migrated table (same guardrail as /ai).
  const profile = await withTenant(orgId, async (tx) =>
    tx.aiTrainingProfile.findUnique({ where: { organizationId: orgId } }),
  ).catch((err: unknown) => {
    if (isMissingRelation(err)) return null;
    throw err;
  });

  // Knowledge gaps: open feeds Test "questions to teach"; answered feeds the
  // Knowledge "recent learning" timeline. Already fail-soft → [] / zeros.
  const [openGaps, answeredGaps, stats] = await Promise.all([
    listKnowledgeGaps(orgId, { status: "open", limit: 6 }),
    listKnowledgeGaps(orgId, { status: "answered", limit: 3 }),
    learningStats(orgId),
  ]);

  // ---------- live KPI derivations ----------
  const indexedDocs = documents.filter((d) => d.status === "indexed").length;
  const readinessPct = computeReadiness(readiness(profile), indexedDocs, widgets.length > 0);
  const totalSources = documents.length;
  const activeSources = indexedDocs;
  const lastUpdated =
    documents
      .map((d) => d.lastIndexedAt ?? d.createdAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const websiteActive = documents.some((d) => d.sourceType === "url" && d.status === "indexed");

  // Business overview rows (real profile fields; empty body → empty state).
  const businessDetails: BusinessDetailRow[] = [
    {
      id: "overview",
      icon: "box",
      title: "What does your business do?",
      body: profile?.businessOverview ?? null,
    },
    {
      id: "services",
      icon: "card",
      title: "Services / Products",
      body: profile?.servicesProducts ?? null,
    },
    {
      id: "pricing",
      icon: "pie",
      title: "Pricing policies",
      body: profile?.pricingDetails ?? null,
    },
  ];

  // Business location: prefer the AiTrainingProfile.locations free-text + hours;
  // fall back to the first establishment's structured address + businessHours.
  const firstEstab = establishments[0];
  const profileHours = (profile?.operatingHours as LocationData["hours"] | null) ?? {};
  const estabHours = (firstEstab?.businessHours as LocationData["hours"] | null) ?? {};
  const location: LocationData = {
    address:
      (profile?.locations && profile.locations.trim().length > 0
        ? profile.locations.trim()
        : null) ?? (firstEstab ? formatAddress(firstEstab.address, firstEstab.name) : null),
    hours: Object.keys(profileHours).length > 0 ? profileHours : estabHours,
  };

  // Recent learning = answered gaps (real learning events).
  const toneCycle = ["success", "warning", "info"] as const;
  const recentLearning: RecentLearningRow[] = answeredGaps.map((g, i) => ({
    id: g.id,
    title: g.question,
    when: g.answeredAt ? relativeTime(g.answeredAt) : relativeTime(g.createdAt),
    tone: toneCycle[i % toneCycle.length] ?? "success",
  }));

  const behaviourInitial: BehaviourFields = {
    aiPersonalityStyle: profile?.aiPersonalityStyle ?? "friendly",
    customerInquiryStyle: profile?.customerInquiryStyle ?? "warm_intro_quick_qualification",
    bookingStyle: profile?.bookingStyle ?? "propose_time_slots",
    complaintStyle: profile?.complaintStyle ?? "apologize_propose_fix",
    supportStyle: profile?.supportStyle ?? "check_in_after_purchase",
    customPrompt: profile?.customPrompt ?? "",
  };

  // Suggested test questions (owner's unsure topics first, else fallbacks).
  const suggestions = buildSuggestions(profile?.unsureTopics ?? []);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const TABS: { key: TabKey; href: string; label: string; icon: IconName; badge?: number }[] = [
    { key: "knowledge", href: "/ai?tab=knowledge", label: "Knowledge", icon: "box" },
    { key: "sources", href: "/ai?tab=sources", label: "Sources", icon: "box" },
    { key: "widget", href: "/ai?tab=widget", label: "Chat widget", icon: "plug" },
    { key: "behaviour", href: "/ai?tab=behaviour", label: "Behaviour", icon: "sparkle" },
    {
      key: "test",
      href: "/ai?tab=test",
      label: "Test",
      icon: "bot",
      badge: stats.open || openGaps.length || undefined,
    },
  ];

  return (
    <AppShellServer
      topBar={<TopBar title="AI Knowledge Base" />}
      crumbs={["AI Engine", "AI Knowledge Base"]}
    >
      <div className="akb">
        {/* ---------- hero banner (Knowledge tab only — the Behaviour/Test
             kit mockups start directly at the tabs header, no hero) ---------- */}
        {tab === "knowledge" && (
          <section
            className={`akb-hero ${readinessPct === 0 ? "akb-hero--empty" : ""}`}
            aria-label="AI Knowledge Base"
          >
            <div style={{ minWidth: 0 }}>
              <div className="akb-hero__eyebrow">AI Engine</div>
              <h1 className="akb-hero__title">AI Knowledge Base</h1>
              <p className="akb-hero__copy">
                Teach your AI about your business, voice and policies. It uses this to answer
                reviews, DMs, surveys and phone calls — and learns from every question it can&apos;t
                answer.
              </p>
            </div>
            <div className="akb-hero__art" aria-hidden="true">
              <img src="/assets/repulabs/ai-kb/hero-brain.svg" alt="" />
            </div>
            <Link href="/docs/ai-training" className="akb-btn-outline akb-hero__cta">
              <Icon name="play" size={15} />
              How it works
            </Link>
          </section>
        )}

        {/* ---------- readiness + stats (Knowledge tab only — sits above the
             tabs strip in the kit) ---------- */}
        {tab === "knowledge" && (
          <KnowledgeSummary
            readinessPct={readinessPct}
            totalSources={totalSources}
            activeSources={activeSources}
            lastUpdated={lastUpdated}
          />
        )}

        {/* ---------- tabs / action bar ---------- */}
        <nav className="akb-card akb-tabs" aria-label="AI Knowledge Base sections">
          <div className="akb-tabs__list" role="tablist">
            {TABS.map((t) => {
              const isActive = t.key === tab;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  role="tab"
                  aria-selected={isActive}
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? "akb-tab is-active" : "akb-tab"}
                >
                  <Icon name={t.icon} size={15} />
                  <span>{t.label}</span>
                  {t.badge ? (
                    <span className="akb-tab__badge" aria-label={`${t.badge} to review`}>
                      {t.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          {tab === "knowledge" ? (
            <a href="#add-source" className="akb-btn-primary" style={{ height: 33 }}>
              <Icon name="plus" size={14} />
              Add source
            </a>
          ) : (
            <Link href="/ai?tab=test" className="akb-btn-primary" style={{ height: 33 }}>
              <Icon name="sparkle" size={14} />
              {tab === "behaviour" ? "Test AI behaviour" : "Test AI knowledge"}
            </Link>
          )}
        </nav>

        {/* shared action-failed banner */}
        {actionFailed && (
          <div
            className="akb-card"
            role="alert"
            style={{
              padding: "10px 14px",
              borderColor: "#e14d62",
              background: "rgba(225,77,98,0.06)",
              fontSize: 13,
            }}
          >
            That action couldn&apos;t be completed. You may not have permission (manager role
            required), or the item was already removed — refresh and try again.
          </div>
        )}

        {/* ---------- Knowledge tab ---------- */}
        {tab === "knowledge" && (
          <>
            <KnowledgeBody
              hasSources={totalSources > 0}
              websiteActive={websiteActive}
              businessDetails={businessDetails}
              location={location}
              recentLearning={recentLearning}
            />

            {/* Card interactions: "Upload documents" opens the OS file picker,
                "Connect website" opens the 2-field modal and runs the crawl as a
                background job. Replaces the old stack of inline forms that used
                to live in a disclosure below the fold. */}
            <KbSourceActions />
          </>
        )}

        {/* ---------- Sources tab ---------- */}
        {tab === "sources" && (
          <section className="akb-card akb-card__pad">
            <h4 className="aikb-subhead">
              <Icon name="box" size={14} /> Indexed documents
              <span className="chip chip--pri">{documents.length}</span>
            </h4>
            {documents.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--rl-muted)" }}>
                No documents yet — paste your FAQ above or crawl your website to start.
              </p>
            ) : (
              <div>
                {documents.map((d) => {
                  const chip = statusChip(d.status);
                  return (
                    <div key={d.id} className="aikb-doc">
                      <div style={{ minWidth: 0 }}>
                        <div className="aikb-doc__title">
                          {d.title}
                          <span className="chip chip--out" style={{ textTransform: "uppercase" }}>
                            {d.sourceType}
                          </span>
                          <span className={chip.cls}>
                            <span className="dot" />
                            {chip.label}
                          </span>
                        </div>
                        <div className="aikb-doc__meta">
                          {d.content.length.toLocaleString()} chars ·{" "}
                          {d.lastIndexedAt ? new Date(d.lastIndexedAt).toLocaleString() : "—"}
                          {d.sourceUri && (
                            <>
                              {" · "}
                              <a
                                href={d.sourceUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                source ↗
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                      <form
                        action={async () => {
                          "use server";
                          try {
                            await deleteAiDocument(d.id);
                          } catch (err) {
                            if (isNextControlFlow(err)) throw err;
                            redirect("/ai?tab=knowledge&saved=error");
                          }
                        }}
                      >
                        <Button type="submit" variant="ghost" size="sm">
                          Delete
                        </Button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}

            <hr className="aikb-divider" />
          </section>
        )}

        {/* ---------- Chat widget tab ---------- */}
        {tab === "widget" && (
          <section className="akb-card akb-card__pad">
            <h4 className="aikb-subhead">
              <Icon name="plug" size={14} /> Embed snippet
            </h4>
            <p style={{ fontSize: 12.5, color: "var(--rl-muted)", margin: "0 0 12px" }}>
              Generate a widget key, then paste the snippet on any page where you want the chatbot.
            </p>
            <form
              action={async (form: FormData) => {
                "use server";
                try {
                  await createWidgetKey(form);
                } catch (err) {
                  if (isNextControlFlow(err)) throw err;
                  redirect("/ai?tab=knowledge&saved=error");
                }
              }}
              className="space-y-3"
            >
              <div className="aikb-formgrid">
                {/* biome-ignore lint/a11y/noLabelWithoutControl: the select is nested inside this label (implicit association) */}
                <label className="aikb-label">
                  Establishment (optional)
                  <EstablishmentSelect
                    establishments={establishments.map((e) => ({ id: e.id, name: e.name }))}
                  />
                </label>
                <label className="aikb-label">
                  Origin allowlist (optional)
                  <input
                    name="originAllowlist"
                    placeholder="https://example.com, https://shop.example.com"
                    className="aikb-input"
                  />
                  <span className="aikb-hint">
                    Comma-separated. Leave empty to allow any origin (testing only).
                  </span>
                </label>
              </div>
              <Button type="submit">Generate key</Button>
            </form>

            <hr className="aikb-divider" />

            <h4 className="aikb-subhead">
              <Icon name="lock" size={14} /> Active keys
              <span className="chip chip--pri">{widgets.length}</span>
            </h4>
            {widgets.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--rl-muted)" }}>No active keys.</p>
            ) : (
              <div>
                {widgets.map((w) => (
                  <div key={w.id} className="aikb-key">
                    <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
                      <code
                        style={{
                          fontSize: 11.5,
                          fontFamily: "var(--f-mono)",
                          wordBreak: "break-all",
                        }}
                      >
                        {w.publicKey}
                      </code>
                      <form
                        action={async () => {
                          "use server";
                          try {
                            await revokeWidgetKey(w.id);
                          } catch (err) {
                            if (isNextControlFlow(err)) throw err;
                            redirect("/ai?tab=knowledge&saved=error");
                          }
                        }}
                      >
                        <Button type="submit" variant="ghost" size="sm">
                          Revoke
                        </Button>
                      </form>
                    </div>
                    {w.originAllowlist.length > 0 && (
                      <div className="aikb-doc__meta">Origins: {w.originAllowlist.join(", ")}</div>
                    )}
                    <details style={{ fontSize: 12 }}>
                      <summary className="cursor-pointer text-primary">Show embed snippet</summary>
                      <pre className="aikb-snippet">{`<script src="${appUrl}/widget?key=${w.publicKey}" async></script>`}</pre>
                    </details>
                  </div>
                ))}
              </div>
            )}

            <hr className="aikb-divider" />

            <h4 className="aikb-subhead">
              <Icon name="bot" size={14} /> Test the chatbot
            </h4>
            {widgets.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--rl-muted)" }}>
                Generate a key above first — the test page renders the live widget.
              </p>
            ) : (
              <Button asChild variant="outline">
                <Link
                  href={`/ai/test?key=${widgets[0]?.publicKey ?? ""}`}
                  target="_blank"
                  rel="noopener"
                >
                  Open test page →
                </Link>
              </Button>
            )}
          </section>
        )}

        {/* ---------- Behaviour tab ---------- */}
        {tab === "behaviour" && <BehaviourSettings initial={behaviourInitial} />}

        {/* ---------- Test tab ---------- */}
        {/* teachHref: the Teach MODAL lives in learning-monitor-tab.tsx, rendered
            by /ai/training#test. It used to point at "/ai?tab=test" — the page
            the button is already on — so clicking Teach navigated to itself and
            appeared to do nothing. */}
        {tab === "test" && (
          <TestConsole
            suggestions={suggestions}
            openGaps={openGaps}
            teachHref="/ai/training#test"
          />
        )}
      </div>
    </AppShellServer>
  );
}

const FALLBACK_QUESTIONS = [
  "What are your business hours?",
  "Do you offer any discounts?",
  "What services do you provide?",
  "Where are you located?",
  "Do you have a refund policy?",
  "How can I contact support?",
  "Can I book an appointment?",
  "What payment methods do you accept?",
];

function buildSuggestions(unsureTopics: string[]): string[] {
  const out: string[] = [];
  for (const t of unsureTopics) {
    const q = t.trim();
    if (q) out.push(q.endsWith("?") ? q : `Tell me about ${q}`);
    if (out.length >= 3) break;
  }
  for (const q of FALLBACK_QUESTIONS) {
    if (out.length >= 8) break;
    if (!out.includes(q)) out.push(q);
  }
  return out.slice(0, 8);
}
