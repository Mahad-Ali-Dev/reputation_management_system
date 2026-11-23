import {
  BRAND,
  ctaButton,
  emailHero,
  emailHeroIcon,
  emailNpsScale,
  emailPersonCard,
  emailPill,
  emailShell,
  emailSmall,
  escapeHtml,
} from "@/lib/email/templates";

/**
 * Survey emails: the invite a customer gets and the alert an owner gets when a
 * customer leaves a low score. Both used to be inline HTML in
 * lib/surveys/actions.ts; they now share the email design system.
 */

/**
 * Customer survey invite, branded as the business.
 *
 * When the campaign has an NPS question the email shows the 0 to 10 scale.
 * Each number opens the survey with `?nps=n`, which pre-selects that answer,
 * so the tap is never thrown away. Without an NPS question it's a plain button.
 */
export function surveyInviteEmail(args: {
  recipientName: string | null;
  businessName: string;
  responseUrl: string;
  hasNps: boolean;
}): { html: string; text: string } {
  const biz = escapeHtml(args.businessName);
  const first = args.recipientName?.trim().split(/\s+/)[0] ?? "";
  const sep = args.responseUrl.includes("?") ? "&" : "?";

  const html = emailShell({
    preheader: args.hasNps
      ? "One quick question, under a minute."
      : "A quick survey about your visit, under a minute.",
    title: `A quick question from ${args.businessName}`,
    brand: { name: args.businessName },
    hero: emailHero({
      tone: "success",
      visual: emailHeroIcon("hero-smile.gif"),
      title: first ? `A quick question, ${escapeHtml(first)}` : "A quick question",
      sub: args.hasNps
        ? `How likely are you to recommend ${biz} to a friend?`
        : `We'd love your honest feedback on your recent visit to ${biz}.`,
    }),
    body: args.hasNps
      ? `${emailNpsScale((n) => `${args.responseUrl}${sep}nps=${n}`)}
         ${emailSmall("Tap a number to answer. It takes less than a minute and goes straight to the team.", "margin-top:22px;text-align:center;")}`
      : `${ctaButton({ url: args.responseUrl, label: "Share feedback", margin: "6px auto 20px" })}
         ${emailSmall("It takes less than a minute and goes straight to the team.")}`,
    footerNote: `You're getting this because you visited ${biz}.`,
  });

  const text = `Hi${first ? ` ${first}` : ""},

Quick favour: we'd love your feedback on your recent experience with ${args.businessName}. It takes 30 seconds:

${args.responseUrl}

Thanks!`;

  return { html, text };
}

/** Owner alert for a low survey score. Platform mail, so Repulabs branded. */
export function unhappySurveyAlertEmail(args: {
  who: string | null;
  businessName: string | null;
  scoreLabel: string;
  dashUrl: string;
}): string {
  const who = args.who?.trim() || null;
  const biz = args.businessName ? escapeHtml(args.businessName) : null;
  return emailShell({
    preheader: `${who ?? "A customer"} left a low score and is expecting a follow-up.`,
    title: "Unhappy survey response",
    hero: emailHero({
      tone: "warning",
      badge: emailPill("Needs attention", "white", BRAND.danger),
      visual: emailHeroIcon("hero-alert.gif"),
      title: "A customer needs a follow-up",
      sub: `They left a low score${biz ? ` for ${biz}` : ""} and were told someone from your team would be in touch.`,
    }),
    body: `
      ${emailPersonCard({
        name: who ?? "A customer",
        sub: `Survey response${biz ? ` &middot; ${biz}` : ""}`,
        right: `<span style="display:inline-block;background:${BRAND.dangerBg};border-radius:12px;padding:8px 12px;font-family:'Manrope','DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;color:${BRAND.danger};white-space:nowrap;">${escapeHtml(args.scoreLabel)}</span>`,
      })}
      ${ctaButton({ url: args.dashUrl, label: "Review the response" })}
      ${emailSmall("Getting back to them quickly gives you the best chance to put things right.")}
    `,
  });
}
