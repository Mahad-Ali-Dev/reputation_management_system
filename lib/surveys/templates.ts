import { withTenant } from "@/lib/db/with-tenant";

/**
 * Survey template helpers (Module 11).
 *
 * There is NO `SurveyTemplate` model — a "template" IS a `SurveyCampaign` (its
 * question set + branding). Branding lives under the campaign's existing
 * `incentive` JSON (`incentive.branding`) so no schema change is needed; the
 * coupon fields on `incentive` (enabled/valueCents/description) are untouched.
 *
 * The question types match the Day-7 CHECK constraint:
 *   nps | rating | text | multichoice | yes_no
 */

export const QUESTION_TYPES = ["nps", "rating", "text", "multichoice", "yes_no"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export type TemplateBranding = {
  primaryColor?: string;
  greeting?: string;
  thankYou?: string;
  logoUrl?: string;
};

export type TemplateQuestion = {
  type: QuestionType;
  prompt: string;
  required: boolean;
  /** For multichoice: the selectable choices. */
  choices?: string[];
};

export type SurveyTemplate = {
  id: string;
  name: string;
  type: string;
  status: string;
  branding: TemplateBranding;
  questions: TemplateQuestion[];
  responseCount: number;
};

/**
 * Input + result for the `saveSurveyTemplate` action. Declared here (a plain
 * module) so the `"use server"` action file exports only the action.
 */
export type SaveTemplateInput = {
  id: string;
  name: string;
  questions: TemplateQuestion[];
  branding: {
    primaryColor?: string;
    greeting?: string;
    thankYou?: string;
    logoUrl?: string;
  };
};

export type SaveTemplateResult = { ok: true } | { ok: false; error: string };

/** Extract branding from a campaign's `incentive` JSON (fail-soft → {}). */
export function brandingFromIncentive(incentive: unknown): TemplateBranding {
  const b = (incentive as { branding?: TemplateBranding } | null)?.branding;
  if (!b || typeof b !== "object") return {};
  return {
    primaryColor: typeof b.primaryColor === "string" ? b.primaryColor : undefined,
    greeting: typeof b.greeting === "string" ? b.greeting : undefined,
    thankYou: typeof b.thankYou === "string" ? b.thankYou : undefined,
    logoUrl: typeof b.logoUrl === "string" ? b.logoUrl : undefined,
  };
}

/** Merge new branding into an existing `incentive` JSON without dropping coupon fields. */
export function mergeBrandingIntoIncentive(incentive: unknown, branding: TemplateBranding): Record<string, unknown> {
  const base = (incentive && typeof incentive === "object" ? (incentive as Record<string, unknown>) : {}) ?? {};
  return { ...base, branding };
}

function choicesFromOptions(options: unknown): string[] | undefined {
  const c = (options as { choices?: unknown } | null)?.choices;
  if (Array.isArray(c)) return c.filter((x): x is string => typeof x === "string");
  return undefined;
}

/** List the org's templates (campaigns) with their branding + a question count. */
export async function listSurveyTemplates(orgId: string): Promise<SurveyTemplate[]> {
  return withTenant(orgId, async (tx) => {
    const campaigns = await tx.surveyCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        questions: { orderBy: { position: "asc" } },
        _count: { select: { responses: true } },
      },
    });
    return campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      branding: brandingFromIncentive(c.incentive),
      questions: c.questions.map((q) => ({
        type: (QUESTION_TYPES as readonly string[]).includes(q.type) ? (q.type as QuestionType) : "text",
        prompt: q.prompt,
        required: q.required,
        choices: choicesFromOptions(q.options),
      })),
      responseCount: c._count?.responses ?? 0,
    }));
  });
}

/** Load one template (campaign) for the editor. Returns null if not found. */
export async function getSurveyTemplate(orgId: string, id: string): Promise<SurveyTemplate | null> {
  return withTenant(orgId, async (tx) => {
    const c = await tx.surveyCampaign.findFirst({
      where: { id },
      include: {
        questions: { orderBy: { position: "asc" } },
        _count: { select: { responses: true } },
      },
    });
    if (!c) return null;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      status: c.status,
      branding: brandingFromIncentive(c.incentive),
      questions: c.questions.map((q) => ({
        type: (QUESTION_TYPES as readonly string[]).includes(q.type) ? (q.type as QuestionType) : "text",
        prompt: q.prompt,
        required: q.required,
        choices: choicesFromOptions(q.options),
      })),
      responseCount: c._count?.responses ?? 0,
    };
  });
}
