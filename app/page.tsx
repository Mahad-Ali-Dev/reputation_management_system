import { MarketingFooter } from "@/components/landing/marketing-shell";
import { LandingFaq } from "@/components/landing/sections/faq";
import { LandingHero } from "@/components/landing/sections/hero";
import { LandingIntegrations } from "@/components/landing/sections/integrations";
import { LandingLocations } from "@/components/landing/sections/locations";
import { LandingReady } from "@/components/landing/sections/ready";
import { LandingSteps } from "@/components/landing/sections/steps";
import { LandingWorkspace } from "@/components/landing/sections/workspace";

/**
 * Marketing home ("/") — the animated repulabs landing page.
 *
 * Composed from self-contained section components (each `Landing<Name>`), built
 * to the delivered mockups in tasks/UI/landing page/ and animated with the
 * shared primitives in components/landing/anim.tsx (rotating text, shiny sweep,
 * interactive dot-grid, scroll reveals, idle float).
 *
 * Flow: hero → platform (what) → how it works → integrations → operators
 * (who + proof + security) → FAQ → final CTA → footer. The hero renders its own
 * sticky top nav whose links anchor the section ids below (#platform,
 * #how-it-works, #integrations, #operators, #faq). Renders standalone — the
 * root layout applies no app chrome at "/".
 */

export const metadata = {
  title: "repulabs — Run your reputation like a system.",
  description:
    "The reputation OS for local teams. Reviews, AI replies, requests, a unified inbox, AI phone, social, local SEO and autopilot — one premium workspace that keeps every customer moment on brand and on time.",
};

export default function LandingPage() {
  return (
    <main className="overflow-x-clip bg-white">
      <LandingHero />
      <LandingWorkspace />
      <LandingSteps />
      <LandingIntegrations />
      <LandingLocations />
      <LandingFaq />
      <LandingReady />
      <MarketingFooter />
    </main>
  );
}
