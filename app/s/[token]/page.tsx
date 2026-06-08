import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { submitSurveyResponse } from "@/lib/surveys/actions";
import { brandingFromIncentive } from "@/lib/surveys/templates";
import SurveyForm, { type PublicQuestion } from "./form";

export const dynamic = "force-dynamic";

/** Map a SurveyQuestion row to the public-form question shape. */
function toPublicQuestion(q: {
  id: string;
  type: string;
  prompt: string;
  required: boolean;
  options: unknown;
}): PublicQuestion {
  const choices = (q.options as { choices?: unknown } | null)?.choices;
  return {
    id: q.id,
    type: ["nps", "rating", "text", "multichoice", "yes_no"].includes(q.type)
      ? (q.type as PublicQuestion["type"])
      : "text",
    prompt: q.prompt,
    required: q.required,
    choices: Array.isArray(choices) ? choices.filter((c): c is string => typeof c === "string") : undefined,
  };
}

export default async function SurveyResponsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token || token.length < 20 || token.length > 120) notFound();

  const tokenHash = createHash("sha256").update(token).digest("hex");

  // No auth — public endpoint. Lookup by exact hash; abuse mitigated by token entropy + single-use.
  const record = await prisma.surveyResponseToken.findUnique({
    where: { tokenHash },
    include: {
      campaign: {
        include: {
          establishment: { select: { name: true, imageUrl: true } },
          questions: { orderBy: { position: "asc" } },
        },
      },
    },
  });

  if (!record) notFound();

  const businessName = record.campaign.establishment?.name ?? "us";
  const branding = brandingFromIncentive(record.campaign.incentive);

  if (record.consumedAt) {
    return (
      <ResponsePage>
        <h1 style={titleStyle}>Thanks!</h1>
        <p style={subStyle}>You've already submitted this survey. We appreciate your feedback.</p>
      </ResponsePage>
    );
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return (
      <ResponsePage>
        <h1 style={titleStyle}>This link has expired</h1>
        <p style={subStyle}>Sorry, this survey link has expired. Please reach out directly if you'd like to share feedback.</p>
      </ResponsePage>
    );
  }

  const questions = record.campaign.questions.map(toPublicQuestion);
  const greeting = branding.greeting?.trim();
  const logoUrl = branding.logoUrl || record.campaign.establishment?.imageUrl || null;

  return (
    <ResponsePage logoUrl={logoUrl}>
      <h1 style={titleStyle}>{greeting || `How was your experience with ${businessName}?`}</h1>
      <p style={{ ...subStyle, marginTop: 6 }}>Takes about 30 seconds. Thank you!</p>
      <SurveyForm
        token={token}
        action={submitSurveyResponse}
        questions={questions}
        thankYouMessage={branding.thankYou ?? null}
        accent={branding.primaryColor ?? null}
      />
    </ResponsePage>
  );
}

function ResponsePage({
  children,
  logoUrl,
}: {
  children: React.ReactNode;
  logoUrl?: string | null;
}) {
  return (
    <main style={shellStyle}>
      <div style={panelStyle}>
        {logoUrl && (
          // biome-ignore lint/performance/noImgElement: customer-facing standalone page, not app chrome
          <img src={logoUrl} alt="" style={{ display: "block", margin: "0 auto", maxHeight: 48, objectFit: "contain" }} />
        )}
        {children}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingTop: 4,
            fontSize: 11,
            color: "#94a3b8",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Secure &amp; private — your answers are confidential
        </div>
      </div>
    </main>
  );
}

// =========================================================================
// Inline styles — public, standalone survey page. v3 cool-slate canvas with a
// white card; zero design-system / app-chrome dependencies so it renders fast
// for a customer hitting it cold on cellular.
// =========================================================================

const shellStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  background:
    "radial-gradient(at 0% 0%, rgba(37, 99, 235, 0.05) 0%, transparent 42%), " +
    "radial-gradient(at 100% 100%, rgba(79, 70, 229, 0.06) 0%, transparent 50%), " +
    "linear-gradient(180deg, #f7f8fb 0%, #eef1f6 100%)",
  fontFamily: "var(--f-ui, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif)",
  color: "#0f172a",
};

const panelStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 576,
  background: "#ffffff",
  border: "1px solid #eef1f6",
  borderRadius: 16,
  padding: 32,
  boxShadow: "0 10px 28px -12px rgba(15, 23, 42, 0.12), 0 2px 8px -3px rgba(15, 23, 42, 0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 20,
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 600,
  letterSpacing: "-0.025em",
  lineHeight: 1.2,
  margin: 0,
  color: "#0f172a",
};

const subStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.55,
  color: "#64748b",
  margin: 0,
};
