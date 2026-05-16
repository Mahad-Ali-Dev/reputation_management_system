import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { submitSurveyResponse } from "@/lib/surveys/actions";
import SurveyForm from "./form";

export const dynamic = "force-dynamic";

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
          establishment: { select: { name: true } },
          questions: { orderBy: { position: "asc" } },
        },
      },
    },
  });

  if (!record) notFound();

  const businessName = record.campaign.establishment?.name ?? "us";

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

  const npsQuestion = record.campaign.questions.find((q) => q.type === "nps");
  const textQuestion = record.campaign.questions.find((q) => q.type === "text");

  return (
    <ResponsePage>
      <h1 className="text-2xl font-bold">How was your experience with {businessName}?</h1>
      <p className="text-muted-foreground mt-1">Takes about 30 seconds. Thank you!</p>
      <SurveyForm
        token={token}
        action={submitSurveyResponse}
        npsPrompt={npsQuestion?.prompt ?? "How likely are you to recommend us?"}
        textPrompt={textQuestion?.prompt ?? "What's the main reason?"}
        hasTextQuestion={!!textQuestion}
      />
    </ResponsePage>
  );
}

function ResponsePage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-xl rounded-xl border bg-white p-8 shadow-sm space-y-6">
        {children}
      </div>
    </main>
  );
}
