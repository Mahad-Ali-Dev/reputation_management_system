import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrgContext } from "@/lib/auth/org-context";
import { withTenant } from "@/lib/db/with-tenant";
import { isMissingRelation } from "@/lib/contacts/fail-soft";
import { createWidgetKey, deleteAiDocument, revokeWidgetKey } from "@/lib/ai/actions";
import { KbAddForms } from "./_components/kb-add-forms";
import { listKnowledgeGaps, learningStats } from "@/lib/ai/knowledge-gaps";
import { Button } from "@/components/ui/button";
import { AppShellServer } from "@/components/app-shell-server";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { EmptyIllustration } from "@/components/empty-state";
import { Icon, type IconName } from "@/components/shell/icon";
import { readiness, relativeTime } from "./training/_components/shared-utils";
import "./aikb.css";

export const dynamic = "force-dynamic";

/**
 * AI Chatbot knowledge base (/ai) — redesigned per design-mockups/ai-kb-after.png.
 *
 * Layout: brain-readiness gradient ribbon → training-tabs card (pill tabs via
 * ?tab= searchParam, server-rendered <Link>s — no client JS) + knowledge-gaps
 * rail. ALL existing functionality preserved: KB upload (paste/PDF), URL
 * crawler, indexed-document list + delete, widget-key generate/revoke, embed
 * snippet, test-page links. Every number is a live tenant query (fail-soft).
 */

/** redirect()/notFound() throw — those must propagate out of our catch. */
function isNextControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}

type TabKey = "info" | "voice" | "setup";

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: "info", label: "Business info", icon: "box" },
  { key: "voice", label: "Voice & style", icon: "sparkle" },
  { key: "setup", label: "Setup & embed", icon: "plug" },
];

/** Weighted readiness: 60% training profile + indexed docs (≤25) + live widget (15). */
function computeReadiness(profileScore: number, indexedDocs: number, hasWidget: boolean): number {
  const docs = Math.min(25, indexedDocs * 13);
  return Math.min(100, Math.round(profileScore * 0.6) + docs + (hasWidget ? 15 : 0));
}

function readinessCopy(score: number): { headline: string; sub: string } {
  if (score >= 75)
    return {
      headline: "AI can answer most customer questions safely.",
      sub: "Every reply is grounded in your verified facts — the AI never makes things up.",
    };
  if (score >= 40)
    return {
      headline: "Solid foundation — keep training to raise answer confidence.",
      sub: "Add pricing, hours and more documents so the AI can answer without escalating.",
    };
  return {
    headline: "Train AI on how the business actually works.",
    sub: "Business facts, voice, pricing, and test prompts keep every response on-brand.",
  };
}

const VOICE_LABELS: Record<string, Record<string, string>> = {
  aiPersonalityStyle: {
    friendly: "Friendly",
    professional: "Professional",
    playful: "Playful",
    concise: "Concise",
  },
  customerInquiryStyle: {
    warm_intro_quick_qualification: "Warm intro + quick qualification",
    direct_answer_only: "Direct answer only",
    upsell_relevant_services: "Upsell relevant services",
  },
  bookingStyle: { propose_time_slots: "Propose time slots" },
  complaintStyle: { apologize_propose_fix: "Apologize + propose a fix" },
  supportStyle: { check_in_after_purchase: "Check in after purchase" },
};

function voiceLabel(field: string, value: string | null): string {
  if (!value) return "Not set";
  return VOICE_LABELS[field]?.[value] ?? value.replace(/_/g, " ");
}

function statusChip(status: string): { cls: string; label: string } {
  if (status === "indexed") return { cls: "chip chip--ok", label: "Indexed" };
  if (status === "indexing") return { cls: "chip chip--info", label: "Indexing" };
  if (status === "failed") return { cls: "chip chip--bad", label: "Failed" };
  return { cls: "chip chip--out", label: status };
}

