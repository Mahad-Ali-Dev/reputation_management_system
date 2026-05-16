import { withTenant } from "@/lib/db/with-tenant";

export async function listCampaigns(orgId: string) {
  return withTenant(orgId, async (tx) => {
    return tx.surveyCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { responses: true, tokens: true } },
      },
    });
  });
}

export async function getCampaign(orgId: string, id: string) {
  return withTenant(orgId, async (tx) => {
    return tx.surveyCampaign.findFirst({
      where: { id },
      include: {
        questions: { orderBy: { position: "asc" } },
        responses: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            answers: { include: { question: { select: { type: true, prompt: true } } } },
          },
        },
        _count: { select: { responses: true, tokens: true } },
      },
    });
  });
}

export async function campaignStats(orgId: string, campaignId: string) {
  return withTenant(orgId, async (tx) => {
    const responses = await tx.surveyResponse.findMany({
      where: { campaignId },
      select: { ratingSummary: true, smartRouteTo: true },
    });
    const ratings = responses
      .map((r) => (r.ratingSummary ? Number(r.ratingSummary) : null))
      .filter((n): n is number => n !== null);
    const npsScores = ratings.map((r) => (r / 5) * 10); // back to 0-10 scale
    const promoters = npsScores.filter((s) => s >= 9).length;
    const detractors = npsScores.filter((s) => s <= 6).length;
    const passives = npsScores.length - promoters - detractors;
    const nps = npsScores.length
      ? Math.round(((promoters - detractors) / npsScores.length) * 100)
      : null;
    return {
      total: responses.length,
      promoters,
      passives,
      detractors,
      nps,
      smartRouted: responses.filter((r) => r.smartRouteTo === "review_request").length,
      alerted: responses.filter((r) => r.smartRouteTo === "internal_alert").length,
    };
  });
}
