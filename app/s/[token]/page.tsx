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
        <h1 className="text-2xl font-bold">Thanks!</h1>
        <p className="text-muted-foreground">You've already submitted this survey. We appreciate your feedback.</p>
      </ResponsePage>
    );
  }
  if (record.expiresAt.getTime() < Date.now()) {
    return (
      <ResponsePage>
        <h1 className="text-2xl font-bold">This link has expired</h1>
        <p className="text-muted-foreground">Sorry, this survey link has expired. Please reach out directly if you'd like to share feedback.</p>
      </ResponsePage>
    );
  }

  const questions = record.campaign.questions.map(toPublicQuestion);
  const greeting = branding.greeting?.trim();
  const logoUrl = branding.logoUrl || record.campaign.establishment?.imageUrl || null;

  return (
    <ResponsePage logoUrl={logoUrl}>
      <h1 className="text-2xl font-bold">{greeting || `How was your experience with ${businessName}?`}</h1>
      <p className="text-muted-foreground mt-1">Takes about 30 seconds. Thank you!</p>
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
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-xl rounded-xl border bg-white p-8 shadow-sm space-y-6">
        {logoUrl && (
          // biome-ignore lint/performance/noImgElement: customer-facing standalone page, not app chrome
          <img src={logoUrl} alt="" className="mx-auto max-h-12 object-contain" />
        )}
        {children}
        <div className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-400">
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