function EstablishmentSelect({
  establishments,
}: {
  establishments: { id: string; name: string }[];
}) {
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

export default async function AiSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; saved?: string }>;
}) {
  const { orgId } = await getOrgContext();
  const sp = await searchParams;
  const tab: TabKey = sp.tab === "voice" || sp.tab === "setup" ? sp.tab : "info";
  const actionFailed = sp.saved === "error";

  const loadAi = () =>
    withTenant(orgId, async (tx) =>
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

  // Training profile feeds the readiness ribbon + Voice & style tab. Fail-soft
  // on the un-migrated table (same guardrail as /ai/training).
  const profile = await withTenant(orgId, async (tx) =>
    tx.aiTrainingProfile.findUnique({ where: { organizationId: orgId } }),
  ).catch((err: unknown) => {
    if (isMissingRelation(err)) return null;
    throw err;
  });

  // Knowledge gaps (already fail-soft → [] / zeros when not migrated).
  const [openGaps, stats] = await Promise.all([
    listKnowledgeGaps(orgId, { status: "open", limit: 6 }),
    learningStats(orgId),
  ]);

  const indexedDocs = documents.filter((d) => d.status === "indexed").length;
  const score = computeReadiness(readiness(profile), indexedDocs, widgets.length > 0);
  const copy = readinessCopy(score);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <AppShellServer topBar={<TopBar title="AI Chatbot" />}>
      <PageHeader
        kicker="AI training"
        title="Train AI on how the business actually works"
        description="Business facts, voice, pricing, and test prompts keep every response on-brand. Upload your FAQ, get a JS snippet, embed it on your website."
        breadcrumb={[{ label: "AI" }, { label: "Chatbot" }]}
        actions={
          <Button asChild>
            <Link href="/ai/training">Start auto-setup</Link>
          </Button>
        }
      />

      {/* ---------- Brain-readiness ribbon (live signals) ---------- */}
      <section className="ds-card spot aikb-ribbon" aria-label="AI brain readiness">
        <div className="aikb-ribbon__glow" aria-hidden="true" />
        <div className="aikb-ribbon__inner">
          <div className="aikb-ribbon__brain" aria-hidden="true">
            <Icon name="brain" size={44} stroke={1.2} style={{ opacity: 0.9 }} />
          </div>
          <div className="aikb-ribbon__body">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="aikb-pill">Brain readiness · {score}%</span>
              <span className="aikb-pill">
                {indexedDocs} {indexedDocs === 1 ? "document" : "documents"} indexed
              </span>
              {widgets.length > 0 && <span className="aikb-pill">Widget live</span>}
              {profile?.updatedAt && (
                <span className="aikb-pill">Trained {relativeTime(profile.updatedAt)}</span>
              )}
            </div>
            <h2 className="aikb-ribbon__title">{copy.headline}</h2>
            <p className="aikb-ribbon__sub">{copy.sub}</p>
            <div
              className="aikb-bar"
              role="progressbar"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Brain readiness"
            >
              <div className="aikb-bar__fill" style={{ width: `${score}%` }} />
            </div>
          </div>
        </div>
      </section>

      <div className="aikb-grid">
        {/* ---------- Training tabs card ---------- */}
        <section className="ds-card" aria-label="Training">
          <div className="ds-card__head">
            <div>
              <h3 className="ds-card__title">Training tabs</h3>
              <div className="ds-card__sub">Business info, voice, pricing and setup</div>
            </div>
          </div>
          <div className="ds-card__body">
            <div className="tabbar" style={{ marginBottom: 16 }}>
              <div className="tabs" role="tablist" aria-label="AI training sections">
                {TABS.map((t) => {
                  const isActive = t.key === tab;
                  return (
                    <Link
                      key={t.key}
                      href={`/ai?tab=${t.key}`}
                      role="tab"
                      aria-selected={isActive}
                      className={isActive ? "tabs__t is-active" : "tabs__t"}
                      style={{ textDecoration: "none" }}
                    >
                      <Icon name={t.icon} size={14} />
                      <span>{t.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {actionFailed && (
              <div
                className="ds-card"
                role="alert"
                style={{
                  padding: "10px 14px",
                  marginBottom: 14,
                  borderColor: "var(--bad, #e14d62)",
                  background: "color-mix(in srgb, var(--bad, #e14d62) 6%, white)",
                  fontSize: 13,
                }}
              >
                That action couldn&apos;t be completed. You may not have permission (manager role
                required), or the item was already removed — refresh and try again.
              </div>
            )}

            {tab === "info" && (
              <div>
                {/* Add-knowledge + URL-import forms (client island — renders
                    the actions' {ok|error} results inline; bug 009). */}
                <KbAddForms establishments={establishments} />

                <hr className="aikb-divider" />

                {/* Indexed documents (live rows + delete action) */}
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
                                redirect("/ai?tab=info&saved=error");
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
              </div>
            )}

            {tab === "voice" && (
              <div>
                {profile ? (
                  <>
                    <h4 className="aikb-subhead">
                      <Icon name="sparkle" size={14} /> How your AI sounds
                    </h4>
                    <div className="aikb-voice">
                      <div className="aikb-voice__item">
                        <div className="aikb-voice__k">Personality</div>
                        <div className="aikb-voice__v">
                          {voiceLabel("aiPersonalityStyle", profile.aiPersonalityStyle)}
                        </div>
                      </div>
                      <div className="aikb-voice__item">
                        <div className="aikb-voice__k">Customer inquiries</div>
                        <div className="aikb-voice__v">
                          {voiceLabel("customerInquiryStyle", profile.customerInquiryStyle)}
                        </div>
                      </div>
                      <div className="aikb-voice__item">
                        <div className="aikb-voice__k">Booking</div>
                        <div className="aikb-voice__v">
                          {voiceLabel("bookingStyle", profile.bookingStyle)}
                        </div>
                      </div>
                      <div className="aikb-voice__item">
                        <div className="aikb-voice__k">Complaints</div>
                        <div className="aikb-voice__v">
                          {voiceLabel("complaintStyle", profile.complaintStyle)}
                        </div>
                      </div>
                      <div className="aikb-voice__item">
                        <div className="aikb-voice__k">Post-purchase support</div>
                        <div className="aikb-voice__v">
                          {voiceLabel("supportStyle", profile.supportStyle)}
                        </div>
                      </div>
                      <div className="aikb-voice__item">
                        <div className="aikb-voice__k">Custom instructions</div>
                        <div className="aikb-voice__v">
                          {profile.customPrompt && profile.customPrompt.trim().length > 0
                            ? `${profile.customPrompt.trim().length.toLocaleString()} chars set`
                            : "Not set"}
                        </div>
                      </div>
                    </div>
                    <div className="row" style={{ gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                      <Button asChild>
                        <Link href="/ai/training#behavior">Edit voice &amp; style</Link>
                      </Button>
                      <span className="aikb-hint" style={{ marginTop: 0 }}>
                        Voice, behavior and pricing fields are edited in the AI training hub —
                        every channel (reviews, chat, phone) reads the same profile.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="aikb-empty">
                    <EmptyIllustration name="ai-assistant" size={220} />
                    <div className="aikb-empty__t">No voice profile yet</div>
                    <div className="aikb-empty__d">
                      Run auto-setup to teach the AI your tone, booking and complaint style — it
                      takes about a minute.
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <Button asChild>
                        <Link href="/ai/training">Start auto-setup</Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "setup" && (
              <div>
                {/* Widget key generation (existing action: createWidgetKey) */}
                <h4 className="aikb-subhead">
                  <Icon name="plug" size={14} /> Embed snippet
                </h4>
                <p style={{ fontSize: 12.5, color: "var(--rl-muted)", margin: "0 0 12px" }}>
                  Generate a widget key, then paste the snippet on any page where you want the
                  chatbot.
                </p>
                <form
                  action={async (form: FormData) => {
                    "use server";
                    try {
                      await createWidgetKey(form);
                    } catch (err) {
                      if (isNextControlFlow(err)) throw err;
                      redirect("/ai?tab=setup&saved=error");
                    }
                  }}
                  className="space-y-3"
                >
                  <div className="aikb-formgrid">
                    <label className="aikb-label">
                      Establishment (optional)
                      <EstablishmentSelect establishments={establishments} />
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
                          <code style={{ fontSize: 11.5, fontFamily: "var(--f-mono)", wordBreak: "break-all" }}>
                            {w.publicKey}
                          </code>
                          <form
                            action={async () => {
                              "use server";
                              try {
                                await revokeWidgetKey(w.id);
                              } catch (err) {
                                if (isNextControlFlow(err)) throw err;
                                redirect("/ai?tab=setup&saved=error");
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

                {/* Test the chatbot (existing links) */}
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
                <p className="aikb-hint" style={{ marginTop: 10 }}>
                  Prefer an in-app tester?{" "}
                  <Link href="/ai/training#test" className="text-primary hover:underline">
                    Open the Test AI tab →
                  </Link>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ---------- Knowledge gaps rail (live gap queue) ---------- */}
        <aside className="ds-card" aria-label="Knowledge gaps">
          <div className="ds-card__head">
            <div>
              <h3 className="ds-card__title">Knowledge gaps</h3>
              <div className="ds-card__sub">Questions your AI couldn&apos;t answer</div>
            </div>
            {stats.open > 0 && <span className="chip chip--warn">{stats.open} open</span>}
          </div>
          <div className="ds-card__body" style={{ paddingTop: 6, paddingBottom: 10 }}>
            {openGaps.length === 0 ? (
              <div className="aikb-empty">
                <EmptyIllustration name="ai-assistant" size={180} />
                <div className="aikb-empty__t">No gaps detected yet</div>
                <div className="aikb-empty__d">
                  Gaps appear when the AI can&apos;t answer a customer — teach it the answer and
                  it never misses that question again.
                </div>
              </div>
            ) : (
              <>
                {openGaps.map((g, i) => (
                  <div key={g.id} className="aikb-gap">
                    <div className="row" style={{ gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                      <span className="aikb-gap__num" aria-hidden="true">
                        {i + 1}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="aikb-gap__q">{g.question}</div>
                        <div className="aikb-gap__meta">
                          {g.hitCount > 1 ? `Asked ${g.hitCount}× · ` : ""}
                          {g.source.replace(/_/g, " ")} · {relativeTime(g.createdAt)}
                        </div>
                      </div>
                    </div>
                    <Link href="/ai/training#test" className="aikb-gap__btn">
                      Review
                    </Link>
                  </div>
                ))}
                <div style={{ paddingTop: 12 }}>
                  <Link
                    href="/ai/training#test"
                    className="text-primary hover:underline"
                    style={{ fontSize: 12.5, fontWeight: 600 }}
                  >
                    Open learning monitor →
                  </Link>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </AppShellServer>
  );
}
