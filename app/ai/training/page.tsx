import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { listKnowledgeGaps, learningStats } from "@/lib/ai/knowledge-gaps";
import { getOrgContext } from "@/lib/auth/org-context";
import { isMissingRelation } from "@/lib/contacts/fail-soft";
import { withTenant } from "@/lib/db/with-tenant";
import { KbTabs } from "./_components/kb-tabs";
import { readiness, relativeTime, type KbSource, type TrainingProfile } from "./_components/shared-utils";

/**
 * AI Knowledge Base — the 4-tab hub (Module 05).
 *
 * Server component: loads the profile + knowledge-gap queue + learning stats +
 * suggested test questions, then hands them to the <KbTabs> client shell (which
 * shows Auto-Setup when the profile is empty, else the 4 tabs — all switched
 * without a page reload). Keeps the chrome + readiness ribbon.
 */

export const dynamic = "force-dynamic";

type OperatingHours = Record<string, { open?: string; close?: string }>;

const FALLBACK_QUESTIONS = [
  "What are your hours?",
  "How much does it cost?",
  "Where are you located?",
  "Do you take walk-ins?",
  "How do I book an appointment?",
];

function buildSuggestions(profile: { servicesProducts: string | null } | null, unsureTopics: string[]): string[] {
  const out: string[] = [];
  // Owner's actual unsure topics rank first — testing them is highest value.
  for (const t of unsureTopics) {
    const q = t.trim();
    if (q) out.push(q.endsWith("?") ? q : `Tell me about ${q}`);
    if (out.length >= 3) break;
  }
  for (const q of FALLBACK_QUESTIONS) {
    if (out.length >= 6) break;
    if (!out.includes(q)) out.push(q);
  }
  return out.slice(0, 6);
}

export default async function AiTrainingPage() {
  const { orgId } = await getOrgContext();

  // FAIL-SOFT: the profile read selects Wave-0 columns (sourceUrl /
  // lastAutoUpdatedAt / locations / taughtFacts). On a deploy where the SQL
  // hasn't been applied yet those columns/table are absent — Postgres raises
  // 42703 (undefined_column) / 42P01 (undefined_table) (Prisma P2022 / P2021).
  // Degrade to `null` so the page shows Auto-Setup instead of 500-ing; re-throw
  // anything that isn't a missing-relation (a real bug must still surface).
  const profile = await withTenant(orgId, async (tx) =>
    tx.aiTrainingProfile.findUnique({ where: { organizationId: orgId } }),
  ).catch((err: unknown) => {
    if (isMissingRelation(err)) return null;
    throw err;
  });

  // Gap queue + learning stats are fail-soft (return empty/zero if the
  // knowledge_gaps table isn't migrated yet).
  const [openGaps, answeredGaps, stats] = await Promise.all([
    listKnowledgeGaps(orgId, { status: "open", limit: 50 }),
    listKnowledgeGaps(orgId, { status: "answered", limit: 30 }),
    learningStats(orgId),
  ]);

  // Knowledge sources (the auto-setup website document + any manual/PDF docs).
  // Fail-soft: the ai_documents table may not be migrated on an older deploy.
  const sourcesRaw = await withTenant(orgId, async (tx) =>
    tx.aiDocument.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        title: true,
        sourceType: true,
        sourceUri: true,
        status: true,
        lastIndexedAt: true,
        createdAt: true,
        sourceMetadata: true,
        _count: { select: { embeddings: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ).catch((err: unknown) => {
    if (isMissingRelation(err)) return [];
    throw err;
  });

  const sources: KbSource[] = sourcesRaw.map((d) => {
    const meta = (d.sourceMetadata ?? null) as { pagesCrawled?: number; auto?: boolean } | null;
    return {
      id: d.id,
      title: d.title,
      sourceType: d.sourceType,
      sourceUri: d.sourceUri,
      status: d.status,
      chunks: d._count.embeddings,
      pagesCrawled: meta?.pagesCrawled ?? null,
      lastIndexedAt: d.lastIndexedAt,
      createdAt: d.createdAt,
    };
  });

  const suggestions = buildSuggestions(profile, profile?.unsureTopics ?? []);
  const score = readiness(profile);

  const tabProfile: TrainingProfile = {
    businessOverview: profile?.businessOverview ?? null,
    servicesProducts: profile?.servicesProducts ?? null,
    pricingDetails: profile?.pricingDetails ?? null,
    locations: profile?.locations ?? null,
    customPrompt: profile?.customPrompt ?? null,
    operatingHours: (profile?.operatingHours as OperatingHours | null) ?? {},
    aiPersonalityStyle: profile?.aiPersonalityStyle ?? null,
    customerInquiryStyle: profile?.customerInquiryStyle ?? null,
    bookingStyle: profile?.bookingStyle ?? null,
    complaintStyle: profile?.complaintStyle ?? null,
    supportStyle: profile?.supportStyle ?? null,
    sourceUrl: profile?.sourceUrl ?? null,
    lastAutoUpdatedAt: profile?.lastAutoUpdatedAt ?? null,
    updatedAt: profile?.updatedAt ?? new Date(),
  };

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Intelligence", "AI Knowledge Base"]}>
      <PageHeader
        kicker="The brain behind every reply"
        title="AI knowledge base"
        description="Teach your AI about your business, voice and pricing. It uses this to answer reviews, DMs, surveys and phone calls — and learns from every question it can't answer."
      />

      {/* Readiness ribbon */}
      <div className="ds-card spot" style={{ marginBottom: 18, overflow: "hidden", position: "relative" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -80,
            top: -80,
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: "rgba(255,255,255,.12)",
          }}
        />
        <div style={{ padding: 22, position: "relative", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div
            style={{
              width: 110,
              height: 110,
              borderRadius: 22,
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.15)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            <Icon name="brain" size={50} stroke={1.2} style={{ opacity: 0.9 }} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="row" style={{ marginBottom: 8, gap: 8 }}>
              <span style={{ background: "rgba(255,255,255,.15)", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
                {profile ? `Trained ${relativeTime(profile.updatedAt)}` : "Not trained yet"}
              </span>
              {tabProfile.lastAutoUpdatedAt && (
                <span style={{ background: "rgba(255,255,255,.15)", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>
                  Auto-checked {relativeTime(tabProfile.lastAutoUpdatedAt)}
                </span>
              )}
            </div>
            <h2 style={{ fontSize: 26, fontWeight: 600, margin: 0, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              Brain readiness · {score}%
            </h2>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6, maxWidth: 480 }}>
              {score >= 90
                ? "Strong knowledge base. Your AI is ready to answer with confidence."
                : score >= 70
                  ? "Solid foundation. Add pricing or refund details to push past 95%."
                  : "Fill in the business overview, services and hours to unlock full AI quality."}
            </div>
          </div>
        </div>
      </div>

      <KbTabs
        profile={tabProfile}
        sources={sources}
        gaps={openGaps}
        answeredGaps={answeredGaps}
        stats={stats}
        suggestions={suggestions}
      />
    </AppShellServer>
  );
}
