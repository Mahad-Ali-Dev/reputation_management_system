import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { GlassSelect } from "@/components/ui/glass-select";
import { createWidgetKey, deleteAiDocument, revokeWidgetKey } from "@/lib/ai/actions";
import { learningStats, listKnowledgeGaps } from "@/lib/ai/knowledge-gaps";
import { getOrgContext } from "@/lib/auth/org-context";
import { isMissingRelation } from "@/lib/contacts/fail-soft";
import { withTenant } from "@/lib/db/with-tenant";
import {
  Bot,
  Database,
  FileText,
  Globe,
  KeyRound,
  LayoutGrid,
  type LucideIcon,
  MessageSquareText,
  PlayCircle,
  Plug,
  Plus,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { type BehaviourFields, BehaviourSettings } from "./_components/behaviour-settings";
import { KbSourceActions } from "./_components/kb-source-actions";
import {
  type BusinessDetailRow,
  KbEmpty,
  KnowledgeBody,
  KnowledgeSummary,
  type LocationData,
  type RecentLearningRow,
} from "./_components/knowledge-dashboard";
import { TestConsole } from "./_components/test-console";
import { readiness, relativeTime } from "./training/_components/shared-utils";
import "./aikb.css";
import "./ai-kb.css";
import "./ai-brain-glass.css";
import "./ai-kb-apple.css";

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

const SOURCE_LABELS: Record<string, string> = {
  url: "Website",
  manual: "Note",
  gbp_listing: "Google profile",
  pdf: "PDF",
  docx: "Word document",
  txt: "Text file",
  file: "Document",
};

function statusChip(status: string): { tone: "ok" | "info" | "bad" | "dim"; label: string } {
  if (status === "indexed") return { tone: "ok", label: "Indexed" };
  if (status === "indexing") return { tone: "info", label: "Indexing" };
  if (status === "failed") return { tone: "bad", label: "Failed" };
  return { tone: "dim", label: status };
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

  // Knowledge gaps: open feeds Test "questions to teach"; answered feeds both
  // the Knowledge "recent learning" timeline AND the Test tab's "Taught
  // answers" list (so adding/teaching a question shows up right where you
  // added it, not just on a different tab). Already fail-soft → [] / zeros.
  const [openGaps, answeredGaps, stats] = await Promise.all([
    listKnowledgeGaps(orgId, { status: "open", limit: 6 }),
    listKnowledgeGaps(orgId, { status: "answered", limit: 8 }),
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

  const TABS: { key: TabKey; href: string; label: string; icon: LucideIcon; badge?: number }[] = [
    { key: "knowledge", href: "/ai?tab=knowledge", label: "Knowledge", icon: LayoutGrid },
    { key: "sources", href: "/ai?tab=sources", label: "Sources", icon: Database },
    { key: "widget", href: "/ai?tab=widget", label: "Chat widget", icon: Plug },
    { key: "behaviour", href: "/ai?tab=behaviour", label: "Behaviour", icon: Sparkles },
    {
      key: "test",
      href: "/ai?tab=test",
      label: "Test",
      icon: Bot,
      badge: stats.open || openGaps.length || undefined,
    },
  ];

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["AI Tools", "AI Brain"]}>
      <div className="akb kb">
        {/* ---------- hero (Knowledge tab): Apple product headline + the frog ---------- */}
        {tab === "knowledge" && (
          <header className="kb-hero">
            <div className="kb-hero__text">
              <span className="kb-eyebrow">AI Brain</span>
              <h1 className="kb-hero__title">
                Your AI, trained on <em>your business.</em>
              </h1>
              <p className="kb-hero__sub">
                Teach it your services, voice and policies. It answers reviews, DMs and surveys the
                way you would, and learns from every question it can&apos;t answer yet.
              </p>
              <Link href="/docs/ai-training" className="kb-pill kb-pill--ghost">
                <PlayCircle size={16} strokeWidth={1.8} />
                How it works
              </Link>
            </div>
          </header>
        )}

        {tab === "knowledge" && (
          <KnowledgeSummary
            readinessPct={readinessPct}
            totalSources={totalSources}
            activeSources={activeSources}
            lastUpdated={lastUpdated}
          />
        )}

        {/* ---------- tabs: iOS segmented control + one action ---------- */}
        <nav className="kb-tabbar" aria-label="AI Brain sections">
          <div className="kb-seg" role="tablist">
            {TABS.map((t) => {
              const isActive = t.key === tab;
              const TIcon = t.icon;
              return (
                <Link
                  key={t.key}
                  href={t.href}
                  role="tab"
                  aria-selected={isActive}
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? "kb-seg__t is-active" : "kb-seg__t"}
                >
                  <TIcon size={15} strokeWidth={1.8} />
                  <span>{t.label}</span>
                  {t.badge ? (
                    <span className="kb-seg__badge" aria-label={`${t.badge} to review`}>
                      {t.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          {tab === "knowledge" ? (
            <button type="button" data-kb-action="upload" className="kb-pill kb-pill--pri">
              <Plus size={16} strokeWidth={2} />
              Add source
            </button>
          ) : tab !== "test" ? (
            <Link href="/ai?tab=test" className="kb-pill kb-pill--pri">
              <Sparkles size={15} strokeWidth={1.8} />
              {tab === "behaviour" ? "Preview in Test" : "Test your AI"}
            </Link>
          ) : null}
        </nav>

        {actionFailed && (
          <p className="kb-alert" role="alert">
            <TriangleAlert size={16} strokeWidth={1.8} />
            That action couldn&apos;t be completed. You may need manager access, or the item was
            already removed. Refresh and try again.
          </p>
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
            {/* Upload opens the OS file picker; Connect website opens the
                2-field sheet and runs the crawl as a background job. */}
            <KbSourceActions />
          </>
        )}

        {/* ---------- Sources tab ---------- */}
        {tab === "sources" && (
          <section className="kb-card" aria-labelledby="kb-docs-title">
            <header className="kb-card__head">
              <div>
                <h2 id="kb-docs-title" className="kb-card__title">
                  Sources <span className="kb-count">{documents.length}</span>
                </h2>
                <p className="kb-card__sub">Everything your AI has read and learned from.</p>
              </div>
              <Link href="/ai?tab=knowledge" className="kb-pill">
                <Plus size={15} strokeWidth={2} />
                Add source
              </Link>
            </header>
            {documents.length === 0 ? (
              <KbEmpty
                icon={FileText}
                title="No sources yet"
                text="Connect your website or upload a document to give your AI something to learn from."
                href="/ai?tab=knowledge"
                cta="Add a source"
              />
            ) : (
              <ul className="kb-list kb-list--inset">
                {documents.map((d) => {
                  const st = statusChip(d.status);
                  const DIcon = d.sourceType === "url" ? Globe : FileText;
                  return (
                    <li key={d.id}>
                      <div className="kb-list__row kb-doc">
                        <span className="kb-list__icon" aria-hidden="true">
                          <DIcon size={16} strokeWidth={1.8} />
                        </span>
                        <span className="kb-list__text">
                          <span className="kb-list__t">
                            {d.title}
                            <span className={`kb-status kb-status--${st.tone}`}>{st.label}</span>
                          </span>
                          <span className="kb-list__d">
                            {SOURCE_LABELS[d.sourceType] ?? d.sourceType.replace(/_/g, " ")} ·{" "}
                            {d.content.length.toLocaleString()} characters ·{" "}
                            {d.lastIndexedAt
                              ? `updated ${relativeTime(d.lastIndexedAt)}`
                              : "not indexed yet"}
                            {d.sourceUri && (
                              <>
                                {" · "}
                                <a href={d.sourceUri} target="_blank" rel="noopener noreferrer">
                                  Open
                                </a>
                              </>
                            )}
                          </span>
                        </span>
                        <form
                          action={async () => {
                            "use server";
                            try {
                              await deleteAiDocument(d.id);
                            } catch (err) {
                              if (isNextControlFlow(err)) throw err;
                              redirect("/ai?tab=sources&saved=error");
                            }
                          }}
                        >
                          <button type="submit" className="kb-pill kb-pill--danger kb-pill--sm">
                            Delete
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* ---------- Chat widget tab ---------- */}
        {tab === "widget" && (
          <div className="kb-stack">
            <section className="kb-card" aria-labelledby="kb-wkey-title">
              <header className="kb-card__head">
                <div>
                  <h2 id="kb-wkey-title" className="kb-card__title">
                    Add the chat widget to your site
                  </h2>
                  <p className="kb-card__sub">
                    Create a key, then paste one line of code on any page where you want the
                    chatbot.
                  </p>
                </div>
              </header>
              <form
                action={async (form: FormData) => {
                  "use server";
                  try {
                    await createWidgetKey(form);
                  } catch (err) {
                    if (isNextControlFlow(err)) throw err;
                    redirect("/ai?tab=widget&saved=error");
                  }
                }}
                className="kb-form"
              >
                <div className="kb-field">
                  <span className="kb-field__lbl">
                    Location <span className="kb-opt">Optional</span>
                  </span>
                  <GlassSelect
                    name="establishmentId"
                    defaultValue=""
                    options={[
                      { value: "", label: "All locations" },
                      ...establishments.map((e) => ({ value: e.id, label: e.name })),
                    ]}
                    ariaLabel="Location"
                  />
                </div>
                <label className="kb-field">
                  <span className="kb-field__lbl">
                    Allowed websites <span className="kb-opt">Optional</span>
                  </span>
                  <input
                    name="originAllowlist"
                    placeholder="https://example.com, https://shop.example.com"
                    className="kb-input"
                  />
                  <span className="kb-hint">
                    Comma-separated. Leave empty to allow any site (for testing only).
                  </span>
                </label>
                <div className="kb-form__actions">
                  <button type="submit" className="kb-pill kb-pill--pri">
                    <KeyRound size={15} strokeWidth={1.8} />
                    Create key
                  </button>
                </div>
              </form>
            </section>

            <section className="kb-card" aria-labelledby="kb-wlist-title">
              <header className="kb-card__head">
                <div>
                  <h2 id="kb-wlist-title" className="kb-card__title">
                    Your keys <span className="kb-count">{widgets.length}</span>
                  </h2>
                  <p className="kb-card__sub">Copy the snippet into your website&apos;s HTML.</p>
                </div>
                {widgets.length > 0 && (
                  <Link
                    href={`/ai/test?key=${widgets[0]?.publicKey ?? ""}`}
                    target="_blank"
                    rel="noopener"
                    className="kb-pill"
                  >
                    <MessageSquareText size={15} strokeWidth={1.8} />
                    Try the chatbot
                  </Link>
                )}
              </header>
              {widgets.length === 0 ? (
                <KbEmpty
                  icon={KeyRound}
                  title="No keys yet"
                  text="Create a key above and your snippet appears here, ready to copy."
                />
              ) : (
                <ul className="kb-keys">
                  {widgets.map((w) => (
                    <li key={w.id} className="kb-key">
                      <div className="kb-key__top">
                        <code className="kb-key__id">{w.publicKey}</code>
                        <span className="kb-key__origins">
                          {w.originAllowlist.length > 0
                            ? w.originAllowlist.join(", ")
                            : "Any website"}
                        </span>
                        <form
                          action={async () => {
                            "use server";
                            try {
                              await revokeWidgetKey(w.id);
                            } catch (err) {
                              if (isNextControlFlow(err)) throw err;
                              redirect("/ai?tab=widget&saved=error");
                            }
                          }}
                        >
                          <button type="submit" className="kb-pill kb-pill--danger kb-pill--sm">
                            Revoke
                          </button>
                        </form>
                      </div>
                      <pre className="kb-snippet">{`<script src="${appUrl}/widget?key=${w.publicKey}" async></script>`}</pre>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* ---------- Behaviour tab ---------- */}
        {tab === "behaviour" && <BehaviourSettings initial={behaviourInitial} />}

        {/* ---------- Test tab ---------- */}
        {/* Teach/Add-question open an in-page dialog (test-console.tsx); the old
            "/ai/training#test" link redirected back to plain "/ai". */}
        {tab === "test" && (
          <TestConsole suggestions={suggestions} openGaps={openGaps} answeredGaps={answeredGaps} />
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
