import { LandingAiRobot } from "@/components/landing/sections/ai-robot";
import { LandingCommandCenter } from "@/components/landing/sections/command-center";
import { LandingFaq } from "@/components/landing/sections/faq";
import { LandingFooterDark } from "@/components/landing/sections/footer-dark";
import { LandingFrames } from "@/components/landing/sections/frames";
import { LandingHero } from "@/components/landing/sections/hero";
import { LandingIntegrations } from "@/components/landing/sections/integrations";
import { LandingLocations } from "@/components/landing/sections/locations";
import { LandingReady } from "@/components/landing/sections/ready";
import { LandingSteps } from "@/components/landing/sections/steps";
import { LandingTour } from "@/components/landing/sections/tour";
import { LandingWorkspace } from "@/components/landing/sections/workspace";

/**
 * Marketing home ("/") — ONE dark cinematic canvas (#070b16).
 *
 * Rebuilt around the founder's hero-kit components in their native dark theme:
 * a centered InteractiveHero-style opener (RotatingText + DotGrid + email
 * capture), a command-center bento (WorldMap, inbox feed, recharts, Visual3
 * metric cells), a parallax product tour that closes with the hover-expand
 * frames grid, ONE consolidated integrations section (orbit + marquee — the
 * old logo grid and standalone orbit/metrics sections are merged away), the
 * three.js robot, and a dark closing run (operators, FAQ, glowing CTA, footer).
 *
 * Anchors: #top #platform #tour #explore #how-it-works #command #integrations
 * #operators #ai #faq #cta.
 */

export const metadata = {
  title: "repulabs — Run your reputation like a system.",
  description:
    "The reputation OS for local teams. Reviews, AI replies, requests, a unified inbox, AI phone, social, local SEO and autopilot — one premium workspace that keeps every customer moment on brand and on time.",
};

export default function LandingPage() {
  return (
    <main className="overflow-x-clip" style={{ background: "#070b16" }}>
      <LandingHero />
      <LandingWorkspace />
      <LandingTour />
      <LandingFrames />
      <LandingSteps />
      <LandingCommandCenter />
      <LandingIntegrations />
      <LandingLocations />
      <LandingAiRobot />
      <LandingFaq />
      <LandingReady />
      <LandingFooterDark />
    </main>
  );
}
