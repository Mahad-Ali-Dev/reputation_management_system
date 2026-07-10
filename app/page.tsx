import { MarketingFooter } from "@/components/landing/marketing-shell";
import { LandingAiRobot } from "@/components/landing/sections/ai-robot";
import { LandingCommandCenter } from "@/components/landing/sections/command-center";
import { LandingFaq } from "@/components/landing/sections/faq";
import { LandingFrames } from "@/components/landing/sections/frames";
import { LandingHero } from "@/components/landing/sections/hero";
import { LandingIntegrations } from "@/components/landing/sections/integrations";
import { LandingLocations } from "@/components/landing/sections/locations";
import { LandingMetricsCards } from "@/components/landing/sections/metrics-cards";
import { LandingReady } from "@/components/landing/sections/ready";
import { LandingSteps } from "@/components/landing/sections/steps";
import { LandingTour } from "@/components/landing/sections/tour";
import { LandingWorkspace } from "@/components/landing/sections/workspace";

/**
 * Marketing home ("/") — the animated repulabs landing page, LIGHT theme.
 *
 * Every component from the founder's `hero section.txt` kit is in play:
 *   - Hero        → RotatingText headline, DotGrid canvas, ShinyText CTA,
 *                   NavLink dropdown + AnimatedNavLink underline in the nav
 *   - Workspace   → mockup platform grid (Reveal/Float primitives)
 *   - Tour        → the parallax scroll Component (clip-path screenshot reveals)
 *   - Steps       → mockup 3-step cards
 *   - MetricsCards→ AnimatedCard + CardVisual + Visual3 hover-layer cards
 *   - CommandCtr  → WorldMap (dotted-map arcs) + MonitoringChart (recharts) +
 *                   message-feed card + FeatureCards
 *   - Integrations→ THE single integrations section: the founder's orbit visual
 *                   (center disc + spinning rings) + the IntegrationHero dual
 *                   marquee + marketplace callout — grid and standalone orbit
 *                   sections merged away so integrations appear exactly once
 *   - Locations   → mockup operators section
 *   - AiRobot     → the three.js RobotHero scene (lazy, ssr:false)
 *   - Frames      → DynamicFrameLayout hover-expand product grid
 *   - Faq / Ready → mockup accordion + dark CTA (DotPattern texture)
 *
 * Nav anchors: #platform #how-it-works #integrations #operators #faq (hero nav)
 * plus #command #tour #explore #ai for the dropdown/deep links.
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
      <LandingTour />
      <LandingSteps />
      <LandingMetricsCards />
      <LandingCommandCenter />
      <LandingIntegrations />
      <LandingLocations />
      <LandingAiRobot />
      <LandingFrames />
      <LandingFaq />
      <LandingReady />
      <MarketingFooter />
    </main>
  );
}
