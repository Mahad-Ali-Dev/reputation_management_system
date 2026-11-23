import {
  ctaButton,
  emailHero,
  emailHeroIcon,
  emailShell,
  emailSmall,
  emailStarRow,
  escapeHtml,
} from "@/lib/email/templates";

/**
 * Airbnb stay reminder, sent by app/api/cron/picker-reminder to a guest who
 * asked for one at the property. Lives here (not in the route file) because
 * Next route modules may only export HTTP handlers.
 */
export function buildReminderHtml(args: { listingName: string; listingUrl: string }): string {
  // Deliberately mild (Airbnb no-coercion policy): every star opens the same
  // listing page, so there is no rating gate and no incentive.
  const name = escapeHtml(args.listingName);
  const href = escapeHtml(args.listingUrl);
  return emailShell({
    preheader: "Your host would love to hear how the trip went.",
    title: `Hope you enjoyed your stay at ${args.listingName}`,
    brand: { name: args.listingName },
    hero: emailHero({
      visual: emailHeroIcon("hero-pin.gif"),
      title: "Hope you enjoyed your stay",
      sub: `Thanks for staying at ${name}. If you have a minute, your host would love to hear how the trip went.`,
      extra: emailStarRow(href),
    }),
    body: `
      ${ctaButton({ url: href, label: "Open the listing on Airbnb", margin: "6px auto 20px" })}
      ${emailSmall("You're getting this because you tapped the welcome card at the property and asked for a reminder. We won't email you again about this stay.")}
    `,
  });
}
