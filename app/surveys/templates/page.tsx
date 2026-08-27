import { AppShellServer } from "@/components/app-shell-server";
import { PageHeader } from "@/components/page-header";
import { Icon } from "@/components/shell/icon";
import { TopBar } from "@/components/topbar";
import { getOrgContext } from "@/lib/auth/org-context";
import { listSurveyTemplates } from "@/lib/surveys/templates";
import Link from "next/link";

/**
 * Templates library (Module 11). Lists survey templates (a template = a
 * `SurveyCampaign`'s question set + branding) and links each to the two-column
 * live-preview editor. Keeps `?tab=templates` deep-linkable server-side.
 */

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  nps: "NPS Scale",
  rating: "Rating",
  multichoice: "Multiple Choice",
  yes_no: "Yes / No",
  text: "Text",
};

export default async function SurveyTemplatesPage() {
  const { orgId } = await getOrgContext();
  const templates = await listSurveyTemplates(orgId);

  return (
    <AppShellServer topBar={<TopBar />} crumbs={["Reputation", "Customer Feedback", "Templates"]}>
      <PageHeader
        kicker="Build once · reuse everywhere"
        title="Survey templates"
        description="Design a question set with live preview, then send it or wire it into an automation. Editing a template updates future sends."
        actions={
          <Link href="/surveys/new" className="btn btn--pri">
            <Icon name="plus" size={12} />
            New survey
          </Link>
        }
      />

      {templates.length === 0 ? (
        <div className="ds-card" style={{ padding: 48, textAlign: "center", maxWidth: 520, marginInline: "auto" }}>
          <div
            aria-hidden
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              margin: "0 auto 16px",
              background: "var(--pri-50, rgba(37,99,235,0.08))",
              color: "var(--pri)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Icon name="copy" size={24} />
          </div>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" }}>No templates yet</h3>
          <p className="dim" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            Create a survey to get a template you can edit, preview, and reuse.
          </p>
          <Link href="/surveys/new" className="btn btn--pri btn--lg" style={{ marginTop: 18 }}>
            <Icon name="plus" size={14} />
            Create your first survey
          </Link>
        </div>
      ) : (
        <div className="grid-3" style={{ gap: 14 }}>
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/surveys/templates/${t.id}`}
              className="ds-card ds-card--hover"
              style={{ padding: 18, textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 10 }}
            >
              <div className="row">
                <span
                  aria-hidden
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    display: "grid",
                    placeItems: "center",
                    background: t.branding.primaryColor ? `${t.branding.primaryColor}1a` : "var(--surface-3)",
                    color: t.branding.primaryColor ?? "var(--rl-muted)",
                  }}
                >
                  <Icon name="survey" size={15} />
                </span>
                <span className="lbl-mono" style={{ marginLeft: "auto", margin: 0 }}>
                  {t.questions.length} question{t.questions.length === 1 ? "" : "s"}
                </span>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.015em" }}>{t.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {t.questions.slice(0, 4).map((q, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional chip list
                  <span key={i} className="chip chip--out" style={{ fontSize: 10.5 }}>
                    {TYPE_LABEL[q.type] ?? q.type}
                  </span>
                ))}
              </div>
              <div className="dim" style={{ fontSize: 12, marginTop: "auto" }}>
                Edit & preview →
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShellServer>
  );
}
